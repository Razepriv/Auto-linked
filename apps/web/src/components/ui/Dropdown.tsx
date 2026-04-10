"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}

function Dropdown({ trigger, children, align = "right", className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button type="button" onClick={() => setOpen((prev) => !prev)}>
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            "animate-scale-in absolute z-50 mt-1 min-w-[160px] rounded-lg border bg-[var(--surface-raised)] py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick: () => void;
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}

function DropdownItem({
  onClick,
  children,
  destructive = false,
  disabled = false,
  className,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        destructive
          ? "text-[var(--color-error)] hover:bg-[var(--color-error-light)]"
          : "text-[var(--text-primary)] hover:bg-[var(--surface)]",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface DropdownSeparatorProps {
  className?: string;
}

function DropdownSeparator({ className }: DropdownSeparatorProps) {
  return (
    <div
      className={cn("my-1 h-px bg-[var(--border-subtle)]", className)}
      role="separator"
    />
  );
}

export {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  type DropdownProps,
  type DropdownItemProps,
};
