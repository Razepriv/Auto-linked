import type { Metadata } from "next";
import { ProfileContent } from "./profile-content";

export const metadata: Metadata = {
  title: "Profile Settings",
};

export default function ProfileSettingsPage() {
  return <ProfileContent />;
}
