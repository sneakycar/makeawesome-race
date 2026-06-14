#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  console.log("[cleanup-seed-holding] starting...");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("players")
    .delete()
    .eq("status", "holding")
    .eq("races", 0)
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
