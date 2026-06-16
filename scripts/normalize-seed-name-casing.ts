#!/usr/bin/env tsx
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { SEED_ACTIVE_NAMES } from "../lib/name-generator";
import { slugify } from "../lib/format";

const FIXED_NAMES: Record<string, string> = {
  walhof: "walhof",
  "chris-vogel": "chris vogel",
};

async function main() {
  const supabase = createAdminClient();
  const targets = new Map<string, string>();

  for (const name of SEED_ACTIVE_NAMES) {
    targets.set(slugify(name), name);
  }
  for (const [slug, name] of Object.entries(FIXED_NAMES)) {
    targets.set(slug, name);
  }

  for (const [slug, name] of targets) {
    const { data, error } = await supabase
      .from("players")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("slug", slug)
      .neq("name", name)
      .select("id, name, slug");

    if (error) throw error;
    if (data?.length) {
      console.log(`[normalize-names] ${slug} → ${name}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
