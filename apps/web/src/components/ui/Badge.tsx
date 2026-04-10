import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  draft: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--border)]",
  approved:
    "bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success-border)]",
  published:
    "bg-[var(--brand-primary-light)] text-[var(--brand-primary)] border-[var(--color-info-border)]",
  scheduled:
    "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning-border)]",
  failed:
    "bg-[var(--color-error-light)] text-[var(--color-error)] border-[var(--color-error-border)]",
  info: "bg-[var(--color-info-light)] text-[var(--color-info)] border-[var(--color-info-border)]",
  success:
    "bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success-border)]",
  warning:
    "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning-border)]",
  error:
    "bg-[var(--color-error-light)] text-[var(--color-error)] border-[var(--color-error-border)]",
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--border)]",
} as const;

type BadgeStatus = keyof typeof STATUS_STYLES;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, status = "neutral", children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  ),
);

Badge.displayName = "Badge";

export { Badge, type BadgeProps, type BadgeStatus };
