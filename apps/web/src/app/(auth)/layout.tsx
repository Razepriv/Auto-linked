import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-raised)] px-4">
      <div className="mb-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary">
            <span className="text-lg font-bold text-white">AL</span>
          </div>
          <span className="text-xl font-bold">Auto-Linked</span>
        </Link>
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-2xl border bg-[var(--surface)] p-8 shadow-lg">
          {children}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-[var(--text-muted)]">
        By continuing, you agree to our{" "}
        <Link href="#" className="underline hover:text-[var(--text-secondary)]">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="#" className="underline hover:text-[var(--text-secondary)]">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
