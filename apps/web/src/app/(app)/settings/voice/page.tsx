import type { Metadata } from "next";
import { VoiceContent } from "./voice-content";

export const metadata: Metadata = {
  title: "Voice & Style Settings",
};

export default function VoiceSettingsPage() {
  return <VoiceContent />;
}
