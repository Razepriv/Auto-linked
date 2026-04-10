"use client";

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)]",
} as const;

type ModalSize = keyof typeof SIZE_STYLES;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  title?: string;
  children: ReactNode;
}

function Modal({ open, onClose, size = "md", title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else {
      dialog.close();
      previousFocusRef.current?.focus();
    }
  }, [open]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "animate-scale-in m-auto rounded-xl border bg-[var(--surface)] p-0 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        SIZE_STYLES[size],
        "w-full",
      )}
      onClick={handleBackdropClick}
      onCancel={handleCancel}
      aria-label={title ?? "Dialog"}
    >
      <div className="flex flex-col">
        {title ? (
          <ModalHeader>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              aria-label="Close dialog"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M12.5 3.5L3.5 12.5M3.5 3.5L12.5 12.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </ModalHeader>
        ) : null}
        <div className="p-6">{children}</div>
      </div>
    </dialog>
  );
}

function ModalHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function ModalFooter({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-6 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Modal, ModalHeader, ModalFooter, type ModalProps, type ModalSize };
