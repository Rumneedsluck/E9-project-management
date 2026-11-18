/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* Totals for the client report's "Progress by scope" table, and each scope's quantity in words. */

import type { TE9ReportScope } from "./hold-types";

const UNITS = [
  ["sqft", "sq ft"],
  ["nos", "Nos"],
  ["rft", "rft"],
  ["rmt", "rmt"],
] as const;

type TAmounts = Partial<Record<"sqft" | "nos" | "rft" | "rmt", string | number>>;

/** "1,955.05 sq ft", "31 Nos", or both joined with " + "; "—" when the scope has no quantity. */
export const quantityText = (row: TAmounts): string => {
  const parts = UNITS.filter(([key]) => Number(row[key] ?? 0) > 0).map(
    ([key, label]) => `${Number(row[key]).toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${label}`
  );
  return parts.join(" + ") || "—";
};

const COUNTS = [
  "items",
  "on_hold",
  "production_done",
  "material_received",
  "qc_passed",
  "delivered",
  "installed",
  "signed_off",
] as const;

/** The Total row: every count added up, quantities per unit, and % installed over all items. */
export const reportTotals = (rows: TE9ReportScope[]) => {
  const sum = (pick: (row: TE9ReportScope) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const counts = Object.fromEntries(COUNTS.map((key) => [key, sum((row) => row[key])])) as Record<
    (typeof COUNTS)[number],
    number
  >;
  const amounts = Object.fromEntries(
    UNITS.map(([key]) => [key, Math.round(sum((row) => Number(row[key] ?? 0)) * 100) / 100])
  ) as Record<"sqft" | "nos" | "rft" | "rmt", number>;
  return {
    ...counts,
    ...amounts,
    percent: counts.items > 0 ? Math.round((counts.installed / counts.items) * 100) : 0,
  };
};
