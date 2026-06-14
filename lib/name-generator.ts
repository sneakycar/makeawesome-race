import { seededInt, seededPick, seededRandom } from "./seeded-rng";
import { slugify } from "./format";
import { generateGender, type PlayerGender } from "./player-gender";

/** Starter roster — eight fixed racers for race 1. */
export const SEED_ACTIVE_NAMES = [
  "UNCLE",
  "PAL",
  "BHOLE",
  "LACIE",
  "NOAH",
  "CHRISMAN",
  "KIMBER",
  "JON PENN",
] as const;

/** Cool, modern-ish first names — tier-1 anchor pool. */
export const coolNames = [
  "DANTE", "RAZOR", "VORTEX", "CHAD", "TRENT", "SKYLAR", "JAX", "BLAZE", "NITRO", "RICO",
  "DEREK", "TANK", "SLADE", "ZANE", "KNOX", "RIDGE", "CASH", "STEEL", "DASH", "ROCKY",
  "TIGER", "WOLF", "HAWK", "COLE", "REX", "ACE", "JET", "STORM", "BRANDO", "TYLER",
  "DUSTIN", "TANNER", "HUNTER", "RIDER", "CADE", "MAVERICK", "PHOENIX", "DRAKE", "CRUZ", "RYDER",
  "BROCK", "GUNNER", "SLATER", "PISTON", "TORQUE", "RAMPAGE", "VENOM", "SPIKE", "CRASH", "BOLT",
  "FLASH", "STRIKE", "COMET", "NOVA", "ORBIT", "PULSE", "SURGE", "VOLT", "CHROME", "SHRED",
  "KICK", "FLIP", "SPIN", "GRIND", "SLICK", "SMOOTH", "RAW", "EDGE", "RUSH", "FLEX",
  "JORT", "CHUG", "BOOM", "SLAM", "DUNK", "CROSS", "SWIFT", "PRIME", "MAX", "APEX",
] as const;

/** Dusty Americana / barn-league names — tier-1 anchor pool. */
export const oldTimeyNames = [
  "CLARENCE", "OTIS", "HARLAN", "CLEM", "VERL", "WILBUR", "EUSTACE", "HORACE", "ELMER", "RUFUS",
  "CLETUS", "JEB", "HOYT", "DARBY", "GLENN", "LLOYD", "MILTON", "NORRIS", "ORVILLE", "PERCY",
  "QUENTIN", "ROLAND", "SEYMOUR", "THADDEUS", "ULYSSES", "VIRGIL", "WALLACE", "XAVIER", "YORICK", "ZEB",
  "AMOS", "BARNABY", "CALEB", "DUNCAN", "EZRA", "FLOYD", "GROVER", "HERSHEL", "IRVING", "JASPER",
  "KENNETH", "LEON", "MERRILL", "NORMAN", "OSCAR", "PHINEAS", "QUINCY", "RUSSELL", "SILAS", "TOBIAS",
  "URBAN", "VANCE", "WENDELL", "XERXES", "YALE", "ZACHARIAH", "ABNER", "BUD", "CURLY", "DEWEY",
  "EARL", "FESTUS", "GUS", "HANK", "IKE", "JUNIOR", "KENT", "LONNIE", "MOSES", "NATHANIEL",
  "OLLIE", "PEARL", "ROSCOE", "SHELDON", "TRUMAN", "VERNON", "WADE", "YARNELL", "ZEKE", "BOONE",
] as const;

/** 90s sports-game power words — hype modifiers. */
export const power90s = [
  "MEGA", "TURBO", "HYPER", "ULTRA", "SUPER", "MAX", "EXTREME", "TOTAL", "FULL", "WILD",
  "BLITZ", "JAM", "SLAM", "DUNK", "BUST", "CRUSH", "SMASH", "RIP", "BURN", "BLAST",
  "ROCKET", "THUNDER", "LIGHTNING", "CYCLONE", "TORNADO", "HURRICANE", "AVALANCHE", "TSUNAMI", "INFERNO", "VOLCANO",
  "ATOMIC", "NUCLEAR", "PLASMA", "LASER", "NEON", "PIXEL", "ARCADE", "INSERT", "COIN", "CONTINUE",
  "FINAL", "BONUS", "EXTRA", "SPECIAL", "SECRET", "HIDDEN", "RARE", "LEGEND", "ALL-STAR", "MVP",
  "PRIMETIME", "CLUTCH", "BUZZER", "OVERTIME", "SUDDEN", "DEATH", "SHOWTIME", "HIGHLIGHT", "REPLAY", "INSTANT",
] as const;

/** 90s nicknames / call-signs — arena-PA energy. */
export const nicknames90s = [
  "JORT", "CHUG", "ICEMAN", "SLAMMER", "HEATWAVE", "BIG DOG", "SHORT FUSE", "HOT HAND", "COLD SNAP",
  "THE JORT", "THE CHUG", "THE ICE", "THE HEAT", "THE STORM", "THE BULLET", "THE HAMMER", "THE WRECK",
  "PRIMETIME", "GAMETIME", "HALFTIME", "OVERTIME", "TIPOFF", "KICKOFF", "FACEOFF", "PITCHOUT",
  "BOOM BOX", "RAD DAD", "SICK NICK", "FAST EDDIE", "BIG AL", "LITTLE LOU", "OLD SCHOOL", "NEW WAVE",
  "HIGH SCORE", "TOP SHELF", "LOW BLOW", "FAST BREAK", "FULL COURT", "HALF COURT", "DEEP THREAT", "WILD CARD",
  "MUDDY", "DUSTY", "RUSTY", "CRISPY", "TOASTY", "SPICY", "ZESTY", "CHEESY", "GROOVY", "FUNKY",
  "SHAKY", "WACKY", "ZANY", "KOOKY", "WONKY", "BONKY", "JANKY", "DANK", "YIKES", "YIKERS",
  "OOF", "YEET", "SKRT", "BRRR", "ZOOM", "WHAM", "KAPOW", "BAM", "POW", "ZAP",
] as const;

/** Sport / arcade tag words — second-half punch. */
export const tags90s = [
  "BONE", "COURT", "ZONE", "RUSH", "PRESS", "STREAK", "STREAKER", "HUSTLE", "MUSCLE", "GRIT",
  "KNUCKLE", "ELBOW", "SHIN", "KNEE", "ANKLE", "WRIST", "JAW", "CHIN", "CHEST", "GUT",
  "BLOCK", "TACKLE", "SACK", "SPIKE", "SERVE", "VOLLEY", "DRIBBLE", "PASS", "SHOT", "GOAL",
  "PIVOT", "SCREEN", "PICK", "ROLL", "FADE", "CUT", "POST", "WING", "BASELINE", "PAINT",
  "BENCH", "LOCKER", "TUNNEL", "TUNNEL VISION", "BREAKAWAY", "FASTBREAK", "ALLEY-OOP", "BOUNCE PASS",
  "CROSSOVER", "SPIN MOVE", "FADEAWAY", "HOOK SHOT", "JUMP BALL", "TIP IN", "PUTBACK", "AND ONE",
  "TECHNICAL", "FLAGRANT", "EJECTION", "FOUL OUT", "BENCH MOB", "SIXTH MAN", "STARTER", "SUB",
  "ROOKIE", "VETERAN", "CAPTAIN", "COACH", "REF", "WHISTLE", "BUZZER", "SCOREBOARD", "JUMBOTRON", "CROWD",
] as const;

/** 90s venues / origins — rare tier-3 FROM clauses. */
export const venues90s = [
  "THE ARCADE", "CEDAR POINT", "THE MALL", "FOOD COURT", "SKATE PARK", "MINI GOLF", "BOWLING ALLEY",
  "ROLLER RINK", "LASER TAG", "PAINTBALL", "GO-KART TRACK", "BATTING CAGE", "DRIVING RANGE",
  "THE GYM", "THE Y", "RECREATION CENTER", "COMMUNITY POOL", "HIGH SCHOOL GYM", "COLLEGE COURT",
  "STREET COURT", "BLACKTOP", "PARKING LOT", "ALLEY HOOPS", "ROOFTOP COURT", "BASEMENT LAN",
  "BLOCKBUSTER", "RADIO SHACK", "KB TOYS", "SPORTS AUTHORITY", "THE DUGOUT", "THE BLEACHERS",
  "PRESS BOX", "SIDELINE", "LOCKER ROOM", "TRAINING ROOM", "ICE BATH", "SAUNA", "HOT TUB TIME",
] as const;

/** Announcer titles — rare tier-3 prefix. */
export const titles90s = [
  "SIR", "DOC", "COACH", "CAPTAIN", "KING", "DUKE", "BARON", "CHIEF", "BOSS", "PROFESSOR",
  "MAJOR", "GENERAL", "COLONEL", "SENSEI", "MASTER", "LORD", "SAINT", "AGENT", "DETECTIVE", "REFEREE",
] as const;

/** Punchy surnames / handles for quoted patterns. */
export const handles90s = [
  "VORTEX", "PALMER", "KNUCKLE", "SLAMWORTHY", "DUNKERSON", "JORTON", "CHUGWELL", "BLITZER",
  "RAMMER", "CRUSHER", "STRIKER", "RUSHER", "HUSTLER", "GRINDER", "SPINNER", "FLIPPER",
  "BOMBER", "TORPEDO", "MISSILE", "CANNON", "TANKER", "HOTSHOT", "SHOWBOAT", "HIGHFLYER",
  "LOWBLOW", "HARDNOSE", "SOFTSHOE", "QUICKSTEP", "FASTBALL", "CURVEBALL", "SCREWBALL", "GOOFBALL",
  "MEATBALL", "FIREBALL", "SNOWBALL", "EYEBALL", "8-BALL", "PINBALL", "FOOTBALL", "BASKETBALL",
  "VOLLEYBALL", "SOFTBALL", "BASEBALL", "HOCKEY PUCK", "GOLF CLUB", "TENNIS RACKET", "SKATEBOARD",
] as const;

type NameTier = 1 | 2 | 3;

type PatternId =
  | "COOL_POWER"
  | "OLDTIMEY_POWER"
  | "COOL_TAG"
  | "OLDTIMEY_TAG"
  | "POWER_TAG"
  | "COOL_NICKNAME"
  | "OLDTIMEY_NICKNAME"
  | "QUOTED_HANDLE"
  | "THE_NICKNAME"
  | "TITLE_OLDTIMEY"
  | "FROM_VENUE"
  | "MEGA_MONO"
  | "TITLE_POWER";

interface NamePattern {
  id: PatternId;
  tier: NameTier;
  weight: number;
}

const patterns: NamePattern[] = [
  // Tier 1 — common two-word arena names
  { id: "COOL_POWER", tier: 1, weight: 18 },
  { id: "OLDTIMEY_POWER", tier: 1, weight: 16 },
  { id: "COOL_TAG", tier: 1, weight: 14 },
  { id: "OLDTIMEY_TAG", tier: 1, weight: 14 },
  { id: "POWER_TAG", tier: 1, weight: 12 },
  // Tier 2 — nicknames and call-signs
  { id: "COOL_NICKNAME", tier: 2, weight: 10 },
  { id: "OLDTIMEY_NICKNAME", tier: 2, weight: 10 },
  { id: "QUOTED_HANDLE", tier: 2, weight: 9 },
  { id: "THE_NICKNAME", tier: 2, weight: 8 },
  { id: "MEGA_MONO", tier: 2, weight: 6 },
  // Tier 3 — rare full broadcast names
  { id: "TITLE_OLDTIMEY", tier: 3, weight: 5 },
  { id: "FROM_VENUE", tier: 3, weight: 5 },
  { id: "TITLE_POWER", tier: 3, weight: 4 },
];

const tierRollWeights: Record<NameTier, number> = {
  1: 52,
  2: 33,
  3: 15,
};

function pickTier(seed: string): NameTier {
  const total = tierRollWeights[1] + tierRollWeights[2] + tierRollWeights[3];
  let roll = seededRandom(`${seed}:tier`) * total;
  for (const tier of [1, 2, 3] as const) {
    roll -= tierRollWeights[tier];
    if (roll <= 0) return tier;
  }
  return 1;
}

function pickPattern(seed: string, tier: NameTier): PatternId {
  const eligible = patterns.filter((p) => p.tier <= tier);
  const total = eligible.reduce((sum, p) => sum + p.weight, 0);
  let roll = seededRandom(`${seed}:pattern`) * total;
  for (const pattern of eligible) {
    roll -= pattern.weight;
    if (roll <= 0) return pattern.id;
  }
  return eligible[0]?.id ?? "COOL_POWER";
}

function pickFrom(seed: string, key: string, bank: readonly string[]): string {
  return seededPick(`${seed}:${key}`, [...bank]);
}

function pickCool(seed: string): string {
  return pickFrom(seed, "cool", coolNames);
}

function pickOldTimey(seed: string): string {
  return pickFrom(seed, "old", oldTimeyNames);
}

function pickPerson(seed: string): string {
  return seededBoolPerson(seed) ? pickCool(seed) : pickOldTimey(seed);
}

function seededBoolPerson(seed: string): boolean {
  return seededRandom(`${seed}:person`) < 0.5;
}

function buildPatternName(seed: string, pattern: PatternId): string {
  switch (pattern) {
    case "COOL_POWER":
      return `${pickCool(seed)} ${pickFrom(seed, "pow", power90s)}`;
    case "OLDTIMEY_POWER":
      return `${pickOldTimey(seed)} ${pickFrom(seed, "pow", power90s)}`;
    case "COOL_TAG":
      return `${pickCool(seed)} ${pickFrom(seed, "tag", tags90s)}`;
    case "OLDTIMEY_TAG":
      return `${pickOldTimey(seed)} ${pickFrom(seed, "tag", tags90s)}`;
    case "POWER_TAG":
      return `${pickFrom(seed, "pow", power90s)} ${pickFrom(seed, "tag", tags90s)}`;
    case "COOL_NICKNAME":
      return `${pickCool(seed)} ${pickFrom(seed, "nick", nicknames90s)}`;
    case "OLDTIMEY_NICKNAME":
      return `${pickOldTimey(seed)} ${pickFrom(seed, "nick", nicknames90s)}`;
    case "QUOTED_HANDLE": {
      const person = pickPerson(`${seed}:qperson`);
      const nick = pickFrom(seed, "nick", nicknames90s);
      const handle = pickFrom(seed, "handle", handles90s);
      return `${person} "${nick}" ${handle}`;
    }
    case "THE_NICKNAME": {
      const person = pickPerson(`${seed}:tperson`);
      const nick = pickFrom(seed, "nick", nicknames90s);
      if (nick.startsWith("THE ")) return `${person} ${nick}`;
      return `${person} THE ${nick}`;
    }
    case "MEGA_MONO":
      return pickFrom(seed, "mono", nicknames90s);
    case "TITLE_OLDTIMEY": {
      const title = pickFrom(seed, "title", titles90s);
      const old = pickOldTimey(seed);
      const tag = pickFrom(seed, "tag", tags90s);
      return `${title} ${old} ${tag}`;
    }
    case "FROM_VENUE": {
      const person = pickPerson(`${seed}:fperson`);
      const venue = pickFrom(seed, "venue", venues90s);
      return `${person} FROM ${venue}`;
    }
    case "TITLE_POWER": {
      const title = pickFrom(seed, "title", titles90s);
      return `${title} ${pickFrom(seed, "pow", power90s)} ${pickFrom(seed, "tag", tags90s)}`;
    }
    default:
      return `${pickCool(seed)} ${pickFrom(seed, "pow", power90s)}`;
  }
}

export function generateName(seed: string): string {
  const tier = pickTier(seed);
  const pattern = pickPattern(seed, tier);
  return buildPatternName(`${seed}:${pattern}`, pattern);
}

export function generateUniqueName(
  seed: string,
  existingSlugs: Set<string>
): { name: string; slug: string; gender: PlayerGender } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const attemptSeed = `${seed}:${attempt}`;
    const name = generateName(attemptSeed).toUpperCase().replace(/\s+/g, " ").trim();
    let slug = slugify(name);
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${attempt}`;
    }
    if (!existingSlugs.has(slug)) {
      existingSlugs.add(slug);
      return { name, slug, gender: generateGender(attemptSeed) };
    }
  }
  const fallback = `RACER ${seededInt(`${seed}:fb`, 1000, 9999)}`;
  const slug = slugify(fallback);
  existingSlugs.add(slug);
  return { name: fallback, slug, gender: generateGender(`${seed}:fb`) };
}

/** Estimated unique combinations across all tiered patterns. */
export function estimatedNamePoolSize(): number {
  const cool = coolNames.length;
  const old = oldTimeyNames.length;
  const pow = power90s.length;
  const nick = nicknames90s.length;
  const tag = tags90s.length;
  const venue = venues90s.length;
  const title = titles90s.length;
  const handle = handles90s.length;
  const person = cool + old;

  return (
    cool * pow +
    old * pow +
    cool * tag +
    old * tag +
    pow * tag +
    cool * nick +
    old * nick +
    person * nick * handle +
    person * nick +
    nick +
    title * old * tag +
    person * venue +
    title * pow * tag
  );
}
