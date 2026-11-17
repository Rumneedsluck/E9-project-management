/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Small line drawings for empty pages and for the four doors on Home. Drawn here by hand in the E9 look:
 * ink lines, one touch of E9 red, brass crop marks. They follow the light / dark theme through the theme's
 * own colours, and the lines draw themselves once when the picture first appears (never on a loop).
 */

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@plane/utils";
import { E9_HUES } from "./palette";

const RED = "var(--brand-default)";
const BRASS = "var(--e9-brass)";
const SOFT = "var(--e9-grid)";
const PAPER = "var(--e9-hover)";

/** a line that draws itself; `i` sets its turn */
const draw = (i: number) => ({ pathLength: 1, className: "e9-draw", style: { "--i": i } as CSSProperties });

/** four brass crop marks round a box */
function CropMarks({
  x,
  y,
  w,
  h,
  gap = 5,
  len = 7,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  gap?: number;
  len?: number;
}) {
  const r = x + w;
  const b = y + h;
  return (
    <path
      stroke={BRASS}
      strokeWidth={1.4}
      d={[
        `M${x - gap - len} ${y}h${len}M${x} ${y - gap - len}v${len}`,
        `M${r + gap} ${y}h${len}M${r} ${y - gap - len}v${len}`,
        `M${x - gap - len} ${b}h${len}M${x} ${b + gap}v${len}`,
        `M${r + gap} ${b}h${len}M${r} ${b + gap}v${len}`,
      ].join("")}
    />
  );
}

const ART = {
  /** a blank proof sheet with a ruler: nothing here yet, start adding */
  "blank-sheet": (
    <>
      <ellipse cx="80" cy="108" rx="48" ry="4.5" fill={SOFT} stroke="none" opacity="0.7" />
      <g transform="rotate(-4 80 58)">
        <rect x="48" y="16" width="64" height="84" rx="3" fill={PAPER} {...draw(0)} />
        <path stroke={SOFT} strokeWidth={3.5} d="M58 34h28M58 45h44M58 56h36M58 67h40" />
        <CropMarks x={48} y={16} w={64} h={84} />
      </g>
      <g transform="rotate(9 62 96)">
        <rect x="22" y="88" width="80" height="13" rx="2.5" fill={PAPER} {...draw(2)} />
        <path d="M32 88v5M42 88v7M52 88v5M62 88v7M72 88v5M82 88v7M92 88v5" strokeWidth={1.4} />
      </g>
      <circle cx="116" cy="24" r="11.5" fill={RED} stroke="none" />
      <path d="M116 18.4v11.2M110.4 24h11.2" stroke="#fff" strokeWidth={2.4} />
    </>
  ),
  /** a magnifier over a sheet: nothing matches the search */
  "no-match": (
    <>
      <ellipse cx="80" cy="108" rx="48" ry="4.5" fill={SOFT} stroke="none" opacity="0.7" />
      <rect x="40" y="14" width="62" height="84" rx="3" fill={PAPER} {...draw(0)} />
      <path stroke={SOFT} strokeWidth={3.5} d="M50 30h26M50 41h42M50 52h20" />
      <CropMarks x={40} y={14} w={62} h={84} />
      <circle cx="98" cy="70" r="20" fill="var(--background-color-surface-1)" {...draw(2)} strokeWidth={2.6} />
      <path d="M112.6 84.6 128 100" strokeWidth={5} />
      <path d="m91.5 63.5 13 13M104.5 63.5l-13 13" stroke={RED} strokeWidth={2.6} />
    </>
  ),
  /** a hanging sign with a tick: nothing needs attention */
  "all-clear": (
    <>
      <ellipse cx="80" cy="108" rx="44" ry="4.5" fill={SOFT} stroke="none" opacity="0.7" />
      <path d="M36 20h76M36 12v24" strokeWidth={2.6} {...draw(0)} />
      <path d="M60 20v16M100 20v16" strokeWidth={1.4} />
      <rect x="46" y="36" width="68" height="46" rx="4" fill={PAPER} {...draw(1)} />
      <path d="m64 59 10.5 10.5L96 47" stroke={E9_HUES.green} strokeWidth={5} {...draw(3)} />
      <path stroke={BRASS} strokeWidth={1.6} d="M128 28v8M124 32h8M28 78v8M24 82h8M132 74v6M129 77h6" />
    </>
  ),
  /** a plug pulled out of its socket: the page could not load */
  offline: (
    <>
      <ellipse cx="80" cy="104" rx="50" ry="4.5" fill={SOFT} stroke="none" opacity="0.7" />
      <path d="M30 60c-12 0-17 9-15 24" {...draw(0)} />
      <rect x="30" y="47" width="30" height="26" rx="6" fill={PAPER} {...draw(1)} />
      <path d="M60 54h11M60 66h11" strokeWidth={3} />
      <rect x="98" y="41" width="38" height="38" rx="7" fill={PAPER} {...draw(2)} />
      <path d="M110 54v6M124 54v6M112 69h10" strokeWidth={3} />
      <path d="M136 60h14" />
      <path d="m80 40 6 11-9 7 6 13" stroke={RED} strokeWidth={2.6} {...draw(4)} />
    </>
  ),
  /** an invoice and a few coins: no bills yet */
  "no-bills": (
    <>
      <ellipse cx="80" cy="108" rx="50" ry="4.5" fill={SOFT} stroke="none" opacity="0.7" />
      <rect x="42" y="12" width="58" height="86" rx="3" fill={PAPER} {...draw(0)} />
      <circle cx="71" cy="33" r="11" stroke={BRASS} />
      <path d="M66.5 28h9M66.5 31.6h9M66.5 28h2.8a3.6 3.6 0 0 1 0 7.2h-2.8l6.2 5.4" stroke={BRASS} strokeWidth={1.5} />
      <path stroke={SOFT} strokeWidth={3.5} d="M52 56h38M52 66h38M52 76h18" />
      <path d="M78 86h12" stroke={RED} strokeWidth={3} />
      <g fill={PAPER}>
        <path d="M104 92v-8c0 2.6 6.3 4.6 14 4.6s14-2 14-4.6v8c0 2.6-6.3 4.6-14 4.6s-14-2-14-4.6z" {...draw(2)} />
        <path d="M104 84v-8c0 2.6 6.3 4.6 14 4.6s14-2 14-4.6v8" {...draw(3)} />
        <ellipse cx="118" cy="76" rx="14" ry="4.6" {...draw(4)} />
      </g>
    </>
  ),
} as const;

export type TE9Art = keyof typeof ART;

/** A spot drawing for an empty or error state. Decorative: the words next to it say what happened. */
export function E9Art({ name, className }: { name: TE9Art; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-[120px] w-40 shrink-0 text-primary", className)}
    >
      {ART[name]}
    </svg>
  );
}

/* ---- the four doors on Home: each gets its own little picture that moves a touch when the card is pointed at ---- */

const DOOR_ART: Record<string, ReactNode> = {
  /** a fan of site cards */
  projects: (
    <>
      <g className="e9-fan e9-fan-l">
        <rect x="20" y="20" width="38" height="46" rx="3" fill={PAPER} />
        <path d="M20 26h38" stroke={E9_HUES.blue} strokeWidth={4} />
      </g>
      <g className="e9-fan e9-fan-r">
        <rect x="38" y="20" width="38" height="46" rx="3" fill={PAPER} />
        <path d="M38 26h38" stroke={E9_HUES.teal} strokeWidth={4} />
      </g>
      <g className="e9-fan">
        <rect x="29" y="14" width="38" height="50" rx="3" fill={PAPER} />
        <path d="M29 20h38" stroke={RED} strokeWidth={4} />
        <path d="M36 32h18M36 40h24M36 48h14" stroke={SOFT} strokeWidth={3} />
      </g>
    </>
  ),
  /** bars and a ring */
  dashboard: (
    <>
      <path d="M12 62h60" />
      <g className="e9-bars" strokeWidth={7}>
        <path d="M22 58V44" stroke={SOFT} />
        <path d="M36 58V32" stroke="currentColor" />
        <path d="M50 58V40" stroke={SOFT} />
        <path d="M64 58V22" stroke={RED} />
      </g>
      <circle cx="78" cy="18" r="9" stroke={SOFT} strokeWidth={3.5} />
      <path d="M78 9a9 9 0 0 1 8.6 11.6" stroke={BRASS} strokeWidth={3.5} className="e9-spin-once" />
    </>
  ),
  /** an invoice with a stamp */
  billing: (
    <>
      <rect x="20" y="8" width="42" height="56" rx="3" fill={PAPER} />
      <path d="M28 20h26M28 29h26M28 38h14" stroke={SOFT} strokeWidth={3} />
      <path d="M44 50h10" stroke={RED} strokeWidth={3} />
      <g className="e9-stamp">
        <circle cx="68" cy="46" r="13" fill="var(--background-color-surface-1)" stroke={BRASS} strokeWidth={2} />
        <path
          d="M63.6 40.6h8.8M63.6 44.2h8.8M63.6 40.6h2.8a3.6 3.6 0 0 1 0 7.2h-2.8l6.2 5.2"
          stroke={BRASS}
          strokeWidth={1.7}
        />
      </g>
    </>
  ),
  /** a new sheet with a plus */
  new: (
    <>
      <rect x="24" y="8" width="44" height="56" rx="3" fill={PAPER} strokeDasharray="4 4" />
      <CropMarks x={24} y={8} w={44} h={56} gap={4} len={5} />
      <g className="e9-plus">
        <circle cx="46" cy="36" r="11" fill={RED} stroke="none" />
        <path d="M46 30.4v11.2M40.4 36h11.2" stroke="#fff" strokeWidth={2.4} />
      </g>
    </>
  ),
};

export type TE9DoorArt = "projects" | "dashboard" | "billing" | "new";

export function E9DoorArt({ name, className }: { name: TE9DoorArt; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 72"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("e9-door-art h-[72px] w-24 shrink-0 text-primary", className)}
    >
      {DOOR_ART[name]}
    </svg>
  );
}
