import type { Metadata } from "next";
import { PillarsContent } from "./pillars-content";

export const metadata: Metadata = {
  title: "Content Pillars",
};

export default function PillarsSettingsPage() {
  return <PillarsContent />;
}
