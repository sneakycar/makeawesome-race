import { seededInt, seededPick, seededRandom } from "./seeded-rng";
import { slugify } from "./format";
import { generateGender, type PlayerGender } from "./player-gender";

/** Starter roster — eight fixed racers for race 1. */
export const SEED_ACTIVE_NAMES = [
  "uncle",
  "pal",
  "bhole",
  "lacie",
  "noah",
  "chrisman",
  "kimber",
  "jon penn",
] as const;

/** Single-word handles — terminally online energy. */
const monoNicks = [
  "moist", "chug", "jort", "goblin", "gremlin", "rat", "worm", "void", "dust", "slime",
  "npc", "goon", "mod", "anon", "main", "alt", "burner", "sigma", "based", "cringe",
  "mewing", "skibidi", "rizz", "gyatt", "bussin", "mid", "cooked", "ded", "oof", "yeet",
  "bruh", "simp", "goat", "ratio", "chad", "pepe", "wojak", "doomer", "coomer", "gamer",
  "pog", "malding", "copium", "hopium", "delulu", "slay", "bestie", "chungus", "sus",
  "blob", "toad", "ferret", "pigeon", "raccoon", "opossum", "roach", "lizard", "cryptid",
  "gunk", "filth", "bone", "meat", "teeth", "claw", "snack", "poster", "replyguy", "mutual",
  "troll", "fren", "bonk", "bonkers", "unhinged", "feral", "sleepy", "wired", "doomscroll",
  "online", "terminally", "extremely", "probably", "maybe", "idk", "idc", "smh", "fml",
  "lol", "lmao", "xd", "uwu", "owo", "rawr", "nya", "meow", "quandale", "dingle", "bingle",
  "shlop", "glorp", "sneed", "seethe", "mald", "janny", "wagie", "neet", "wizard", "normie",
  "reddit", "discord", "admin", "ban", "cope", "soy", "jack", "dude", "bro", "queen", "chef",
  "doctor", "uncle", "pal", "bhole", "lacie", "noah", "kimber", "chrisman", "walhof", "greg",
  "kevin", "dave", "mike", "steve", "bob", "joe", "tim", "dan", "ben", "tom", "pat", "ray",
  "guy", "dude", "buddy", "pal", "chief", "boss", "king", "lord", "sir", "maam", "a", "e",
  "x", "z", "q", "blorbo", "son", "sonson", "sonsonson", "me", "you", "them", "us", "we",
  "it", "thing", "stuff", "guy", "girl", "boy", "man", "woman", "person", "human", "creature",
  "entity", "being", "presence", "vibes", "energy", "aura", "rot", "brain", "mind", "soul",
  "ghost", "spirit", "demon", "angel", "clown", "jester", "fool", "joker", "trickster", "imp",
] as const;

/** Tags / suffixes glued onto handles. */
const modifiers = [
  "irl", "v2", "v3", "420", "666", "69", "2007", "2012", "fan", "official", "real", "fake",
  "max", "mini", "hyper", "proto", "og", "core", "posting", "hours", "mode", "energy", "acc",
  "account", "alt", "main", "throwaway", "backup", "temp", "test", "dev", "beta", "alpha",
  "prime", "plus", "pro", "ultra", "mega", "micro", "nano", "pico", "super", "hyper", "extreme",
] as const;

/** Second halves for compounds — not always a full name. */
const secondBits = [
  "hours", "posting", "mode", "brain", "rot", "worm", "fan", "boy", "girl", "man", "dude",
  "lord", "king", "queen", "enjoyer", "poster", "account", "alt", "main", "son", "dad", "mom",
  "uncle", "aunt", "cousin", "friend", "enemy", "hater", "lover", "believer", "denier", "truther",
  "warrior", "scholar", "artist", "poet", "writer", "reader", "lurker", "mod", "admin", "janny",
  "gamer", "player", "racer", "driver", "pilot", "captain", "coach", "ref", "npc", "boss",
  "minion", "goon", "simp", "stan", "hater", "fan", "cop", "agent", "spy", "rat", "snitch",
] as const;

/** Parenthetical alts — "(sigma)", "(real)", etc. */
const parenAlts = [
  "sigma", "real", "fake", "alt", "main", "not me", "actually me", "don't @", "parody",
  "fan account", "bot", "probably human", "certified", "official", "unofficial", "ironic",
  "unironic", "sarcasm", "dead serious", "help", "send help", "based", "cringe", "goated",
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
  { id: "MONO", weight: 34 },
  { id: "COMPOUND", weight: 18 },
  { id: "NICK_TAG", weight: 16 },
  { id: "SPACED", weight: 12 },
  { id: "PAREN", weight: 8 },
  { id: "XXWRAP", weight: 6 },
  { id: "LEET", weight: 4 },
  { id: "NUMERIC", weight: 2 },
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
  return seededPick(`${seed}:join`, ["_", ".", ""]);
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
      const joiner = pickJoiner(seed);
      const raw = joiner ? `${a}${joiner}${b}` : toCamelCase(a, b, seededRandom(`${seed}:cap`) < 0.4);
      return applyCasing(`${seed}:compound`, raw, joiner ? "lower" : casing);
    }
    case "NICK_TAG": {
      const base = pickMono(seed);
      const mod = pickModifier(`${seed}:mod`);
      const joiner = seededPick(`${seed}:tagjoin`, ["_", "", "."]);
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
