"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  readonly value: string;
  readonly label: string;
}

interface TabsProps {
  tabs: readonly Tab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        "flex gap-1 rounded-lg bg-[var(--surface-sunken)] p-1",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab.value === value
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface TabPanelProps {
  value: string;
  activeValue: string;
  children: ReactNode;
  className?: string;
}

function TabPanel({ value, activeValue, children, className }: TabPanelProps) {
  if (value !== activeValue) return null;
  return (
    <div role="tabpanel" className={cn("animate-fade-in", className)}>
      {children}
    </div>
  );
}

export { Tabs, TabPanel, type TabsProps, type TabPanelProps, type Tab };
