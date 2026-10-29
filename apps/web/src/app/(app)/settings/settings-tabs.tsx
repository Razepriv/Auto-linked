"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { label: string; href: Route }[] = [
  { label: "Profile", href: "/settings/profile" as Route },
  { label: "Voice & Style", href: "/settings/voice" as Route },
  { label: "Content Pillars", href: "/settings/pillars" as Route },
  { label: "Schedule", href: "/settings/schedule" as Route },
  { label: "Billing", href: "/settings/billing" as Route },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
              isActive
                ? "text-brand-primary"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
