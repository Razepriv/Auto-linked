import type { Metadata } from "next";
import { QueueContent } from "./queue-content";

export const metadata: Metadata = {
  title: "Review Queue",
};

export default function QueuePage() {
  return <QueueContent />;
}
