"use client";

import { useSyncExternalStore } from "react";
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from "@/lib/sound-mute";

function SpeakerOnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 4.5h2.2L7.2 2v10L4.2 9.5H2a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Zm5.4 1.1a3.5 3.5 0 0 1 0 2.8.5.5 0 1 0 .9.4 4.5 4.5 0 0 0 0-3.6.5.5 0 1 0-.9.4Zm1.6-1.6a6 6 0 0 1 0 7.8.5.5 0 1 0 .8.6 7 7 0 0 0 0-9 .5.5 0 1 0-.8.6Z"
      />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 4.5h2.2L7.2 2v10L4.2 9.5H2a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Z"
      />
      <path
        d="M8.3 4.8 12.2 9.2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SoundMuteButton() {
  const muted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted, () => false);

  return (
    <button
      type="button"
      className={`sound-mute-btn${muted ? " is-muted" : ""}`}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Unmute sound" : "Mute sound"}
      onClick={() => setSoundMuted(!muted)}
    >
      {muted ? <SpeakerMutedIcon /> : <SpeakerOnIcon />}
    </button>
  );
}
