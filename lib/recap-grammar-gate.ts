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

const RECAP_ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const RECAP_TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

/** Spell out a non-negative integer for recap prose (e.g. 3 → "three"). */
export function spellRecapNumber(n: number): string {
  const value = Math.round(Math.abs(n));
  if (value < 20) return RECAP_ONES[value]!;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return ones ? `${RECAP_TENS[tens]}-${RECAP_ONES[ones]}` : RECAP_TENS[tens]!;
  }
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    if (!rest) return `${RECAP_ONES[hundreds]} hundred`;
    return `${RECAP_ONES[hundreds]} hundred ${spellRecapNumber(rest)}`;
  }
  return String(value);
}

/** Replace numerals at sentence or semicolon-clause starts with spelled-out words. */
export function spellOutLeadingNumerals(text: string): string {
  return text.replace(
    /(^|[.;!?]\s+|;\s+)(\d[\d,]*)\b/g,
    (match, prefix: string, numStr: string) => {
      const num = Number(numStr.replace(/,/g, ""));
      if (!Number.isFinite(num)) return match;
      return `${prefix}${spellRecapNumber(num)}`;
    }
  );
}

export function finalizeRecapLine(text: string): string {
  return spellOutLeadingNumerals(cleanRecapLine(text));
}

export function finalizeRecapParagraph(text: string): string {
  return finalizeRecapLine(text);
}

function startsWithNumeral(text: string): boolean {
  return /^\d/.test(text.trim());
}

function validateNoLeadingNumerals(text: string): RecapGrammarResult {
  if (startsWithNumeral(text)) {
    return { ok: false, reason: "starts with numeral" };
  }
  for (const clause of text.split(/\s*;\s*/)) {
    if (clause && startsWithNumeral(clause)) {
      return { ok: false, reason: "clause starts with numeral" };
    }
  }
  return { ok: true };
}

export function cleanRecapLine(text: string): string {
  let result = text.replace(/\s+/g, " ").trim();
  result = result.replace(/ \./g, ".").replace(/ ,/g, ",");
  result = result.replace(/;\s*\./g, ";").replace(/\.\s*;/g, ";");
  result = result.replace(/;{2,}/g, ";");
  result = result.replace(/\.{2,}/g, ".");
  return result;
}

/** Clean recap text without stripping edge spaces — keeps gaps around inline name segments. */
export function cleanRecapTextSegment(text: string): string {
  if (!text) return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const core = text.slice(leading.length, text.length - trailing.length);
  if (!core) return text;

  let cleaned = core.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/ \./g, ".").replace(/ ,/g, ",");
  cleaned = cleaned.replace(/;\s*\./g, ";").replace(/\.\s*;/g, ";");
  cleaned = cleaned.replace(/;{2,}/g, ";");
  cleaned = cleaned.replace(/\.{2,}/g, ".");
  cleaned = spellOutLeadingNumerals(cleaned);
  return leading + cleaned + trailing;
}

export function validateRecapLine(text: string): RecapGrammarResult {
  const cleaned = finalizeRecapLine(text);
  if (!cleaned) return { ok: false, reason: "empty line" };
  if (cleaned.includes("  ")) return { ok: false, reason: "duplicate spaces" };
  if (cleaned.includes("..") || cleaned.includes(",,") || cleaned.includes(";;")) {
    return { ok: false, reason: "doubled punctuation" };
  }
  if (/[.;!?]{2,}/.test(cleaned) || cleaned.includes(".;") || cleaned.includes(";.")) {
    return { ok: false, reason: "broken punctuation sequence" };
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

  if (/\b1 \w+s\b/i.test(cleaned) && !/\b1 (points|times|hours|minutes|seconds|racers)\b/i.test(cleaned)) {
    const badSingularPlural = /\b1 (collapses|stalls|surges|injuries|fights|bursts)\b/i;
    if (badSingularPlural.test(cleaned)) {
      return { ok: false, reason: "singular count with plural noun" };
    }
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

  const numeralCheck = validateNoLeadingNumerals(cleaned);
  if (!numeralCheck.ok) return numeralCheck;

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
  const cleaned = finalizeRecapParagraph(text);
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
    const line = finalizeRecapLine(fillRecapTemplate(template, vars));
    if (validateRecapLine(line).ok) return line;
  }

  return null;
}
