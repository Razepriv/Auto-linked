import Link from "next/link";
import type { ReactNode } from "react";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Manage your account, content pillars, and publishing schedule
        </p>
      </div>

      <SettingsTabs />

      <div>{children}</div>
    </div>
  );
}
