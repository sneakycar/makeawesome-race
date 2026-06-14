import type { ReactNode } from "react";

export type RaceIconId = "lead" | "comeback" | "last" | "fight" | "injured" | "check" | "star";

function Svg({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Flat single-color icons — no emoji, no 3D shading. */
export function FlatIcon({ id, className }: { id: RaceIconId; className?: string }) {
  switch (id) {
    case "lead":
      return (
        <Svg className={className}>
          <path
            fill="currentColor"
            d="M4 1h8v3a2.5 2.5 0 0 1-2 2.4V9h2v2H6V9h2V6.4a2.5 2.5 0 0 1-2-2.4V1zm2 2v1a1 1 0 0 0 2 0V3H6zm1 10h2v1H7v-1z"
          />
        </Svg>
      );
    case "comeback":
      return (
        <Svg className={className}>
          <ellipse cx="5.5" cy="6.5" rx="2" ry="2.2" fill="currentColor" />
          <ellipse cx="10.5" cy="6.5" rx="2" ry="2.2" fill="currentColor" />
          <path fill="currentColor" d="M3 12c0-2 2.2-3.2 5-3.2s5 1.2 5 3.2H3z" />
        </Svg>
      );
    case "last":
      return (
        <Svg className={className}>
          <path
            fill="currentColor"
            d="M8 2a4 4 0 0 0-4 4c0 1.4.7 2.6 1.8 3.3L5.2 13h5.6l-.6-3.7A4 4 0 0 0 12 6a4 4 0 0 0-4-4zm-1.5 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm3 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM6 10.5h4v1H6v-1z"
          />
        </Svg>
      );
    case "fight":
      return (
        <Svg className={className}>
          <path
            fill="currentColor"
            d="M4 4.5h8a2 2 0 0 1 2 2v4.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a2 2 0 0 1 2-2zm1.5 2.5h5v1h-5v-1zm0 2h5v1h-5v-1z"
          />
        </Svg>
      );
    case "injured":
      return (
        <Svg className={className}>
          <path
            fill="currentColor"
            d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm4 3v3H4v2h3v3h2v-3h3V8h-3V5H7z"
          />
        </Svg>
      );
    case "check":
      return (
        <Svg className={className}>
          <path fill="currentColor" d="m6.1 11.3-2.8-2.8 1.1-1.1 1.7 1.7 4.6-4.6 1.1 1.1-5.7 5.7z" />
        </Svg>
      );
    case "star":
      return (
        <Svg className={className}>
          <path
            fill="currentColor"
            d="M8 2 9.4 5.7 13.3 6.1 10.2 8.7 11.1 12.5 8 10.6 4.9 12.5 5.8 8.7 2.7 6.1 6.6 5.7 8 2z"
          />
        </Svg>
      );
    default:
      return null;
  }
}
