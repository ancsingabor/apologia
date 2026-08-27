import Link from "next/link";
import { Card, CardBody } from "@/components/shared/Card";
import { brand } from "@/config/brand";
import { copy } from "@/config/copy";

export default function HomePage() {
  const { landing, nav, footer } = copy;

  return (
    <main className="flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <span className="font-heading text-lg font-bold tracking-tight text-primary">
            {brand.name}
          </span>
          <Link
            href="/login"
            className="text-sm font-medium text-text-secondary transition-colors hover:text-primary"
          >
            {nav.login}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="max-w-2xl">
          <h1 className="font-heading text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
            {landing.heroTitle}
          </h1>
          <p className="mt-5 text-lg text-text-secondary">
            {landing.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-medium text-text-inverted shadow-sm transition-colors hover:bg-primary-hover"
            >
              {landing.primaryCta}
            </Link>
            <a
              href="#features"
              className="inline-flex h-11 items-center rounded-lg border border-border bg-surface-card px-6 text-sm font-medium text-text-primary transition-colors hover:bg-surface-subtle"
            >
              {landing.secondaryCta}
            </a>
          </div>
        </div>
      </section>

      {/* Features — bento-ish grid */}
      <section
        id="features"
        className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8"
      >
        <h2 className="font-heading text-2xl font-semibold text-text-primary">
          {landing.featuresTitle}
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {landing.features.map((f) => (
            <Card key={f.title} hoverable>
              <CardBody>
                <h3 className="font-heading text-base font-semibold text-text-primary">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {f.body}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-surface-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-8 text-sm text-text-muted sm:px-6 lg:px-8">
          <span>
            © {new Date().getFullYear()} {brand.name}. {footer.rights}
          </span>
          {brand.contact.email && <span>{brand.contact.email}</span>}
        </div>
      </footer>
    </main>
  );
}
