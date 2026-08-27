import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import type { AdminUser } from "@/types/domain";
import type { AdminRole } from "@/types/db";

export async function getAdminUser(): Promise<AdminUser | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await supabase
    .from("admin_users")
    .select("id, email, role")
    .eq("email", user.email)
    .single();

  if (!data) return null;

  return { id: data.id, email: data.email, role: data.role as AdminRole };
}

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");
  return admin;
}

export async function requireAdminRole(): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (admin.role !== "admin") redirect("/dashboard");
  return admin;
}
