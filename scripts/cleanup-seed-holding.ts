#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  console.log("[cleanup-seed-holding] starting...");
  const supabase = createAdminClient();

  const { data: candidates, error: listErr } = await supabase
    .from("players")
    .select("id, name, seed")
    .eq("status", "holding")
    .eq("races", 0);
  if (listErr) throw listErr;

  const toRemove = (candidates ?? []).filter(
    (p) => !String(p.seed).startsWith("holding-reserve-")
  );
  if (!toRemove.length) {
    console.log("[cleanup-seed-holding] nothing to remove");
    return;
  }

  const { data, error } = await supabase
    .from("players")
    .delete()
    .in(
      "id",
      toRemove.map((p) => p.id)
    )
    .select("id, name");

  if (error) throw error;

  console.log(`[cleanup-seed-holding] removed ${data?.length ?? 0} un raced holding players`);
  if (data?.length) {
    for (const p of data) {
      console.log(`  - ${p.name}`);
    }
  }
  console.log("[cleanup-seed-holding] complete.");
}

main().catch((err) => {
  console.error("[cleanup-seed-holding] failed:", err);
  process.exit(1);
});
