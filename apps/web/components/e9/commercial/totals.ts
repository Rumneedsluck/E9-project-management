/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* Column totals for BOQ-style tables. Sq ft, Nos and running length are never added together: one total row per unit. */

const UNIT_ORDER = ["sqft", "nos", "rft", "rmt"];

const toNumber = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

/** [[unit, {field: total}]] in the order sq ft, Nos, rft, rmt; only units that have rows. */
export function totalsByUnit<TRow extends { unit: string }, TField extends string>(
  rows: TRow[],
  fields: Record<TField, (row: TRow) => unknown>
): [string, Record<TField, number>][] {
  const names = Object.keys(fields) as TField[];
  const byUnit = new Map<string, Record<TField, number>>();
  for (const row of rows) {
    const totals =
      byUnit.get(row.unit) ?? (Object.fromEntries(names.map((name) => [name, 0])) as Record<TField, number>);
    for (const name of names) totals[name] = Math.round((totals[name] + toNumber(fields[name](row))) * 100) / 100;
    byUnit.set(row.unit, totals);
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh copy
  return [...byUnit].sort(([a], [b]) => UNIT_ORDER.indexOf(a) - UNIT_ORDER.indexOf(b));
}
