"use client";

import { useRouter } from "next/navigation";
import { StatsOverlay } from "@/app/components/stats-overlay";

export default function StatsPage() {
  const router = useRouter();
  return <StatsOverlay onClose={() => router.push("/")} />;
}
