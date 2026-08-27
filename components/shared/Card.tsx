import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({
  hoverable = false,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "bg-surface-card rounded-xl border border-border",
        "shadow-[var(--shadow-card)]",
        hoverable
          ? "transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)] cursor-pointer"
          : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-5 pt-5 pb-4 border-b border-border-subtle ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-5 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-5 py-4 border-t border-border-subtle bg-surface-subtle/50 rounded-b-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
