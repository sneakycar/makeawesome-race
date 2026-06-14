import { seededPick } from "./seeded-rng";
import type { Player, RaceEntry } from "./types";

export interface RacerFactResult {
  title: string;
  playerName: string;
  fact: string;
  category: string;
}

const MUNDANE = [
  "keeps receipts in a drawer.",
  "owns three identical shirts.",
  "forgets where the stairs are.",
  "drinks water too loudly.",
  "has strong opinions about folding chairs.",
  "once slept through an entire update.",
  "refuses to replace a cracked mug.",
  "knows which vending machine is coldest.",
  "writes dates on batteries.",
  "has never trusted a clipboard.",
];

const WEIRD = [
  "counts exits that are not there.",
  "apologizes to locked doors.",
  "hears music during slow ticks.",
  "keeps a private list of bad signs.",
  "once argued with a parking cone.",
  "knows when the lights will flicker.",
  "carries a key that opens nothing.",
  "refuses to stand under clean ceilings.",
  "talks about yesterday like a person.",
  "believes the progress bar can hear them.",
];

const SURREAL = [
  "was seen entering a smaller version of the room.",
  "left a shadow behind lane four.",
  "remembers a race that has not happened.",
  "has a second name that only appears at night.",
  "was briefly replaced by static.",
  "claims the finish line moved.",
  "dreams in percentages.",
  "once returned before leaving.",
  "has fingerprints on the timer.",
  "is followed by a soft mechanical animal.",
];

const BAD_MONEY = [
  "the money keeps finding them.",
  "avoids looking at the dollar sign.",
  "has started hearing coins in the walls.",
  "counts money that was never placed.",
  "believes every bet leaves a stain.",
];

const SUPPORT = [
  "seems stronger when watched kindly.",
  "keeps every small encouragement.",
  "has learned to recognize familiar attention.",
  "does not know why people keep choosing them.",
  "stands differently after being supported.",
];

const INJURY = [
  "walks like the old injury remembers.",
  "avoids saying the name of the hospital.",
  "still checks the place that broke.",
  "has become careful in a suspicious way.",
  "treats pain like a schedule.",
];

const ARCHETYPE_FACTS: Record<string, string[]> = {
  WORKHORSE: [
    "keeps going after the room gets quiet.",
    "does not believe in dramatic exits.",
  ],
  GAMBLER: [
    "smiles at bad numbers.",
    "trusts the wrong signs on purpose.",
  ],
  CURSED: [
    "apologizes before anything happens.",
    "looks surprised when nothing goes wrong.",
  ],
  COMEBACKER: [
    "keeps a bag packed for holding.",
    "returns with different posture.",
  ],
  RELIC: [
    "remembers rules nobody uses anymore.",
    "moves like an old headline.",
  ],
  "LATE BLOOMER": [
    "is not finished becoming strange.",
    "improves when ignored.",
  ],
  "GLASS CANNON": [
    "makes speed look unsafe.",
    "looks breakable when still.",
  ],
  "IRON LOSER": [
    "survives in boring ways.",
    "is hard to remove completely.",
  ],
  STAR: [
    "knows when people are looking.",
    "has begun to expect noise.",
  ],
  GHOST: [
    "appears late in conversations.",
    "is noticed mostly after leaving.",
  ],
  MUTANT: [
    "changes when nobody checks.",
    "has a different outline sometimes.",
  ],
  PROFESSIONAL: [
    "makes weirdness look scheduled.",
    "loses neatly.",
  ],
  "FAN FAVORITE": [
    "belongs to people who deny it.",
    "is watched by the wrong crowd.",
  ],
  DOOMED: [
    "looks temporary even while leading.",
    "has the energy of a final day.",
  ],
};

interface FactPool {
  category: string;
  facts: string[];
}

function eligiblePools(player: Player, entry: RaceEntry): FactPool[] {
  const pools: FactPool[] = [
    { category: "mundane", facts: MUNDANE },
    { category: "weird", facts: WEIRD },
    { category: "surreal", facts: SURREAL },
  ];

  if (player.bad_money_total > 0 || (entry.bad_money_count ?? 0) > 0) {
    pools.push({ category: "bad_money", facts: BAD_MONEY });
  }

  const supportTotal =
    player.total_support_received + (entry.fan_live_bonus ?? 0);
  if (supportTotal > 0) {
    pools.push({ category: "support", facts: SUPPORT });
  }

  if (entry.is_injured || player.total_injuries > 0) {
    pools.push({ category: "injury", facts: INJURY });
  }

  const archFacts = ARCHETYPE_FACTS[player.archetype];
  if (archFacts?.length) {
    pools.push({ category: "archetype", facts: archFacts });
  }

  return pools;
}

export function generateRacerFact(
  player: Player,
  raceEntry: RaceEntry,
  seed: string
): RacerFactResult {
  const pools = eligiblePools(player, raceEntry);
  const pool = seededPick(`${seed}:pool`, pools);
  const fact = seededPick(`${seed}:fact`, pool.facts);

  return {
    title: "RACER FACT",
    playerName: player.name,
    fact,
    category: pool.category,
  };
}
