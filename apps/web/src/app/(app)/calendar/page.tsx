import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/PageHeader";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = {
  title: "Content Calendar",
};

export default function CalendarPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Content Calendar"
        description="View and manage your publishing schedule"
        actions={
          <button type="button" className="btn-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add Post
          </button>
        }
      />

      <CalendarView />
    </div>
  );
}
