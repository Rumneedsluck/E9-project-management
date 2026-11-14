/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Sizes are typed in the sheet's unit but always stored in inches. */
export type TE9SizeUnit = "in" | "ft" | "mm";

export const SIZE_UNIT_LABEL: Record<TE9SizeUnit, string> = { in: "inches", ft: "feet", mm: "millimetres" };
export const SIZE_UNIT_SHORT: Record<TE9SizeUnit, string> = { in: "in", ft: "ft", mm: "mm" };
const INCHES_PER_UNIT: Record<TE9SizeUnit, number> = { in: 1, ft: 12, mm: 1 / 25.4 };
const SHOWN_DECIMALS: Record<TE9SizeUnit, number> = { in: 2, ft: 3, mm: 1 };

const trim = (value: number, decimals: number): string => String(Number(value.toFixed(decimals)));

/** Inches (as stored) -> the text shown in the sheet's unit. */
export const toDisplay = (inches: string | null | undefined, unit: TE9SizeUnit = "in"): string | null => {
  if (inches === null || inches === undefined || inches === "") return null;
  const number = Number(inches);
  if (!Number.isFinite(number)) return null;
  return trim(number / INCHES_PER_UNIT[unit], SHOWN_DECIMALS[unit]);
};

/** What the person typed (in the sheet's unit) -> inches to save, 2 decimals; undefined if not a number. */
export const fromDisplay = (typed: string | null | undefined, unit: TE9SizeUnit = "in"): string | null | undefined => {
  const clean = (typed ?? "").trim().replace(/,/g, "");
  if (clean === "") return null;
  const number = Number(clean);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return (number * INCHES_PER_UNIT[unit]).toFixed(2);
};

/** Column heading, e.g. "H (ft)". */
export const sizeHeading = (label: string, unit: TE9SizeUnit = "in"): string =>
  label.replace(/\((in|ft|mm)\)/, `(${SIZE_UNIT_SHORT[unit]})`);
