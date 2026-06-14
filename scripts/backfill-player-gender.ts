import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { resolvePlayerGender } from "../lib/player-gender";

async function main() {
  const supabase = createAdminClient();
  console.log("[backfill-player-gender] assigning gender for all players...");

  const { data: players, error } = await supabase
    .from("players")
    .select("id, name, slug, seed, gender")
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!players?.length) {
    console.log("[backfill-player-gender] no players found");
    return;
  }

  let updated = 0;
  for (const player of players) {
    const gender = resolvePlayerGender(player.slug, player.seed);
    if (player.gender === gender) continue;

    const { error: updateErr } = await supabase
      .from("players")
      .update({
        gender,
        updated_at: new Date().toISOString(),
      })
      .eq("id", player.id);

    if (updateErr) throw updateErr;
    updated += 1;
    console.log(`  ${player.name} (${player.slug}) → ${gender}`);
  }

  console.log(`[backfill-player-gender] updated ${updated} players`);
}

main().catch((err) => {
  console.error("[backfill-player-gender] failed:", err);
  process.exit(1);
});
