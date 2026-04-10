import { forwardRef, useState, type ImgHTMLAttributes } from "react";
import { cn, getInitials } from "@/lib/utils";

const SIZE_STYLES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
} as const;

type AvatarSize = keyof typeof SIZE_STYLES;

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "size"> {
  name: string;
  src?: string;
  size?: AvatarSize;
}

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ name, src, size = "md", className, ...imgProps }, ref) => {
    const [imageError, setImageError] = useState(false);
    const initials = getInitials(name);
    const showFallback = !src || imageError;

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          SIZE_STYLES[size],
          showFallback
            ? "bg-[var(--brand-primary-light)] text-[var(--brand-primary)]"
            : "",
          className,
        )}
        title={name}
      >
        {showFallback ? (
          <span className="font-semibold" aria-hidden="true">
            {initials}
          </span>
        ) : (
          <img
            src={src}
            alt={name}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
            {...imgProps}
          />
        )}
        <span className="sr-only">{name}</span>
      </div>
    );
  },
);

Avatar.displayName = "Avatar";

export { Avatar, type AvatarProps, type AvatarSize };
