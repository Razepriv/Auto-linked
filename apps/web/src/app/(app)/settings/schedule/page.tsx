import type { Metadata } from "next";
import { ScheduleContent } from "./schedule-content";

export const metadata: Metadata = {
  title: "Schedule Settings",
};

export default function ScheduleSettingsPage() {
  return <ScheduleContent />;
}
