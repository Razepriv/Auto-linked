import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Width as a Tailwind class or inline style */
  width?: string;
  /** Height as a Tailwind class or inline style */
  height?: string;
  /** Render as circle */
  circle?: boolean;
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, width, height, circle = false, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "animate-shimmer bg-gradient-to-r from-[var(--surface-sunken)] via-[var(--surface-raised)] to-[var(--surface-sunken)] bg-[length:200%_100%]",
        circle ? "rounded-full" : "rounded-md",
        className,
      )}
      style={{
        width: width ?? undefined,
        height: height ?? undefined,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  ),
);

Skeleton.displayName = "Skeleton";

function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText, type SkeletonProps };
