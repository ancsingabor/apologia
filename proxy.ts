import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Admin route protection (Next.js 16 Proxy — the renamed `middleware`).
 * First layer of the proxy + server-side double guard: it verifies the Supabase
 * session and `admin_users` allowlist on every admin request, and forwards the
 * role as an `x-admin-role` header.
 *
 * EDIT PER PROJECT: list the path prefixes that make up your admin area.
 */
const ADMIN_ROUTES = ["/dashboard"];

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTES.some((route) => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through: login, API routes, static assets.
  if (pathname.startsWith("/login") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (!isAdminRoute(pathname)) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of supabaseResponse.cookies.getAll()) {
      response.cookies.set(cookie.name, cookie.value, cookie);
    }
    return response;
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("role")
    .eq("email", user.email)
    .single();

  if (!adminUser) {
    const response = NextResponse.redirect(
      new URL("/login?error=unauthorized", request.url)
    );
    for (const cookie of supabaseResponse.cookies.getAll()) {
      response.cookies.set(cookie.name, cookie.value, cookie);
    }
    return response;
  }

  supabaseResponse.headers.set("x-admin-role", adminUser.role);

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
