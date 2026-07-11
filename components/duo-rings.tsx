import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DuoRingsState = "solo" | "pending" | "paired";

type DuoRingsPartner = {
  initials: string;
  /** Full name for assistive tech; falls back to `initials` if omitted. */
  name?: string;
};

type DuoRingsProps = {
  state: DuoRingsState;
  partnerA: DuoRingsPartner;
  /** Omit for `state === "solo"` — the second ring renders as an empty dashed seat. */
  partnerB?: DuoRingsPartner;
  /** Diameter of each circle in px. Default 72 (hero); also used at 24 for the app-bar chip. */
  size?: number;
  /** Optional chip anchored in the seam over the overlap, e.g. an editable "us" label. */
  label?: ReactNode;
  className?: string;
};

/**
 * The "Duo Rings" signature element — two overlapping circles that ARE the
 * partnership state machine (brief §Fable 5). Ring color is derived from
 * `state`, not accepted as a prop: partner A is always periwinkle, and the
 * brief locks amber to the pending state only ("never mix amber into
 * paired") — letting a caller pass an arbitrary partner-B color could
 * violate that invariant, so it's baked in here instead.
 *
 * Plain `rounded-full` divs only (no SVG). Initials render in
 * `text-foreground`, matching `member-avatar.tsx`'s AA-contrast pattern —
 * `color.color` alone doesn't reliably clear 4.5:1 against its own tint.
 */
export function DuoRings({ state, partnerA, partnerB, size = 72, label, className }: DuoRingsProps) {
  const overlap = size / 3;
  const strokeWidth = size <= 32 ? 2 : 4;
  const fontSize = Math.max(10, Math.round(size * 0.32));

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <div
        role="img"
        aria-label={partnerA.name ?? partnerA.initials}
        title={partnerA.name ?? partnerA.initials}
        className="relative flex shrink-0 items-center justify-center rounded-full border-solid border-duo-teal bg-duo-teal-tint font-semibold text-foreground"
        style={{ width: size, height: size, borderWidth: strokeWidth, fontSize }}
      >
        {partnerA.initials}
      </div>

      {state === "solo" ? (
        <div
          aria-hidden
          className="relative shrink-0 rounded-full border-dashed border-muted-foreground/40 bg-transparent"
          style={{ width: size, height: size, borderWidth: strokeWidth, marginLeft: -overlap }}
        />
      ) : (
        <div
          role="img"
          aria-label={partnerB?.name ?? partnerB?.initials}
          title={partnerB?.name ?? partnerB?.initials}
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-full border-solid font-semibold text-foreground",
            state === "pending"
              ? "border-duo-coral bg-duo-coral-tint motion-safe:animate-pulse"
              : "border-duo-gold bg-duo-gold-tint",
          )}
          style={{ width: size, height: size, borderWidth: strokeWidth, marginLeft: -overlap, fontSize }}
        >
          {partnerB?.initials}
        </div>
      )}

      {label ? (
        <div
          className="absolute left-1/2 z-10 -translate-x-1/2"
          style={{ bottom: -Math.round(size * 0.15) }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
