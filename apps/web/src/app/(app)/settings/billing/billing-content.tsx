"use client";

import { trpc } from "@/lib/trpc";
import { useSearchParams } from "next/navigation";
import { PLAN_LIMITS, PLAN_DISPLAY_NAMES } from "@auto-linked/shared";
import type { Plan } from "@auto-linked/shared";
import { Alert } from "@/components/ui/Alert";

export function BillingContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "true";
  const cancelled = searchParams.get("cancelled") === "true";

  const billingStatus = trpc.billing.status.useQuery();
  const createCheckout = trpc.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
  const createPortal = trpc.billing.createPortalSession.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const currentPlan = (billingStatus.data?.plan ?? "free") as Plan;
  const billingEnabled = billingStatus.data?.billingEnabled ?? true;
  const limits = PLAN_LIMITS[currentPlan];
  const isSelfHosted = currentPlan === "self-hosted";
  const isPaid = currentPlan !== "free" && !isSelfHosted;

  return (
    <div className="space-y-8">
      {success && (
        <Alert variant="success">
          Subscription activated successfully! Welcome to {PLAN_DISPLAY_NAMES[currentPlan]}.
        </Alert>
      )}
      {cancelled && (
        <Alert variant="warning">
          Checkout was cancelled. You can try again anytime.
        </Alert>
      )}

      {/* Self-hosted banner */}
      {isSelfHosted && (
        <Alert variant="info">
          Self-hosted instance — all features are unlocked. No payment required.
        </Alert>
      )}

      {/* Current plan */}
      <div className="card">
        <h2 className="text-lg font-semibold">Current Plan</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {isSelfHosted
            ? "You're running a self-hosted instance with all features unlocked."
            : "Manage your subscription and billing details."}
        </p>

        <div className="mt-6 flex items-center justify-between rounded-lg border bg-brand-primary/5 p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{PLAN_DISPLAY_NAMES[currentPlan]} Plan</span>
              <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-primary">
                Active
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {isSelfHosted
                ? "Everything is unlimited"
                : isPaid
                  ? "Manage your subscription via Stripe"
                  : "Upgrade to unlock more features"}
            </p>
          </div>
          {isPaid && billingEnabled ? (
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => createPortal.mutate()}
              disabled={createPortal.isPending}
            >
              {createPortal.isPending ? "Loading..." : "Manage Subscription"}
            </button>
          ) : null}
        </div>

        {/* Usage */}
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold">Plan Limits</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Posts per week</span>
              <span className="font-medium">{limits.postsPerWeek === Infinity ? "Unlimited" : limits.postsPerWeek}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Images per month</span>
              <span className="font-medium">{limits.imagesPerMonth === Infinity ? "Unlimited" : limits.imagesPerMonth}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Analytics</span>
              <span className="font-medium">{limits.analytics ? "Included" : "Not included"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Team members</span>
              <span className="font-medium">{limits.teamMembers === Infinity ? "Unlimited" : limits.teamMembers}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade options — only when billing is enabled and user is on free */}
      {billingEnabled && !isPaid && !isSelfHosted && (
        <div className="card">
          <h2 className="text-lg font-semibold">Upgrade Your Plan</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {(["pro", "team"] as const).map((plan) => (
              <div key={plan} className="rounded-lg border p-6">
                <h3 className="text-lg font-bold">{PLAN_DISPLAY_NAMES[plan]}</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {plan === "pro" ? "For individual creators" : "For teams and agencies"}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li>Unlimited posts/week</li>
                  <li>{PLAN_LIMITS[plan].imagesPerMonth} images/month</li>
                  <li>Full analytics</li>
                  <li>{PLAN_LIMITS[plan].teamMembers} team member{PLAN_LIMITS[plan].teamMembers > 1 ? "s" : ""}</li>
                </ul>
                <div className="mt-6 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary flex-1 text-sm"
                    onClick={() => createCheckout.mutate({ plan, interval: "monthly" })}
                    disabled={createCheckout.isPending}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className="btn-secondary flex-1 text-sm"
                    onClick={() => createCheckout.mutate({ plan, interval: "yearly" })}
                    disabled={createCheckout.isPending}
                  >
                    Yearly (Save 20%)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage via Stripe portal */}
      {isPaid && billingEnabled && (
        <div className="card">
          <h2 className="text-lg font-semibold">Payment & Invoices</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manage your payment method, download invoices, and update billing details via Stripe.
          </p>
          <div className="mt-6">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => createPortal.mutate()}
              disabled={createPortal.isPending}
            >
              {createPortal.isPending ? "Loading..." : "Open Billing Portal"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
