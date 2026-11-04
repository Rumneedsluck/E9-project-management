/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

/**
 * E9 Creative identity in one place. Change the name, tagline or logo here and
 * every E9 screen (login, sidebar, dashboard) picks it up.
 * The brand colour itself lives in styles/e9-theme.css.
 */
export const E9_BRAND = {
  name: "E9 Creative",
  shortName: "E9",
  tagline: "Signage & Branding",
  productName: "E9 Operations",
  loginHeadline: "Every site, every sign, on schedule.",
  loginDescription:
    "Plan, produce and install signage and branding projects with your whole team in one place — from site audit to client sign-off.",
} as const;

type TE9LogoMarkProps = {
  className?: string;
};

/** Square red "E9" mark. Replace the inside of this SVG with the real logo when available. */
export function E9LogoMark({ className }: TE9LogoMarkProps) {
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label={E9_BRAND.name} className={cn("size-8 shrink-0", className)}>
      <rect width="40" height="40" rx="9" className="fill-[var(--brand-default)]" />
      <text
        x="20"
        y="26.5"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="17"
        fontWeight="800"
        letterSpacing="-0.5"
        fill="#fff"
      >
        E9
      </text>
    </svg>
  );
}

type TE9LogoProps = {
  className?: string;
  /** Show the tagline under the name */
  withTagline?: boolean;
  /** Use white text (for dark/red backgrounds) */
  inverse?: boolean;
};

/** Full lockup: mark + "E9 Creative" (+ optional tagline). */
export function E9Logo({ className, withTagline = false, inverse = false }: TE9LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <E9LogoMark />
      <span className="flex flex-col leading-none">
        <span className={cn("text-body-md-bold tracking-tight", inverse ? "text-white" : "text-primary")}>
          {E9_BRAND.name}
        </span>
        {withTagline && (
          <span className={cn("mt-1 text-body-2xs-medium", inverse ? "text-white/70" : "text-tertiary")}>
            {E9_BRAND.tagline}
          </span>
        )}
      </span>
    </span>
  );
}
