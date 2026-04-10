import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const PILLAR_COLORS: Record<string, string> = {
  blue: "bg-pillar-blue",
  purple: "bg-pillar-purple",
  pink: "bg-pillar-pink",
  amber: "bg-pillar-amber",
  emerald: "bg-pillar-emerald",
};

const PILLAR_TEXT_COLORS: Record<string, string> = {
  blue: "text-pillar-blue",
  purple: "text-pillar-purple",
  pink: "text-pillar-pink",
  amber: "text-pillar-amber",
  emerald: "text-pillar-emerald",
};

export function getPillarColor(color: string): string {
  return PILLAR_COLORS[color] ?? "bg-gray-500";
}

export function getPillarTextColor(color: string): string {
  return PILLAR_TEXT_COLORS[color] ?? "text-gray-500";
}
