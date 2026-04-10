import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { LinkedInButton } from "./linkedin-button";
import { AuthError } from "./auth-error";

export const metadata: Metadata = {
  title: "Log In — Auto-Linked",
};

export default function LoginPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Log in to your Auto-Linked account
        </p>
      </div>

      <AuthError />

      <LinkedInButton mode="signin" />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs text-[var(--text-muted)]">OR</span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <LoginForm />

      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-semibold text-brand-primary hover:underline"
        >
          Sign up
        </Link>
      </p>
    </>
  );
}
