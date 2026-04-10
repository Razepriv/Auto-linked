"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { OnboardingProvider, useOnboardingStep } from "./onboarding-context";

const STEPS = [
  { label: "Profile", step: 1 },
  { label: "Connect", step: 2 },
  { label: "Import", step: 3 },
  { label: "Voice", step: 4 },
];

function StepIndicator() {
  const { currentStep } = useOnboardingStep();

  return (
    <div className="border-b bg-[var(--surface)]">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    step.step < currentStep
                      ? "bg-brand-secondary text-white"
                      : step.step === currentStep
                        ? "bg-brand-primary text-white"
                        : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
                  }`}
                >
                  {step.step < currentStep ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                      className="h-4 w-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    step.step
                  )}
                </div>
                <span className="mt-1 text-[10px] font-medium text-[var(--text-secondary)] sm:text-xs">
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 hidden h-0.5 w-16 sm:block lg:w-24 ${
                    step.step < currentStep
                      ? "bg-brand-secondary"
                      : "bg-[var(--border)]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <OnboardingProvider>
      <div className="flex min-h-screen flex-col">
        {/* Minimal header */}
        <header className="border-b bg-[var(--surface)]">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary">
                <span className="text-sm font-bold text-white">AL</span>
              </div>
              <span className="font-bold">Auto-Linked</span>
            </Link>

            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/dashboard")}
            >
              Skip for now
            </button>
          </div>
        </header>

        {/* Progress bar */}
        <StepIndicator />

        {/* Content */}
        <main className="flex-1 px-4 py-10">
          <div className="mx-auto max-w-2xl">{children}</div>
        </main>
      </div>
    </OnboardingProvider>
  );
}
