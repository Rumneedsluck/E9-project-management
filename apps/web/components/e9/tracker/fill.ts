/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Excel-style "fill" for the tracker: what values go into the cells you drag over.
 *   copy   -> the same value (or the selected block, repeated)
 *   series -> counts up: "Wall 1" -> "Wall 2", "1st Floor" -> "2nd Floor", 5, 10 -> 15, 20 ...
 */

export type TFillMode = "copy" | "series";

const ORDINAL = /^(st|nd|rd|th)$/i;

const ordinalSuffix = (value: number): string => {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
};

/** Add `steps` to the last number in a text ("Wall 1" + 2 = "Wall 3", "1st Floor" + 1 = "2nd Floor"). null = no number. */
export const bumpText = (text: string, steps: number): string | null => {
  const matches = [...text.matchAll(/\d+/g)];
  const last = matches[matches.length - 1];
  if (!last || last.index === undefined) return null;
  const digits = last[0];
  const next = Number(digits) + steps;
  if (!Number.isFinite(next) || next < 0) return null;
  const start = last.index;
  const end = start + digits.length;
  const padded = digits.length > 1 && digits.startsWith("0") ? String(next).padStart(digits.length, "0") : String(next);
  // keep an ordinal ending right after the number correct ("1st" -> "2nd", "3rd" -> "4th")
  const after = /^[a-z]{2}/i.exec(text.slice(end))?.[0] ?? "";
  const suffix = ORDINAL.test(after) ? ordinalSuffix(next) : after;
  const keepCase = ORDINAL.test(after) && after === after.toUpperCase() ? suffix.toUpperCase() : suffix;
  return text.slice(0, start) + padded + (ORDINAL.test(after) ? keepCase + text.slice(end + 2) : text.slice(end));
};

const isPlainNumber = (value: string) => value.trim() !== "" && Number.isFinite(Number(value.trim().replace(/,/g, "")));

/** Can dragging these cells count up? (one text with a number in it, or two or more numbers with a steady step) */
export const canCountUp = (source: string[]): boolean => {
  if (source.length === 0) return false;
  if (source.length === 1) return /\d/.test(source[0]) && !isPlainNumber(source[0]);
  if (!source.every(isPlainNumber)) return false;
  const numbers = source.map((value) => Number(value.replace(/,/g, "")));
  const step = numbers[1] - numbers[0];
  return (
    step !== 0 && numbers.every((value, index) => index === 0 || Math.abs(value - numbers[index - 1] - step) < 1e-9)
  );
};

/**
 * The values for the cells that are filled. `source` = the selected cells of one column (top to bottom),
 * `count` = how many new cells, `direction` = which way the fill runs (down = below the selection).
 */
export const fillValues = (source: string[], count: number, direction: "down" | "up", mode: TFillMode): string[] => {
  if (source.length === 0) return [];
  const out: string[] = [];
  const sign = direction === "down" ? 1 : -1;
  const series = mode === "series" && canCountUp(source);
  for (let i = 0; i < count; i += 1) {
    if (series && source.length === 1) {
      out.push(bumpText(source[0], sign * (i + 1)) ?? source[0]);
    } else if (series) {
      const numbers = source.map((value) => Number(value.replace(/,/g, "")));
      const step = numbers[1] - numbers[0];
      const value = direction === "down" ? numbers[numbers.length - 1] + step * (i + 1) : numbers[0] - step * (i + 1);
      out.push(value < 0 ? source[0] : String(Math.round(value * 1e6) / 1e6));
    } else if (direction === "down") {
      out.push(source[i % source.length]);
    } else {
      out.push(source[(((source.length - 1 - i) % source.length) + source.length) % source.length]);
    }
  }
  return out;
};
