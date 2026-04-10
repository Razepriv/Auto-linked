import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingContent } from "./billing-content";

export const metadata: Metadata = {
  title: "Billing",
};

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}
