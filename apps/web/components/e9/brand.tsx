/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, type ReactNode } from "react";
import { cn } from "@plane/utils";

/**
 * E9 Creative identity in one place. Change the name, tagline or logo here and
 * every E9 screen (login, sidebar, dashboard) picks it up.
 * The brand colour itself lives in styles/e9-theme.css.
 */
export const E9_BRAND = {
  name: "E9 Creative",
  shortName: "E9",
  tagline: "Projects & Operations",
  productName: "E9 Operations",
  loginHeadline: "Every project, every site, on schedule.",
  loginDescription:
    "Plan, produce and deliver projects with your whole team in one place — from the first site visit to client sign-off.",
} as const;

type TE9LogoMarkProps = {
  className?: string;
};

// E9 logo outline, converted from E9_New_Logo.cdr (red E9 + TM)
const E9_LOGO_PATH =
  "M 6970,5638 L 6970,5638 6670,5747 6317,5801 6018,5774 5746,5665 5475,5529 5257,5339 5094,5122 4958,4850 4877,4551 4849,4225 4904,3844 4985,3517 5148,3218 5366,2974 5610,2756 5937,2620 6290,2512 6670,2485 7025,2512 7378,2620 7650,2756 7921,2974 8112,3218 8248,3517 8356,3844 8383,4225 8329,4687 8248,4959 8166,5230 7894,5801 7541,6400 6725,7596 5529,7596 6970,5638 Z M 6970,5638 L 6970,5638 Z M 7378,4170 L 7378,4170 7324,3844 7188,3599 6943,3436 6780,3381 6616,3381 6453,3381 6317,3436 6181,3490 6072,3599 5909,3844 5855,4170 5909,4524 6072,4768 6181,4877 6317,4931 6643,4986 6807,4959 6943,4931 7079,4850 7188,4768 7324,4497 7378,4170 Z M 7378,4170 L 7378,4170 Z M 1778,7677 L 1778,7677 1778,2620 4741,2620 4741,3517 2837,3517 2837,4578 4741,4578 4741,5475 2837,5475 2837,6753 4741,6753 4741,7677 1778,7677 Z";
const E9_TM_T =
  "M 7648,7649 L 7648,7649 7648,7213 7485,7213 7485,7159 7866,7159 7866,7213 7703,7213 7703,7649 7648,7649 Z";
const E9_TM_M =
  "M 7920,7649 L 7920,7649 7920,7159 8028,7159 8137,7513 8137,7567 8165,7486 8301,7159 8383,7159 8383,7649 8301,7649 8301,7240 8165,7649 8110,7649 7974,7240 7974,7649 7920,7649 Z";

/** The E9 logo on its black square, as in the brand file. */
export function E9LogoMark({ className }: TE9LogoMarkProps) {
  return (
    <svg viewBox="0 0 10161 10161" role="img" aria-label={E9_BRAND.name} className={cn("size-8 shrink-0", className)}>
      <rect width="10161" height="10161" rx="2200" fill="#0B0B0B" />
      <path fill="#DA1E26" d={E9_LOGO_PATH} />
      <path fill="#fff" d={E9_TM_T} />
      <path fill="#fff" d={E9_TM_M} />
    </svg>
  );
}

/** Just the red E9 (no square) – for light or dark backgrounds; the TM follows the text colour. */
export function E9Wordmark({ className }: TE9LogoMarkProps) {
  return (
    <svg viewBox="1700 2400 6760 5360" role="img" aria-label={E9_BRAND.name} className={cn("h-8 w-auto", className)}>
      <path fill="#DA1E26" d={E9_LOGO_PATH} />
      <path fill="currentColor" d={E9_TM_T} />
      <path fill="currentColor" d={E9_TM_M} />
    </svg>
  );
}

/** Writes any text so that "E9" shows as the real red E9 logo letters, never as plain text. */
export function E9Text({ children }: { children: string }): ReactNode {
  const parts = children.split("E9");
  return parts.map((part, index) => (
    // eslint-disable-next-line react/no-array-index-key
    <Fragment key={index}>
      {index > 0 && (
        <svg
          viewBox="1700 2400 6760 5360"
          role="img"
          aria-label="E9"
          className="mx-[0.06em] inline-block h-[0.82em] w-auto align-baseline"
        >
          <path fill="#DA1E26" d={E9_LOGO_PATH} />
        </svg>
      )}
      {part}
    </Fragment>
  ));
}

type TE9LogoProps = {
  className?: string;
  /** Show the tagline under the name */
  withTagline?: boolean;
  /** Use white text (for dark/red backgrounds) */
  inverse?: boolean;
  /** Bigger mark, for the sign-in screen */
  large?: boolean;
};

/** Full lockup: mark + "E9 Creative" (+ optional tagline). */
export function E9Logo({ className, withTagline = false, inverse = false, large = false }: TE9LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <E9LogoMark className={large ? "size-14 rounded-xl ring-1 ring-white/10" : undefined} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            large ? "text-h5-semibold" : "text-body-md-bold",
            "tracking-tight",
            inverse ? "text-white" : "text-primary"
          )}
        >
          <E9Text>{E9_BRAND.name}</E9Text>
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
