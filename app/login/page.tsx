import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/admin/LoginForm";
import { ErrorMessage } from "@/components/shared/ErrorMessage";
import { brand } from "@/config/brand";
import { copy } from "@/config/copy";

export const metadata: Metadata = {
  title: copy.login.title,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <Link
            href="/"
            className="font-heading text-2xl font-bold tracking-tight text-primary"
          >
            {brand.name}
          </Link>
          <p className="text-sm text-text-muted">{copy.nav.login}</p>
        </div>

        <div className="space-y-6 rounded-xl border border-border bg-surface-card p-8 shadow-[var(--shadow-card)]">
          <div className="space-y-1">
            <h1 className="font-heading text-lg font-semibold text-text-primary">
              {copy.login.title}
            </h1>
            <p className="text-sm text-text-secondary">{copy.login.subtitle}</p>
          </div>

          {error === "unauthorized" && (
            <ErrorMessage message={copy.login.unauthorized} />
          )}

          <LoginForm />
        </div>

        <p className="text-center text-xs text-text-muted">
          <Link
            href="/"
            className="underline underline-offset-4 transition-colors hover:text-text-secondary"
          >
            {copy.login.backHome}
          </Link>
        </p>
      </div>
    </main>
  );
}
