"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface OnboardingContextValue {
  currentStep: number;
  setCurrentStep: (step: number) => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  currentStep: 1,
  setCurrentStep: () => {},
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState(1);
  return (
    <OnboardingContext.Provider value={{ currentStep, setCurrentStep }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingStep() {
  return useContext(OnboardingContext);
}
