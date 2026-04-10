import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "./signup-form";
import { LinkedInButton } from "../login/linkedin-button";
import { AuthError } from "../login/auth-error";

export const metadata: Metadata = {
  title: "Sign Up — Auto-Linked",
};

export default function SignupPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Start building your LinkedIn brand with AI
        </p>
      </div>

      <AuthError />

      <LinkedInButton mode="signup" />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="text-xs text-[var(--text-muted)]">OR</span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <SignupForm />

      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-primary hover:underline"
        >
          Log in
        </Link>
      </p>
    </>
  );
}
