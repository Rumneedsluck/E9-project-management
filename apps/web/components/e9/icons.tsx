/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * The E9 icon set: one small line drawing for every job stage, every scope of work and the common states.
 * All of them are drawn here by hand on a 24 x 24 grid with the same line weight, so they sit together.
 * An icon never stands alone for meaning: it always comes with its name (or the name is its tooltip).
 */

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@plane/utils";
import { getStatusMeta } from "./constants";
import { E9_HUES, inkOn } from "./palette";
import type { TE9ProjectStatus } from "./types";

type TIconProps = { className?: string; style?: CSSProperties };

function Icon({ className, style, children }: TIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      style={style}
    >
      {children}
    </svg>
  );
}

/* ---- stages -------------------------------------------------------------------------------------- */

const STAGE_PATHS = {
  /** an award rosette: the order is won */
  awarded: (
    <>
      <circle cx="12" cy="9" r="5.2" />
      <path d="M8.8 13.2 7.4 21l4.6-2.6 4.6 2.6-1.4-7.8" />
    </>
  ),
  /** a ruler: measuring the site */
  site_audit: (
    <>
      <rect x="2.6" y="7.6" width="18.8" height="8.8" rx="1.6" />
      <path d="M6.4 7.6v3.2M10.1 7.6v4.6M13.9 7.6v3.2M17.6 7.6v4.6" />
    </>
  ),
  /** crop marks round an artwork: print-ready files */
  pre_press: (
    <>
      <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
      <rect x="10.2" y="10.2" width="3.6" height="3.6" rx="0.6" />
    </>
  ),
  /** a printer */
  production: (
    <>
      <path d="M7 8V3.8h10V8" />
      <rect x="3.4" y="8" width="17.2" height="8.4" rx="2" />
      <path d="M7 13.6h10v6.6H7zM17.2 11h.01" />
    </>
  ),
  /** a roll of media: material received */
  material: (
    <>
      <ellipse cx="7" cy="12" rx="3.2" ry="6.6" />
      <path d="M7 5.4h9.8c1.8 0 3.2 3 3.2 6.6s-1.4 6.6-3.2 6.6H7M7 12h.01" />
    </>
  ),
  /** a delivery truck */
  delivery: (
    <>
      <path d="M2.6 15.8V6.8h10.8v9M13.4 9.8h3.9l3.3 3.3v2.7h-1.5M9.2 15.8h5.8M2.6 15.8h2.2" />
      <circle cx="7" cy="16.8" r="2.1" />
      <circle cx="17" cy="16.8" r="2.1" />
    </>
  ),
  /** a hard hat: the team is on site */
  installation: (
    <>
      <path d="M4.2 15.6a7.8 7.8 0 0 1 15.6 0" />
      <path d="M2.6 15.6h18.8v2.6H2.6zM10 8.1v4.4M14 8.1v4.4" />
    </>
  ),
  /** a ticked clipboard: the client signs off */
  sign_off: (
    <>
      <rect x="5" y="4.6" width="14" height="16.2" rx="2" />
      <path d="M9 4.6V3.4h6v1.2M8.7 13l2.3 2.3 4.4-4.7" />
    </>
  ),
  /** a ticked circle: closed */
  completed: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </>
  ),
  /** a pause sign */
  on_hold: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M10 9v6M14 9v6" />
    </>
  ),
} as const;

/** project stages plus the tracker's own stage names ("material", "delivered") */
export type TE9StageIconKey = keyof typeof STAGE_PATHS | "delivered";

export function E9StageIcon({ stage, className, style }: TIconProps & { stage: TE9StageIconKey }) {
  const key = stage === "delivered" ? "delivery" : stage;
  return (
    <Icon className={className} style={style}>
      {STAGE_PATHS[key] ?? STAGE_PATHS.awarded}
    </Icon>
  );
}

/* ---- scopes of work ------------------------------------------------------------------------------ */

const SCOPE_PATHS: Record<string, ReactNode> = {
  /** a mural on a wall */
  wall_graphics: (
    <>
      <rect x="3" y="4.4" width="18" height="15.2" rx="1.6" />
      <path d="m3 15.6 4.6-4.6 3.9 3.9 3-3 6.5 6.5" />
      <circle cx="15.6" cy="8.8" r="1.5" />
    </>
  ),
  /** a glass pane with a frosted band */
  glass_film: (
    <>
      <rect x="4" y="3.4" width="16" height="17.2" rx="1.6" />
      <path d="M4 10h16M4 14.2h16M12 3.4V10M12 14.2v6.4M7 7.6l1.6-1.6" />
    </>
  ),
  /** a hanging sign */
  internal_signages: (
    <>
      <rect x="4" y="8.4" width="16" height="9.2" rx="1.6" />
      <path d="M8 8.4 12 3.6l4 4.8M8 13h8" />
    </>
  ),
  /** a sign on a pole, outdoors */
  external_signages: (
    <>
      <rect x="5.6" y="3.4" width="12.8" height="8.4" rx="1.6" />
      <path d="M12 11.8v8.8M8.4 20.6h7.2M9 7.6h6" />
    </>
  ),
  /** a solid block */
  "3d_items": (
    <>
      <path d="m12 3.4 8 4.5v8.2l-8 4.5-8-4.5V7.9z" />
      <path d="m4 7.9 8 4.5 8-4.5M12 12.4v8.2" />
    </>
  ),
  /** a picture frame */
  frames: (
    <>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="1.6" />
      <rect x="7.6" y="7.6" width="8.8" height="8.8" rx="0.6" />
    </>
  ),
  /** a paint brush */
  hand_paintings: (
    <>
      <path d="M19.8 4.2 11.2 12.8" />
      <path d="M11.2 12.8a3.1 3.1 0 0 0-4.5 0c-1.4 1.4-.7 3.6-3.1 5.2 3.4.8 6.2.2 7.6-1.2a3.1 3.1 0 0 0 0-4z" />
    </>
  ),
  /** a price tag: work outside the tender */
  non_tender: (
    <>
      <path d="M3.4 12.4V4.4h8l9.2 9.2-8 8z" />
      <circle cx="8" cy="9" r="1.3" />
    </>
  ),
  /** a few different shapes */
  others: (
    <>
      <circle cx="7.2" cy="7.2" r="2.8" />
      <rect x="13.6" y="4.4" width="5.6" height="5.6" rx="1" />
      <path d="m7.2 13.6 3.2 5.6H4z" />
      <circle cx="16.4" cy="16.6" r="2.8" />
    </>
  ),
};

/** a stack of sheets: any scope the company added itself */
const CUSTOM_SCOPE = (
  <>
    <path d="m12 3.8 8.4 4.4-8.4 4.4-8.4-4.4z" />
    <path d="m3.6 12.2 8.4 4.4 8.4-4.4M3.6 16.2l8.4 4.4 8.4-4.4" />
  </>
);

export function E9ScopeIcon({ scope, className, style }: TIconProps & { scope: string }) {
  return (
    <Icon className={className} style={style}>
      {SCOPE_PATHS[scope] ?? CUSTOM_SCOPE}
    </Icon>
  );
}

/* ---- common states ------------------------------------------------------------------------------- */

const GLYPH_PATHS = {
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3 2" />
    </>
  ),
  alert: <path d="M12 4.2 21 19.6H3zM12 10.2v4.4M12 17.3h.01" />,
  check: <path d="m5 12.6 4.4 4.4L19 7" />,
  calendar: (
    <>
      <rect x="3.6" y="5" width="16.8" height="15.4" rx="2" />
      <path d="M3.6 10h16.8M8 3.4V6.6M16 3.4V6.6" />
    </>
  ),
  rupee: <path d="M7 5h10M7 9.2h10M7 5h3.2a4.2 4.2 0 0 1 0 8.4H7l7.4 6.6" />,
  pin: (
    <>
      <path d="M12 21s6.8-6 6.8-11.2a6.8 6.8 0 0 0-13.6 0C5.2 15 12 21 12 21z" />
      <circle cx="12" cy="9.8" r="2.4" />
    </>
  ),
  layers: CUSTOM_SCOPE,
  area: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M4 9.4h3M4 14.6h3M9.4 20v-3M14.6 20v-3" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8.4" r="3.2" />
      <path d="M3.2 19.6a5.8 5.8 0 0 1 11.6 0M16 5.6a3.2 3.2 0 0 1 0 5.8M17.2 14.4a5.6 5.6 0 0 1 3.6 5.2" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
} as const;

export type TE9Glyph = keyof typeof GLYPH_PATHS;

export function E9Glyph({ name, className, style }: TIconProps & { name: TE9Glyph }) {
  return (
    <Icon className={className} style={style}>
      {GLYPH_PATHS[name]}
    </Icon>
  );
}

/* ---- an icon on its own small coloured tile ------------------------------------------------------ */

const TILE_SIZES = {
  xs: { box: "size-5 rounded-[5px]", icon: "size-3" },
  sm: { box: "size-6 rounded-md", icon: "size-3.5" },
  md: { box: "size-8 rounded-lg", icon: "size-[18px]" },
  lg: { box: "size-10 rounded-[10px]", icon: "size-5" },
};

type TTileProps = {
  color: string;
  size?: keyof typeof TILE_SIZES;
  /** a pale tile with a dark drawing (quieter, for dense lists) instead of a solid one */
  soft?: boolean;
  className?: string;
  children: (iconClass: string) => ReactNode;
};

/** The tile every stage and scope icon sits on: filled with that stage's or scope's own colour. */
export function E9IconTile({ color, size = "md", soft = false, className, children }: TTileProps) {
  const dims = TILE_SIZES[size];
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center", dims.box, soft && "text-primary", className)}
      style={
        soft
          ? {
              backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 38%, transparent)`,
            }
          : { backgroundColor: color, color: inkOn(color), boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.22)" }
      }
    >
      {children(dims.icon)}
    </span>
  );
}

export function E9StageTile({
  status,
  size,
  soft,
  className,
}: {
  status: TE9ProjectStatus;
  size?: keyof typeof TILE_SIZES;
  soft?: boolean;
  className?: string;
}) {
  const meta = getStatusMeta(status);
  return (
    <E9IconTile color={meta.color} size={size} soft={soft} className={className}>
      {(iconClass) => <E9StageIcon stage={status} className={iconClass} />}
    </E9IconTile>
  );
}

export function E9ScopeTile({
  scope,
  color,
  size,
  soft,
  className,
}: {
  scope: string;
  /** the scope's colour (from scopeColor) */
  color?: string;
  size?: keyof typeof TILE_SIZES;
  soft?: boolean;
  className?: string;
}) {
  return (
    <E9IconTile color={color ?? E9_HUES.grey} size={size} soft={soft} className={className}>
      {(iconClass) => <E9ScopeIcon scope={scope} className={iconClass} />}
    </E9IconTile>
  );
}
