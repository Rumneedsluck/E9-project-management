/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * The E9 chart colours, in one place. Stages, scopes and the tracker's stage bands all take their
 * colour from here, so a stage is the same colour on every screen.
 *
 * These shades were checked with a palette validator (lightness, colour strength, and how far apart
 * neighbours are for full-colour and colour-blind readers):
 *   stage order   blue, violet, amber, orange, teal, green, deep green, red
 *   scope order   brand red, blue, amber, orange, violet, teal, green, magenta
 * Neighbours in both orders pass on the light and the dark surface. Two known limits:
 *   - amber is lighter than the ideal band for the dark theme, and under 3:1 against the light paper,
 *     so a stage or scope is never shown by colour alone: it always has its icon and its name;
 *   - one shade serves both themes, because the Ring view draws its cards as pictures that cannot read
 *     the theme.
 * Before changing a shade, re-check the two orders above against both surfaces (#fffefb and #16120f).
 */
export const E9_HUES = {
  blue: "#4782FA",
  violet: "#753FE2",
  amber: "#E5A324",
  orange: "#E95D00",
  teal: "#2CA2A2",
  green: "#34AA31",
  deepGreen: "#1B7C4C",
  red: "#D7243C",
  /** exactly the logo red */
  brandRed: "#DA1E26",
  magenta: "#C2569A",
  /** "nothing started yet" and "everything else": a neutral, on purpose */
  grey: "#8B8D98",
} as const;

/** Text that sits inside a filled block of one of the colours above: near-black on amber, white on the rest. */
export const inkOn = (fill: string): string => (fill.toUpperCase() === E9_HUES.amber ? "#1B1512" : "#FFFFFF");
