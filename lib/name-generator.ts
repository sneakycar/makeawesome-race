import { seededInt, seededPick, seededRandom, seededRange } from "./seeded-rng";
import { slugify } from "./format";

/** Starter roster — eight seed active racers for race 1. */
export const SEED_ACTIVE_NAMES = [
  "UNCLE",
  "PAL",
  "BHOLE",
  "LACIE",
  "NOAH",
  "CHRIS VOGEL",
  "KIMBER",
  "JON PENN",
] as const;

/** Core MakeAwesome-style word banks (spec + expanded from MA weird/insanity pools). */
export const firstWords = [
  "UNCLE", "PAL", "CHRISMAN", "BHOLE", "GERALD", "AMOS", "CHIP", "MILK", "VOID", "DAD",
  "SISTER", "DOCTOR", "FATHER", "BABY", "MISTER", "RONDO", "JUNE", "EEL", "TAFFY", "VERM",
  "DODD", "KIP", "BO", "GREG", "LARRY", "MOLD", "BEEF", "CHUCK", "POND", "RAG", "STATIC",
  "BONE", "RUST", "BIRD", "SUNDAY", "MEAT", "CHALK", "PLANK", "WINDOW", "FORKLIFT", "PANCAKE",
  "DOG", "BRICK", "KNIFE", "CLOUD", "ODIE", "VERO", "TILLER", "AVON", "TOBE", "MURRY", "HARL",
  "VENN", "OLIN", "NYLE", "JARREN", "TREAD", "WINT", "TENNY", "LORN", "KELLO", "MAV", "JORY",
  "OLAN", "LATCH", "DORSE", "TARON", "TRUETT", "DUTCH", "STERLING", "BRAM", "ROCCO", "MERCER",
  "HOLLIS", "COLT", "DAX", "BENNY", "MERLE", "OTIS", "LONNIE", "WADE", "CLINT", "BUCK", "CAL",
  "SONNY", "MACK", "BOONE", "IKE", "EARL", "RANDY", "DALE", "DARRELL", "ARLEN", "WALT", "MITCH",
  "KENNY", "TODD", "ERNIE", "DENNY", "KERRY", "RONNIE", "TERRY", "PERRY", "VANCE", "DAMON",
  "TRACE", "BOBBY", "LYLE", "CECIL", "RUFUS", "GORDY", "LESTER", "WAYNE", "DUANE", "DOYLE",
  "VERN", "AL", "BUD", "MEL", "RED", "SKIP", "CLEM", "GARY", "BARRY", "JERRY", "DARRYL",
  "DENNIS", "LENNY", "VINNIE", "BURT", "REX", "MERV", "STAN", "HARLAN", "VERNON", "NORM",
  "ROYCE", "KIRBY", "EARLY", "PARRIS", "ORSON", "MELLO", "COBY", "SUTTER", "MORROW", "TELLER",
  "JORRY", "VANN", "TRILL", "FERRY", "TYRUS", "BABY", "MISTER", "DOCTOR", "FATHER", "SISTER",
  "NOAH", "LACIE", "JON", "CHRIS", "VOGEL", "PENN", "GRAVE", "DUST", "TAR", "GRIME", "SOOT",
  "SMOKE", "MIST", "HAZE", "LEAD", "ZINC", "NICKEL", "STEEL", "IRON", "BRONZE", "COPPER",
  "BRASS", "SILVER", "GOLD", "CREAM", "IVORY", "SALT", "SAND", "CLAY", "MUD", "MOSS", "LICHEN",
  "ROT", "DECAY", "MOTEL", "GARAGE", "ALLEY", "BASEMENT", "BOILER", "FREIGHT", "TUNNEL",
  "VIADUCT", "DEPOT", "DUMPSTER", "PAYPHONE", "NEON", "MARQUEE", "AWNING", "SHUTTER", "STOOP",
  "BODEGA", "DELI", "TOW", "JUNK", "SCRAP", "SALVAGE", "LOADING", "CONSTRUCTION", "DEMOLITION",
  "VACANT", "WALKUP", "TENEMENT", "COURTYARD", "CHECK", "TITLE", "AUTO", "TIRE", "BODY",
  "IMPOUND", "PROJECT", "TURNSTILE", "PLATFORM", "TERMINAL", "OFFRAMP", "GUARDRAIL", "MEDIAN",
  "CURB", "METER", "VENDING", "SERVICE", "EMERGENCY", "RECYCLING", "SCAFFOLD", "CONDO",
  "CHAINLINK", "FLOODLIGHT", "ROWHOUSE", "SUBSTATION", "BILLBOARD", "WAREHOUSE", "UNDERPASS",
  "LAUNDROMAT", "CARWASH", "FIRE", "STAIRWELL", "TICKET", "TRAIN", "PARKING", "NEON",
  "PANCAKE", "FORKLIFT", "WINDOW", "PLANK", "CHALK", "MEAT", "SUNDAY", "BIRD", "RUST",
  "BONE", "STATIC", "RAG", "POND", "CHUCK", "BEEF", "MOLD", "LARRY", "GREG", "BO", "KIP",
  "DODD", "VERM", "TAFFY", "EEL", "JUNE", "RONDO", "VOID", "MILK", "CHIP", "AMOS", "GERALD",
];

export const secondWords = [
  "LOU", "AMOX", "MEAT", "SUNDAY", "HAND", "WINDOW", "CHALK", "PLANK", "GUTS", "MILK",
  "KNIFE", "RADIO", "BRADY", "BUNCH", "HOLLOW", "LUNCH", "PAPER", "BONE", "ROT", "BOLT",
  "MOUTH", "DENT", "STATIC", "FIELD", "DRAIN", "LID", "SWEATER", "BUCKET", "PARKING", "COUSIN",
  "BARN", "TEETH", "FLOOR", "WORM", "CAIN", "MERCY", "MINOR", "FLOOD", "WEATHER", "DAMAGE",
  "PITCH", "GLASS", "VAIL", "WIRE", "YATES", "DANE", "ELSE", "DREAM", "SLEEP", "DIRT",
  "BETTER", "REPEAT", "THRALL", "COIL", "RAINS", "KNOTT", "VALE", "CROWLEY", "BLACK", "GRAVES",
  "BUNT", "DENT", "GASH", "HOGG", "BLAND", "KELLER", "CRANK", "PENCE", "SLACK", "DIBBLE",
  "GRUBB", "TIRE", "MUDD", "PRYOR", "SLEDGE", "DULL", "NIPPER", "COFFEY", "FOOTE", "BOTTOMS",
  "SIZEMORE", "DYE", "GRIMES", "PRUITT", "PHELPS", "BOX", "ROOT", "HELLER", "DUGAN", "CREED",
  "NOLL", "NIX", "SCRUGGS", "BLEVINS", "TACKETT", "GORE", "MULLINS", "ROOK", "DOSS", "SAPP",
  "CRIDER", "BAUGH", "BOGGS", "COBB", "NANCE", "STUMP", "CROUCH", "KNOTTS", "SORRELL", "TUGGLE",
  "BRAMLETT", "QUALLS", "STARNES", "YARBROUGH", "VENABLE", "PETTIT", "CUFF", "DRISKELL", "NAIL",
  "MEEKS", "BARGER", "NORTH", "DROWN", "FREEZE", "SHADE", "DOWN", "DONE", "GLESS", "NIGHT",
  "BURY", "VOW", "MILLER", "VOGEL", "PENN", "BRADY", "BUNCH", "HOLLOWAY", "DONE", "GLESS",
  "CHAINLINK", "RAINWATER", "SURGICAL", "MOTEL", "STATIC", "MIDNIGHT", "SUBWAY", "FREEWAY",
  "SMOKED", "VELVET", "CONCRETE", "BRUISED", "SEDATIVE", "PHARMACY", "CLINIC", "WARD", "GHOST",
  "WEATHERED", "PEARL", "FADED", "BLUSH", "CREAM", "PHARMACY", "NICOTINE", "OVERPASS", "MOSS",
  "CHEMICAL", "INDUSTRIAL", "FACTORY", "YARD", "LIQUOR", "FLOODLIGHT", "SODIUM", "SALVAGE",
  "NEON", "MARQUEE", "TAXI", "DEAD", "BRUISED", "BURNED", "FEVER", "CONTUSION", "INFLAMMATION",
];

export const fromPlaces = [
  "BRADY", "BRADY BUNCH", "HOLLOW", "BARN", "PARKING", "BASEMENT", "ALLEY", "MOTEL", "GARAGE",
  "SUBWAY", "FREEWAY", "DEPOT", "TUNNEL", "VIADUCT", "STOOP", "BODEGA", "DELI", "TOW YARD",
  "JUNKYARD", "SCRAPYARD", "LOADING DOCK", "STRIP MALL", "LAUNDROMAT", "CARWASH", "BUS STOP",
  "FIRE ESCAPE", "BOILER ROOM", "TICKET BOOTH", "TRAIN PLATFORM", "OFFRAMP", "GUARDRAIL",
  "DUMPSTER ALLEY", "VACANT LOT", "WALKUP", "TENEMENT", "CHECK CASHING", "AUTO PARTS",
  "TIRE SHOP", "BODY SHOP", "IMPOUND LOT", "PROJECT COURTYARD", "TURNSTILE", "CONSTRUCTION SITE",
  "DEMOLITION SITE", "CONDO LOBBY", "COURTYARD", "DELI COUNTER", "TITLE LOAN", "BRADY BUNCH",
];

type Pattern =
  | "FIRST"
  | "FIRST_SECOND"
  | "FIRST_FROM_SECOND"
  | "UNCLE_SECOND"
  | "GREG_FROM_BRADY"
  | "FIRST_THE_SECOND";

const patterns: Pattern[] = [
  "FIRST",
  "FIRST_SECOND",
  "FIRST_FROM_SECOND",
  "UNCLE_SECOND",
  "GREG_FROM_BRADY",
  "FIRST_THE_SECOND",
];

const patternWeights: Record<Pattern, number> = {
  FIRST: 22,
  FIRST_SECOND: 35,
  FIRST_FROM_SECOND: 18,
  UNCLE_SECOND: 8,
  GREG_FROM_BRADY: 5,
  FIRST_THE_SECOND: 12,
};

function pickPattern(seed: string): Pattern {
  const total = Object.values(patternWeights).reduce((a, b) => a + b, 0);
  let roll = seededRandom(`${seed}:pattern`) * total;
  for (const p of patterns) {
    roll -= patternWeights[p];
    if (roll <= 0) return p;
  }
  return "FIRST_SECOND";
}

export function generateName(seed: string): string {
  const pattern = pickPattern(seed);
  const first = seededPick(`${seed}:first`, firstWords);
  const second = seededPick(`${seed}:second`, secondWords);

  switch (pattern) {
    case "FIRST":
      return first;
    case "FIRST_SECOND":
      return `${first} ${second}`;
    case "FIRST_FROM_SECOND": {
      const place = seededPick(`${seed}:place`, fromPlaces);
      return `${first} FROM ${place}`;
    }
    case "UNCLE_SECOND":
      return `UNCLE ${second}`;
    case "GREG_FROM_BRADY": {
      const variant = seededInt(`${seed}:brady`, 0, 2);
      if (variant === 0) return "GREG FROM BRADY";
      if (variant === 1) return "GREG FROM BRADY BUNCH";
      return `${seededPick(`${seed}:gregfirst`, ["GREG", "LARRY", "BO", "CHUCK", "BEEF"])} FROM BRADY BUNCH`;
    }
    case "FIRST_THE_SECOND":
      return `${first} THE ${second}`;
    default:
      return `${first} ${second}`;
  }
}

export function generateUniqueName(seed: string, existingSlugs: Set<string>): { name: string; slug: string } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = generateName(`${seed}:${attempt}`).toUpperCase().replace(/\s+/g, " ").trim();
    let slug = slugify(name);
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${attempt}`;
    }
    if (!existingSlugs.has(slug)) {
      existingSlugs.add(slug);
      return { name, slug };
    }
  }
  const fallback = `RACER ${seededInt(`${seed}:fb`, 1000, 9999)}`;
  const slug = slugify(fallback);
  existingSlugs.add(slug);
  return { name: fallback, slug };
}

/** Rough estimate of unique combinations for debugging. */
export function estimatedNamePoolSize(): number {
  const f = firstWords.length;
  const s = secondWords.length;
  const p = fromPlaces.length;
  return f + f * s + f * p + s + 3 + f * s;
}
