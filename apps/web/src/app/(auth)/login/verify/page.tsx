import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check Your Email — Auto-Linked",
};

export default function VerifyRequestPage() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
        <svg
          className="h-7 w-7 text-blue-600 dark:text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold">Check your email</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
        A sign-in link has been sent to your email address. Click the link in
        the email to sign in to your account.
      </p>

      <div className="mt-6 space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Didn&apos;t receive the email? Check your spam folder or{" "}
          <Link
            href="/login"
            className="font-medium text-brand-primary hover:underline"
          >
            try again
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
