import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-primary"
          >
            {label}
            {props.required && (
              <span className="ml-0.5 text-status-no-show">*</span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            "h-10 w-full rounded-lg border px-3 text-sm",
            "bg-surface-card text-text-primary placeholder:text-text-muted",
            "transition-colors duration-150",
            error
              ? "border-status-no-show focus:border-status-no-show focus:ring-2 focus:ring-red-100"
              : "border-border focus:border-border-focus focus:ring-2 focus:ring-primary-subtle",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "outline-none",
            className,
          ].join(" ")}
          {...props}
        />
        {error && <p className="text-xs text-status-no-show">{error}</p>}
        {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
