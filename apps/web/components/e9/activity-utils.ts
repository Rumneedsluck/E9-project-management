/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderFormattedDate } from "@plane/utils";

const DAYS = 30;

const pad = (value: number) => String(value).padStart(2, "0");
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The last `days` calendar days ending on `end`, each with its change count. */
export const lastDays = (counts: Map<string, number>, end: Date, days = DAYS) =>
  Array.from({ length: days }, (_, index) => {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1 - index));
    const iso = toIso(date);
    return { date, iso, count: counts.get(iso) ?? 0 };
  });

/** "5 min ago", "3 h ago", "Yesterday", or the date. */
export const ago = (iso: string, now: Date = new Date()): string => {
  const then = new Date(iso);
  const minutes = Math.round((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24 && then.getDate() === now.getDate()) return `${Math.round(minutes / 60)} h ago`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (toIso(then) === toIso(yesterday)) return "Yesterday";
  return renderFormattedDate(then, "dd MMM") ?? "";
};
