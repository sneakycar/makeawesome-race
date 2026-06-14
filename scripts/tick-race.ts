#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { runTickPipeline } from "../lib/race-logic";

async function main() {
  console.log("[tick-race] starting...");
  const supabase = createAdminClient();
  await runTickPipeline(supabase);
  console.log("[tick-race] complete.");
}

main().catch((err) => {
  console.error("[tick-race] failed:", err);
  process.exit(1);
});
