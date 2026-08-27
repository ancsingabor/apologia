import { type TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
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
        <textarea
          ref={ref}
          id={inputId}
          className={[
            "w-full rounded-lg border px-3 py-2.5 text-sm",
            "bg-surface-card text-text-primary placeholder:text-text-muted",
            "transition-colors duration-150 resize-y min-h-[100px]",
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

Textarea.displayName = "Textarea";
