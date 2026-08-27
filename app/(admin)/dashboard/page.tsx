import { requireAdmin } from "@/lib/auth";
import { Card, CardBody } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { brand } from "@/config/brand";
import { copy } from "@/config/copy";

/**
 * Minimal admin landing page. Demonstrates the server-side guard
 * (`requireAdmin()` re-checks the allowlist independently of the proxy) and
 * the themed card layout. Build out real admin views under `app/(admin)/`.
 */
export default async function DashboardPage() {
  const admin = await requireAdmin();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-sm text-text-muted">{brand.name}</p>
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          {copy.admin.dashboardTitle}
        </h1>
      </header>

      <Card>
        <CardBody className="space-y-3">
          <p className="text-base text-text-primary">
            {copy.admin.welcome}.
          </p>
          <div className="flex flex-col gap-1 text-sm text-text-secondary">
            <span>
              {copy.admin.signedInAs}{" "}
              <strong className="text-text-primary">{admin.email}</strong>
            </span>
            <span className="flex items-center gap-2">
              {copy.admin.role}:
              <Badge variant={admin.role === "admin" ? "primary" : "muted"}>
                {admin.role}
              </Badge>
            </span>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
