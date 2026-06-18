import { isSoundMuted } from "./sound-mute";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

/** Short broadcast sting when the 15m pack rips. */
export function playTickBurstSound(): void {
  if (isSoundMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = "square";
  thump.frequency.setValueAtTime(196, now);
  thump.frequency.exponentialRampToValueAtTime(48, now + 0.14);
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.11, now + 0.012);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  thump.connect(thumpGain);
  thumpGain.connect(ctx.destination);
  thump.start(now);
  thump.stop(now + 0.22);

  const snap = ctx.createOscillator();
  const snapGain = ctx.createGain();
  snap.type = "triangle";
  snap.frequency.setValueAtTime(880, now + 0.08);
  snap.frequency.exponentialRampToValueAtTime(220, now + 0.16);
  snapGain.gain.setValueAtTime(0.0001, now + 0.08);
  snapGain.gain.exponentialRampToValueAtTime(0.07, now + 0.09);
  snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  snap.connect(snapGain);
  snapGain.connect(ctx.destination);
  snap.start(now + 0.08);
  snap.stop(now + 0.22);
}
