export type BadgeVariant =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "muted";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-surface-subtle text-text-secondary border-border",
  primary: "bg-primary-subtle text-primary border-primary-border",
  secondary: "bg-secondary-subtle text-secondary-dark border-secondary",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  error: "bg-red-50 text-red-600 border-red-200",
  muted: "bg-surface-subtle text-text-muted border-border-subtle",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
        "text-xs font-medium border",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

/**
 * Generic status badge. Per project, define your own status → variant + label
 * maps (often driven by the copy layer) and pass them in, or wrap this in a
 * domain-specific component (e.g. `AppointmentStatusBadge`).
 */
export function StatusBadge({
  label,
  variant = "default",
}: {
  label: string;
  variant?: BadgeVariant;
}) {
  return <Badge variant={variant}>{label}</Badge>;
}
