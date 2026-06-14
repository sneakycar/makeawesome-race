"use client";

import { formatRacerName } from "@/lib/format";

export function BadMoneyModal({
  racerName,
  placing,
  busy,
  onConfirm,
  onCancel,
}: {
  racerName: string;
  placing: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const displayName = formatRacerName(racerName);

  return (
    <div className="bad-money-modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="bad-money-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bad-money-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="bad-money-modal-title" className="bad-money-modal-title">
          BAD MONEY
        </div>
        {placing ? (
          <p className="bad-money-modal-confirm">BAD MONEY ACCEPTED</p>
        ) : (
          <>
            <p className="bad-money-modal-lead">You are about to place bad money on:</p>
            <p className="bad-money-modal-name">{displayName}</p>
            <div className="bad-money-modal-warn">
              <p>If {displayName} loses this race:</p>
              <p>confidence may suffer</p>
              <p>future growth may slow</p>
              <p>long-term regression is possible</p>
            </div>
            <p className="bad-money-modal-note">This cannot be undone.</p>
            <div className="bad-money-modal-actions">
              <button
                type="button"
                className="bad-money-modal-btn"
                disabled={busy}
                onClick={onConfirm}
              >
                PLACE BET
              </button>
              <button type="button" className="bad-money-modal-btn bad-money-modal-cancel" onClick={onCancel}>
                CANCEL
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
