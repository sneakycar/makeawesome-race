/**
 * Grammar gate for racer confessional facts — reject broken copy and reroll.
 */

import { seededInt } from "./seeded-rng";
import type { PlayerGender } from "./player-gender";
import { adaptRacerFactForGender } from "./player-gender";
import { RACER_FACT_TEMPLATES, getRacerFactFragmentPools } from "./racer-fact-corpus";

export type RacerFactGrammarResult = { ok: true } | { ok: false; reason: string };

const BANNED_SUBSTRINGS = [
  "verified",
  "nil",
  "null",
  "undefined",
  "lorem ipsum",
  "placeholder",
  "todo",
  "test test",
  "{",
  "}",
  "  ",
  "..",
  " ,",
  " .",
  " a a ",
  " an a ",
  " an an ",
  " the the ",
  " and and ",
  " to to ",
  " in in ",
] as const;

/** Facts must stay far away from the race itself. */
const RACE_BANNED_PATTERNS = [
  /\brace\b/i,
  /\bracing\b/i,
  /\bracer\b/i,
  /\blaps?\b/i,
  /\bticks?\b/i,
  /\bscores?\b/i,
  /\bpoints?\b/i,
  /\bscoreboard\b/i,
  /\blanes?\b/i,
  /\bholding\b/i,
  /\beliminat/i,
  /\broster\b/i,
  /\bfinish line\b/i,
  /\bpodium\b/i,
  /\bpit crew\b/i,
  /\bbroadcast\b/i,
  /\bstandings\b/i,
  /\bleaderboard\b/i,
  /\bchaos surge\b/i,
  /\bgod score\b/i,
  /\bbad money\b/i,
  /\bencourage\b/i,
  /\bpercent\b/i,
  /\bovr\b/i,
] as const;

function hasDuplicateWords(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const seen = new Set<string>();
  for (const word of words) {
    if (seen.has(word)) return true;
    seen.add(word);
  }
  return false;
}

export function cleanFactLine(text: string): string {
  let result = text.replace(/\s+/g, " ").trim();
  result = result.replace(/ \./g, ".").replace(/ ,/g, ",");
  result = result.replace(/\.{2,}/g, ".");
  if (result && !result.endsWith(".")) result += ".";
  return result;
}

export function validateRacerFactLine(text: string): RacerFactGrammarResult {
  const cleaned = cleanFactLine(text);
  if (!cleaned) return { ok: false, reason: "empty line" };
  if (cleaned.length < 14) return { ok: false, reason: "too short" };
  if (cleaned.length > 200) return { ok: false, reason: "too long" };
  if (!cleaned.endsWith(".")) return { ok: false, reason: "missing period" };
  if (/^[A-Z]/.test(cleaned)) return { ok: false, reason: "starts with capital" };
  if (/\{[a-zA-Z_]+\}/.test(cleaned)) return { ok: false, reason: "unfilled template" };

  const lower = cleaned.toLowerCase();
  for (const banned of BANNED_SUBSTRINGS) {
    if (lower.includes(banned)) {
      return { ok: false, reason: `banned fragment: ${banned}` };
    }
  }
  for (const banned of RACE_BANNED_PATTERNS) {
    if (banned.test(cleaned)) {
      return { ok: false, reason: `race term: ${banned}` };
    }
  }

  if (hasDuplicateWords(cleaned)) {
    return { ok: false, reason: "duplicate words" };
  }

  if (!/[a-z]{3,}/.test(cleaned)) {
    return { ok: false, reason: "no real words" };
  }

  return { ok: true };
}

function extractTemplateVars(template: string): string[] {
  return [...template.matchAll(/\{([a-zA-Z_]+)\}/g)].map((m) => m[1]!);
}

function templateVarsAreValid(
  template: string,
  vars: Record<string, string>,
  pools: Record<string, readonly string[]>
): boolean {
  for (const key of extractTemplateVars(template)) {
    const val = vars[key];
    if (!val?.trim()) return false;
    if (!pools[key]?.length) return false;
  }
  return true;
}

export function fillRacerFactTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, val);
  }
  return cleanFactLine(out);
}

function pickVarsForTemplate(
  seed: string,
  template: string,
  pools: Record<string, readonly string[]>
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of extractTemplateVars(template)) {
    const pool = pools[key];
    if (!pool?.length) continue;
    vars[key] = pool[seededInt(`${seed}:${key}`, 0, pool.length - 1)]!;
  }
  return vars;
}

export function pickGatedRacerFact(
  seed: string,
  gender: PlayerGender = "M"
): string {
  const pools = getRacerFactFragmentPools();
  const templates = RACER_FACT_TEMPLATES.filter((template) =>
    templateVarsAreValid(template, pickVarsForTemplate(`${seed}:probe`, template, pools), pools)
  );
  const eligible = templates.length ? templates : [...RACER_FACT_TEMPLATES];

  const start = seededInt(`${seed}:fact`, 0, eligible.length - 1);
  for (let i = 0; i < eligible.length; i++) {
    const template = eligible[(start + i) % eligible.length]!;
    const vars = pickVarsForTemplate(`${seed}:${i}`, template, pools);
    if (!templateVarsAreValid(template, vars, pools)) continue;
    const line = fillRacerFactTemplate(template, vars);
    const adapted = adaptRacerFactForGender(line, gender);
    if (validateRacerFactLine(adapted).ok) return adapted;
  }

  return adaptRacerFactForGender(
    "once forgot why he was standing there.",
    gender
  );
}

export function countRacerFactFragments(): number {
  const pools = getRacerFactFragmentPools();
  return Object.values(pools).reduce((sum, pool) => sum + pool.length, 0);
}

export function estimateRacerFactCombinations(): number {
  const pools = getRacerFactFragmentPools();
  let total = 0;
  for (const template of RACER_FACT_TEMPLATES) {
    const keys = extractTemplateVars(template);
    if (!keys.length) {
      total += 1;
      continue;
    }
    let combos = 1;
    for (const key of keys) {
      combos *= pools[key]?.length ?? 0;
      if (combos > 50_000_000) break;
    }
    total += combos;
  }
  return total;
}
