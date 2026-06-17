import { seededInt, seededPick, seededRandom } from "./seeded-rng";
import { slugify } from "./format";
import { generateGender, type PlayerGender } from "./player-gender";

/** Starter roster — eight fixed racers for race 1. */
export const B3S_SEED_ACTIVE_NAMES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
] as const;

export const SEED_ACTIVE_NAMES = B3S_SEED_ACTIVE_NAMES;

/** Handles — cursed twitter + normie names (normie names only fly solo; npc/lol need a glued partner). */
const monoNicks = [
  "moist", "chug", "jort", "goblin", "gremlin", "cryptid", "blob", "worm", "slime", "void",
  "rat", "roach", "pigeon", "raccoon", "opossum", "ferret", "toad", "lizard", "possum", "creature",
  "npc", "goon", "janny", "wagie", "neet", "normie", "lurker", "poster", "replyguy", "shitposter",
  "doomer", "coomer", "wojak", "pepe", "chudjak", "soyjak", "gigachad", "zoomer", "boomer", "bloomer",
  "sigma", "chad", "simp", "stan", "hater", "pickme", "girlboss", "malewife", "oomf", "moot",
  "based", "cringe", "mid", "cooked", "ded", "oof", "yeet", "bruh", "ratio", "ratioed",
  "mewing", "skibidi", "rizz", "rizzler", "gyatt", "bussin", "fanum", "ohio", "grimace", "chungus",
  "mogging", "looksmax", "looksmaxxer", "mald", "malding", "seethe", "seething", "cope", "copium", "hopium",
  "delulu", "cheugy", "slop", "brainrot", "brainworm", "rotpost", "doomscroll", "doomscrolling", "shitpost", "ragebait",
  "subtweet", "subtweeting", "qrt", "thread", "threader", "clout", "unhinged", "feral", "unwell", "messy",
  "unserious", "terminally", "chronically", "extremely", "online", "extremelyonline", "posting", "doomposting", "copeposting",
  "lowkey", "highkey", "deadass", "nocap", "ongod", "frfr", "slay", "serve", "mother", "ate",
  "quandale", "dingle", "bingle", "blorbo", "sonsonson", "shlop", "glorp", "sneed", "bonk", "bonkers",
  "fren", "troll", "mutual", "burner", "finsta", "priv", "spam", "altacc", "mainchar", "protagonist",
  "gaslight", "gatekeep", "girlbossing", "yassify", "beigeflag", "redflag", "ick", "icklist", "curate", "aesthetic",
  "core", "pilled", "redpilled", "blackpilled", "woke", "unwoke", "chronicallyonline", "birdapp", "xitter", "hellsite",
  "discord", "reddit", "mod", "admin", "anon", "gamer", "pog", "bestie", "unalive",
  "gunk", "filth", "bone", "meat", "teeth", "claw", "snack", "wired", "sleepy",
  "lol", "lmao",
  "greg", "kevin", "dave", "mike", "steve", "bob", "joe", "tim", "dan", "ben", "tom", "pat", "ray",
  "jack", "dude", "bro", "buddy", "chief", "boss", "brian", "kyle", "brad", "jeff", "mark", "paul",
  "eric", "matt", "nick", "josh", "ryan", "adam", "luke", "sean", "alex", "sam", "max", "cole", "jake",
  "tyler", "austin", "connor", "ethan", "doctor", "chef", "queen", "king", "lord", "son", "sonson",
] as const;

/** Tags / suffixes — account variants and cursed modifiers. */
const modifiers = [
  "irl", "v2", "v3", "420", "666", "69", "2007", "2012", "2016", "2020",
  "fan", "anti", "stan", "hater", "defender", "truther", "replyguy", "poster", "acc", "account",
  "official", "unofficial", "real", "fake", "alt", "main", "throwaway", "burner", "backup", "priv",
  "spam", "finsta", "lurker", "watcher", "sympathizer", "apologist", "denier", "believer", "larper", "cosplayer",
  "posting", "hours", "mode", "era", "arc", "core", "max", "maxx", "maxxing", "pilled",
  "lol", "lmao", "npc",
  "og", "proto", "hyper", "mega", "ultra", "super", "micro", "nano", "prime", "plus",
  "pro", "anti", "temp", "test", "dev", "beta", "alpha", "energy", "vibes", "brain",
] as const;

/** Second halves — user types, behaviors, account flavors. */
const secondBits = [
  "posting", "hours", "mode", "brain", "rot", "worm", "enjoyer", "poster", "account", "acc",
  "alt", "main", "stan", "hater", "defender", "truther", "replyguy", "lurker", "watcher", "sympathizer",
  "apologist", "denier", "believer", "larper", "cosplayer", "shitposter", "doomposter", "copeposter", "threader", "subtweeter",
  "ratioer", "blocker", "muter", "pinner", "quoter", "retweeter", "liker", "follower", "unfollower", "ghoster",
  "mod", "admin", "janny", "wagie", "neet", "npc", "goon", "simp", "pickme", "girlboss",
  "oomf", "moot", "mutual", "enemy", "hater", "lover", "fan", "anti", "defender", "truther",
  "scholar", "expert", "researcher", "historian", "anthropologist", "journalist", "critic", "reviewer", "commenter", "replier",
  "gamer", "poster", "lurker", "spy", "rat", "snitch", "troll", "fren", "minion", "goon",
] as const;

/** Parenthetical alts — bio / display-name energy. */
const parenAlts = [
  "sigma", "real", "fake", "alt", "main", "not me", "actually me", "don't @", "parody",
  "fan account", "bot", "probably human", "certified", "official", "unofficial", "ironic",
  "unironic", "sarcasm", "dead serious", "help", "send help", "based", "cringe", "goated",
  "opinions mine", "employer hates this", "ratio incoming", "blocked you", "don't follow back",
  "priv", "spam", "burner", "parody account", "not a doctor", "chronically online",
  "terminally online", "extremely online", "touch grass", "go outside", "seek help",
  "this is a joke", "deadass serious", "no cap", "on god", "fr fr", "lowkey unwell",
  "highkey feral", "unhinged", "unserious", "main character", "protagonist energy",
  "reply guy", "quote tweet this", "subtweet", "don't qrt", "oomf", "moots only",
] as const;

type PatternId =
  | "MONO"
  | "COMPOUND"
  | "NICK_TAG"
  | "SPACED"
  | "PAREN"
  | "XXWRAP"
  | "LEET"
  | "NUMERIC";

type CasingStyle = "lower" | "mixed" | "title" | "camel" | "sentence" | "upper";

const patterns: Array<{ id: PatternId; weight: number }> = [
  { id: "MONO", weight: 22 },
  { id: "COMPOUND", weight: 22 },
  { id: "NICK_TAG", weight: 22 },
  { id: "SPACED", weight: 14 },
  { id: "PAREN", weight: 12 },
  { id: "XXWRAP", weight: 5 },
  { id: "LEET", weight: 2 },
  { id: "NUMERIC", weight: 1 },
];

function pickPattern(seed: string): PatternId {
  const total = patterns.reduce((sum, p) => sum + p.weight, 0);
  let roll = seededRandom(`${seed}:pattern`) * total;
  for (const pattern of patterns) {
    roll -= pattern.weight;
    if (roll <= 0) return pattern.id;
  }
  return "MONO";
}

function pickMono(seed: string): string {
  return seededPick(`${seed}:mono`, [...monoNicks]);
}

function pickModifier(seed: string): string {
  return seededPick(`${seed}:mod`, [...modifiers]);
}

function pickSecond(seed: string): string {
  return seededPick(`${seed}:second`, [...secondBits]);
}

function pickParenAlt(seed: string): string {
  return seededPick(`${seed}:paren`, [...parenAlts]);
}

function pickCasingStyle(seed: string): CasingStyle {
  const roll = seededRandom(`${seed}:case`);
  if (roll < 0.4) return "lower";
  if (roll < 0.62) return "mixed";
  if (roll < 0.78) return "title";
  if (roll < 0.9) return "camel";
  if (roll < 0.97) return "sentence";
  return "upper";
}

function toMixedCase(seed: string, text: string): string {
  return text
    .split("")
    .map((ch, i) =>
      /[a-z]/i.test(ch) && seededRandom(`${seed}:mix:${i}`) < 0.46
        ? ch.toUpperCase()
        : ch.toLowerCase()
    )
    .join("");
}

function toCamelCase(a: string, b: string, capFirst: boolean): string {
  const left = a.toLowerCase();
  const right = b.charAt(0).toUpperCase() + b.slice(1).toLowerCase();
  if (capFirst) return left.charAt(0).toUpperCase() + left.slice(1) + right;
  return left + right;
}

function applyCasing(seed: string, text: string, style: CasingStyle): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return flat;

  switch (style) {
    case "lower":
      return flat.toLowerCase();
    case "upper":
      return flat.toUpperCase();
    case "title":
      return flat
        .split(/[\s._-]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(flat.includes("_") ? "_" : flat.includes(".") ? "." : " ");
    case "sentence":
      return flat.charAt(0).toUpperCase() + flat.slice(1).toLowerCase();
    case "mixed":
      return toMixedCase(`${seed}:mixed`, flat);
    case "camel": {
      const parts = flat.split(/[\s._-]+/).filter(Boolean);
      if (parts.length >= 2) {
        return toCamelCase(parts[0]!, parts.slice(1).join(""), seededRandom(`${seed}:cap`) < 0.35);
      }
      return toMixedCase(`${seed}:mixed`, flat);
    }
    default:
      return flat.toLowerCase();
  }
}

function pickJoiner(seed: string): string {
  return seededPick(`${seed}:join`, ["", "_", "."]);
}

/** Glued cursed compounds — no spaces (lolposting, npcpilled, kevinlol). */
function pickGlueJoiner(seed: string): string {
  return seededPick(`${seed}:glue`, ["", "_", "."]);
}

function applyLeet(seed: string, text: string): string {
  const map: Record<string, string> = {
    a: "4",
    e: "3",
    i: "1",
    o: "0",
    s: "5",
    t: "7",
    l: "1",
  };
  return text
    .split("")
    .map((ch, i) => {
      const lower = ch.toLowerCase();
      if (map[lower] && seededRandom(`${seed}:leet:${i}`) < 0.38) {
        return map[lower]!;
      }
      return ch;
    })
    .join("");
}

function normalizeGeneratedName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Bare solo handles we block — npc/lol are fine glued (npcposting, lol420, kevinlol). */
const STANDALONE_DENY_SLUGS = new Set([
  "alt",
  "main",
  "a",
  "e",
  "x",
  "z",
  "q",
  "me",
  "you",
  "it",
  "us",
  "we",
  "npc",
  "mod",
  "anon",
  "ratio",
  "mid",
  "sus",
  "oof",
  "ded",
  "lol",
  "lmao",
  "xd",
  "uwu",
  "owo",
  "idk",
  "idc",
  "smh",
  "fml",
  "irl",
  "og",
  "acc",
  "bot",
  "guy",
  "man",
  "bro",
  "fr",
  "god",
  "cap",
  "ate",
  "core",
  "pilled",
  "priv",
  "spam",
  "oomf",
  "moot",
  "stan",
  "simp",
  "chad",
  "pog",
  "soy",
  "cope",
  "mald",
  "frfr",
  "ongod",
  "nocap",
  "girl",
  "boy",
  "fan",
  "anti",
  "pro",
  "beta",
  "alpha",
  "temp",
  "test",
  "dev",
  "worm",
  "rot",
  "brain",
  "mode",
  "era",
  "arc",
  "vibes",
  "energy",
  "online",
  "extremely",
  "chronically",
  "terminally",
  "probably",
  "maybe",
  "thing",
  "stuff",
  "person",
  "human",
  "them",
  "entity",
  "being",
  "presence",
  "aura",
  "ghost",
  "spirit",
  "demon",
  "angel",
  "clown",
  "jester",
  "fool",
  "joker",
  "ban",
  "mother",
  "serve",
  "slay",
]);

export function isAcceptableGeneratedName(name: string): boolean {
  const normalized = normalizeGeneratedName(name);
  if (!normalized) return false;
  const slug = slugify(normalized);
  if (slug.length < 3) return false;
  const isSingleToken = !/[\s_.(]/.test(normalized);
  if (isSingleToken && STANDALONE_DENY_SLUGS.has(slug)) return false;
  // lol/lmao only glued — npcposting ok, "lol posting" not.
  if (isSingleToken && /^(lol|lmao)$/i.test(normalized)) return false;
  if (/\blol\b|\blmao\b/i.test(normalized) && /\s/.test(normalized)) return false;
  return true;
}

function buildPatternName(seed: string, pattern: PatternId): string {
  const casing = pickCasingStyle(`${seed}:style`);

  switch (pattern) {
    case "MONO": {
      const base = pickMono(seed);
      return applyCasing(`${seed}:mono`, base, casing);
    }
    case "COMPOUND": {
      const a = pickMono(`${seed}:a`);
      const b = pickSecond(`${seed}:b`);
      const glueCursed = /^(lol|lmao|npc)$/i.test(a) || /^(lol|lmao|npc)$/i.test(b);
      const joiner = glueCursed ? pickGlueJoiner(seed) : pickJoiner(seed);
      const raw = joiner ? `${a}${joiner}${b}` : toCamelCase(a, b, seededRandom(`${seed}:cap`) < 0.4);
      return applyCasing(`${seed}:compound`, raw, joiner ? "lower" : casing);
    }
    case "NICK_TAG": {
      const base = pickMono(seed);
      const mod = pickModifier(`${seed}:mod`);
      const glueCursed = /^(lol|lmao|npc)$/i.test(base) || /^(lol|lmao|npc)$/i.test(mod);
      const joiner = glueCursed
        ? pickGlueJoiner(seed)
        : seededPick(`${seed}:tagjoin`, ["_", "", "."]);
      const raw = `${base}${joiner}${mod}`;
      return applyCasing(`${seed}:tag`, raw, seededRandom(`${seed}:tagcase`) < 0.55 ? "lower" : casing);
    }
    case "SPACED": {
      const a = pickMono(`${seed}:a`);
      const b = pickSecond(`${seed}:b`);
      const raw = `${a} ${b}`;
      return applyCasing(`${seed}:spaced`, raw, seededRandom(`${seed}:spacecase`) < 0.65 ? "lower" : casing);
    }
    case "PAREN": {
      const base = pickMono(seed);
      const alt = pickParenAlt(`${seed}:alt`);
      const raw = `${base} (${alt})`;
      return applyCasing(`${seed}:paren`, raw, "lower");
    }
    case "XXWRAP": {
      const base = pickMono(seed);
      const inner = applyCasing(
        `${seed}:xxinner`,
        base,
        seededPick(`${seed}:xxstyle`, ["lower", "mixed", "title"] as const)
      );
      return `xX_${inner}_Xx`;
    }
    case "LEET": {
      const base = pickMono(seed);
      const styled = applyCasing(`${seed}:leetbase`, base, "lower");
      return applyLeet(`${seed}:leet`, styled);
    }
    case "NUMERIC": {
      const base = pickMono(seed);
      const num = seededPick(`${seed}:num`, ["420", "69", "666", "2007", "2012", "1337", "80085"]);
      const joiner = seededPick(`${seed}:numjoin`, ["", "_", "."]);
      return applyCasing(`${seed}:numeric`, `${base}${joiner}${num}`, "lower");
    }
    default:
      return applyCasing(`${seed}:fb`, pickMono(seed), "lower");
  }
}

export function generateName(seed: string): string {
  const pattern = pickPattern(seed);
  return buildPatternName(`${seed}:${pattern}`, pattern);
}

export function generateUniqueName(
  seed: string,
  existingSlugs: Set<string>
): { name: string; slug: string; gender: PlayerGender } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const attemptSeed = `${seed}:${attempt}`;
    const name = normalizeGeneratedName(generateName(attemptSeed));
    if (!isAcceptableGeneratedName(name)) continue;
    let slug = slugify(name);
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${attempt}`;
    }
    if (!existingSlugs.has(slug)) {
      existingSlugs.add(slug);
      return { name, slug, gender: generateGender(attemptSeed) };
    }
  }
  const fallback = `racer${seededInt(`${seed}:fb`, 1000, 9999)}`;
  const slug = slugify(fallback);
  existingSlugs.add(slug);
  return { name: fallback, slug, gender: generateGender(`${seed}:fb`) };
}

/** Estimated unique combinations across all patterns. */
export function estimatedNamePoolSize(): number {
  const mono = monoNicks.length;
  const mod = modifiers.length;
  const second = secondBits.length;
  const paren = parenAlts.length;
  return mono * 8 + mono * second * 4 + mono * mod * 3 + mono * second + mono * paren + mono * 12 + mono * 8 + mono * 8;
}
