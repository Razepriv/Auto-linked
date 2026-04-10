"use client";

import { useSearchParams } from "next/navigation";

const errorMessages: Record<string, string> = {
  OAuthSignin: "Could not start LinkedIn sign-in. Please try again.",
  OAuthCallback: "LinkedIn sign-in failed. Please try again.",
  OAuthAccountNotLinked:
    "This email is already associated with another sign-in method.",
  EmailSignin: "Could not send the sign-in email. Please try again.",
  CredentialsSignin: "Invalid credentials. Please try again.",
  SessionRequired: "Please sign in to access this page.",
  Default: "An unexpected error occurred. Please try again.",
};

export function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  if (!error) return null;

  const message = errorMessages[error] ?? errorMessages.Default;

  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
      {message}
    </div>
  );
}
