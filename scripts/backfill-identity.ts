import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { generateIdentity } from "../lib/identity";

async function main() {
  const supabase = createAdminClient();
  console.log("[backfill-identity] starting...");

  const { data: players, error } = await supabase
    .from("players")
    .select("id, seed, archetype")
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!players?.length) {
    console.log("[backfill-identity] no players found");
    return;
  }

  let updated = 0;
  for (const player of players) {
    if (player.archetype && player.archetype !== "UNKNOWN") continue;

    const identity = generateIdentity(player.seed);
    const { error: updateErr } = await supabase
      .from("players")
      .update({
        archetype: identity.archetype,
        traits: identity.traits,
        signature_stat: identity.signature_stat,
        updated_at: new Date().toISOString(),
      })
      .eq("id", player.id);

    if (updateErr) throw updateErr;
    updated += 1;
    console.log(`  ${player.id.slice(0, 8)} → ${identity.archetype} / ${identity.traits.join(", ")} / ${identity.signature_stat}`);
  }

  console.log(`[backfill-identity] updated ${updated} players`);
}

main().catch((err) => {
  console.error("[backfill-identity] failed:", err);
  process.exit(1);
});
