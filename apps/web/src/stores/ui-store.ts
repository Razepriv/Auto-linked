import { create } from "zustand";

type CalendarView = "week" | "month";

interface UiState {
  sidebarOpen: boolean;
  calendarView: CalendarView;
  mobileNavOpen: boolean;
}

interface UiActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCalendarView: (view: CalendarView) => void;
  setMobileNavOpen: (open: boolean) => void;
}

type UiStore = UiState & UiActions;

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: true,
  calendarView: "week",
  mobileNavOpen: false,

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setCalendarView: (view) => set({ calendarView: view }),

  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));
