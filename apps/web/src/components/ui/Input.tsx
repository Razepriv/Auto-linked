import { forwardRef, type InputHTMLAttributes, useId } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const errorId = error ? `${id}-error` : undefined;
    const helperId = helperText ? `${id}-helper` : undefined;
    const describedBy = [errorId, helperId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={id}
            className="text-sm font-medium leading-none text-[var(--text-primary)]"
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={id}
          className={cn(
            "flex h-10 w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm transition-colors",
            "placeholder:text-[var(--text-muted)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-color)] focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-[var(--color-error)] focus-visible:ring-[var(--color-error)]"
              : "border-[var(--border)]",
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {error ? (
          <p id={errorId} className="text-xs text-[var(--color-error)]" role="alert">
            {error}
          </p>
        ) : null}
        {helperText && !error ? (
          <p id={helperId} className="text-xs text-[var(--text-muted)]">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input, type InputProps };
