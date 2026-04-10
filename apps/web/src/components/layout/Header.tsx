"use client";

import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

export function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header className="flex h-16 items-center justify-between border-b bg-[var(--surface)] px-4 sm:px-6">
      <div className="flex items-center gap-3">
        {/* Sidebar toggle */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] lg:block"
          aria-label="Toggle sidebar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>

        {/* Mobile logo */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary">
            <span className="text-sm font-bold text-white">AL</span>
          </div>
          <span className="font-bold">Auto-Linked</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Generate button */}
        <button type="button" className="btn-primary hidden sm:inline-flex">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            />
          </svg>
          Generate Posts
        </button>

        {/* Notifications */}
        <button
          type="button"
          className="relative rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
          aria-label="Notifications"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
            />
          </svg>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* User avatar */}
        <button
          type="button"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary/20",
          )}
          aria-label="User menu"
        >
          JS
        </button>
      </div>
    </header>
  );
}
