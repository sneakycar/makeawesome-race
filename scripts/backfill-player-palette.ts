import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createAdminClient } from "../lib/supabase/admin";
import { generatePlayerPalette } from "../lib/player-colors";

async function main() {
  const supabase = createAdminClient();
  console.log("[backfill-player-palette] regenerating all team palettes...");

  const { data: players, error } = await supabase
    .from("players")
    .select("id, name, seed, palette_colors")
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!players?.length) {
    console.log("[backfill-player-palette] no players found");
    return;
  }

  let updated = 0;
  for (const player of players) {
    const palette = generatePlayerPalette(player.seed);
    const { error: updateErr } = await supabase
      .from("players")
      .update({
        palette_colors: palette,
        updated_at: new Date().toISOString(),
      })
      .eq("id", player.id);

    if (updateErr) throw updateErr;
    updated += 1;
    const before = (player.palette_colors ?? []).join(" ") || "(none)";
    console.log(`  ${player.name}`);
    console.log(`    was: ${before}`);
    console.log(`    now: ${palette.join(" ")}`);
  }

  console.log(`[backfill-player-palette] updated ${updated} players`);
}

main().catch((err) => {
  console.error("[backfill-player-palette] failed:", err);
  process.exit(1);
});
