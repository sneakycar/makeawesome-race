/**
 * Race recap grammar gate — adapted from DOOM DANCE / THE TOWN.
 * Reject bad copy and reroll; never silently repair broken prose.
 */

import { seededInt } from "./seeded-rng";

export type RecapGrammarResult = { ok: true } | { ok: false; reason: string };

const BANNED_SUBSTRINGS = [
  "verified",
  "nil",
  "null",
  "undefined",
  "lorem ipsum",
  "placeholder",
  "todo",
  "test test",
] as const;

const ALLOWED_ALL_CAPS = new Set(["GOD", "II", "III", "IV"]);

export function cleanRecapLine(text: string): string {
  let result = text.replace(/\s+/g, " ").trim();
  result = result.replace(/ \./g, ".").replace(/ ,/g, ",");
  return result;
}

export function validateRecapLine(text: string): RecapGrammarResult {
  const cleaned = cleanRecapLine(text);
  if (!cleaned) return { ok: false, reason: "empty line" };
  if (cleaned.includes("  ")) return { ok: false, reason: "duplicate spaces" };
  if (cleaned.includes("..") || cleaned.includes(",,") || cleaned.includes(";;")) {
    return { ok: false, reason: "doubled punctuation" };
  }
  if (/\{[a-zA-Z_]+\}/.test(cleaned)) {
    return { ok: false, reason: "unfilled template" };
  }

  const lower = cleaned.toLowerCase();
  for (const banned of BANNED_SUBSTRINGS) {
    if (lower.includes(banned)) {
      return { ok: false, reason: `banned phrase: ${banned}` };
    }
  }

  if (cleaned.includes(" and and ") || cleaned.includes(" or or ")) {
    return { ok: false, reason: "broken conjunction" };
  }

  if (/\.\s+[a-z]/.test(cleaned)) {
    return { ok: false, reason: "bad capitalization after sentence break" };
  }

  if (hasDuplicateWords(cleaned)) {
    return { ok: false, reason: "duplicate words" };
  }

  for (const word of cleaned.split(/\s+/)) {
    const stripped = word.replace(/[^A-Za-z]/g, "");
    if (
      stripped.length > 3 &&
      stripped === stripped.toUpperCase() &&
      !ALLOWED_ALL_CAPS.has(stripped)
    ) {
      return { ok: false, reason: `all caps word: ${stripped}` };
    }
  }

  return { ok: true };
}

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

export function validateRecapParagraph(text: string): RecapGrammarResult {
  const cleaned = cleanRecapLine(text);
  if (!cleaned) return { ok: false, reason: "empty paragraph" };

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  for (const sentence of sentences) {
    const result = validateRecapLine(sentence);
    if (!result.ok) return result;
  }

  return { ok: true };
}

export function fillRecapTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(val));
  }
  return cleanRecapLine(out);
}

function templateVarsAreValid(
  template: string,
  vars: Record<string, string | number>
): boolean {
  for (const key of [...template.matchAll(/\{([a-zA-Z_]+)\}/g)].map((m) => m[1]!)) {
    const val = vars[key];
    if (val === undefined || val === null || val === "") return false;
  }
  return true;
}

export function pickGatedRecapPhrase(
  seed: string,
  phrases: readonly string[],
  vars: Record<string, string | number>
): string | null {
  if (!phrases.length) return null;

  const eligible = phrases.filter((template) => templateVarsAreValid(template, vars));
  if (!eligible.length) return null;

  const start = seededInt(`${seed}:recap`, 0, eligible.length - 1);

  for (let i = 0; i < eligible.length; i++) {
    const template = eligible[(start + i) % eligible.length]!;
    const line = fillRecapTemplate(template, vars);
    if (validateRecapLine(line).ok) return line;
  }

  return null;
}
