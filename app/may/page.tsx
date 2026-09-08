import type { Metadata } from "next";
import MayExperience from "@/components/may/MayExperience";

export const metadata: Metadata = {
  title: "May — Digital Consciousness",
  description: "May's real-time humanoid particle avatar interface.",
};

export default function MayPage() {
  return <MayExperience />;
}
