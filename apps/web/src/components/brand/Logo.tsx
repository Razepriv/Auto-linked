import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const ICON_SIZE = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

const TEXT_SIZE = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
} as const;

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex flex-shrink-0 items-center justify-center rounded-lg bg-brand-primary",
          ICON_SIZE[size],
        )}
      >
        <span className="font-bold text-white">AL</span>
      </div>
      {showText && (
        <span className={cn("font-bold text-[var(--text-primary)]", TEXT_SIZE[size])}>
          Auto-Linked
        </span>
      )}
    </div>
  );
}
