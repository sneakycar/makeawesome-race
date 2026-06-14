export const RECAP_OPENER_PHRASES = [
  "Race {n} {opener}.",
] as const;

export const RECAP_WIN_PHRASES = [
  "{winner} seized the win at {score} points",
  "{winner} took the race at {score} points",
  "{winner} crossed first at {score} points",
] as const;

export const RECAP_MARGIN_PHRASES = [
  ", {margin} clear of {runnerUp} in {rank}",
  ", beating {runnerUp} by {margin} for {rank}",
  ", {margin} ahead of {runnerUp} in {rank}",
] as const;

export const RECAP_LAST_PHRASES = [
  "{loser} finished last at {score} and was eliminated to holding.",
  "{loser} brought up the rear at {score} and got sent to holding.",
  "{loser} ended the race at {score} and was eliminated to holding.",
] as const;

export const RECAP_WEATHER_PHRASES = [
  "the sky went wild — {total} weather bursts",
  "Mother Nature unloaded {total} weather bursts",
  "the elements hit {total} times",
] as const;

export const RECAP_FIGHT_PHRASES = [
  "{a} and {b} threw down mid-race.",
  "Fists flew when {a} and {b} got into it.",
  "{a} and {b} scrapped in the middle of the pack.",
] as const;

export const RECAP_FIGHT_MULTI_PHRASES = [
  "{count} separate fights broke out, including {first} and {second}.",
  "The field brawled {count} times — {first} and {second} among them.",
] as const;

export const RECAP_GOD_SCORE_PHRASES = [
  "somebody touched the forbidden 240 — GOD SCORE territory",
  "the leaderboard cracked open at 240 — a GOD SCORE moment",
] as const;

export const RECAP_CHAOS_SURGE_PHRASES = [
  "{count} chaos surge{plural} ripped through the field",
  "{count} chaos surge{plural} detonated across the standings",
] as const;

export const RECAP_STALL_PHRASES = [
  "{count} stall events stopped racers cold",
  "{count} long stalls froze the field",
] as const;

export const RECAP_RANK_SURGE_PHRASES = [
  "{count} rank surges shook the standings",
  "{count} rank surges rewrote the order",
] as const;

export const RECAP_COLLAPSE_PHRASES = [
  "{count} late collapse{plural} torched the leaderboard",
  "{count} collapse{plural} gutted the back half",
] as const;

export const RECAP_UNDERDOG_PHRASES = [
  "underdog pressure flared {count} time{plural}",
  "the long shots pushed back {count} time{plural}",
] as const;

export const RECAP_INJURY_PHRASES = [
  "{count} injur{injuryWord} forced racers off the track",
  "{count} injur{injuryWord} knocked racers out of the running",
] as const;

export const RECAP_DELAY_PHRASES = [
  "the race went dark during {title} — full delay",
  "the broadcast cut out for {title} — full race delay",
] as const;

export const RECAP_QUOTE_PHRASES = [
  "the broadcast desk lost it: \"{quote}\"",
  "the booth could not believe it: \"{quote}\"",
] as const;

export const RECAP_QUIET_PHRASES = [
  "No fights, no injuries, no race delay — just pure scoring warfare.",
  "No brawls, no injuries, no delay — just points and panic.",
] as const;

export const RECAP_OPENERS = [
  "belongs in the permanent highlight reel",
  "will be talked about in the pits for years",
  "delivered absolute carnage from wire to wire",
  "was not a race — it was a survival test",
  "refused to behave like a normal sporting event",
] as const;
