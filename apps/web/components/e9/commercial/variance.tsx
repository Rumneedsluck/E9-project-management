/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Variance (from the Excel "Variance" sheet): per BOQ line, BOQ vs produced vs reprints vs installed
 * vs certified, the + / − against the BOQ, and what can be billed (certified + client-change reprints).
 */

import { cn } from "@plane/utils";
import { E9Panel } from "../ui";
import { fmt, unitText } from "./shared";
import { totalsByUnit } from "./totals";
import type { TE9BoqLine } from "./types";

const n = (value: string | number | null | undefined) => Number(value ?? 0) || 0;

export const varianceStatus = (line: TE9BoqLine) => {
  const certified = n(line.certified_on_site);
  if (certified <= 0) return { text: "Not certified", tone: "text-tertiary" };
  if (certified > n(line.allowed)) return { text: "Over BOQ", tone: "text-warning-primary" };
  if (certified === n(line.allowed)) return { text: "Complete", tone: "text-success-primary" };
  return { text: "Short", tone: "text-secondary" };
};

export function E9VariancePanel({ lines }: { lines: TE9BoqLine[] }) {
  if (lines.length === 0) return null;
  const headings = [
    "BOQ item",
    "Description",
    "Unit",
    "BOQ qty",
    "Produced",
    "Reprints (extra)",
    "Installed",
    "Certified",
    "Certified vs BOQ",
    "Status",
    "Client change (billable)",
    "Billable qty",
    "Wastage",
  ];
  // wastage added up per unit (sq ft and Nos are never mixed)
  const wasteByUnit = new Map<string, number>();
  for (const line of lines)
    if (line.wastage !== null && line.wastage !== undefined)
      wasteByUnit.set(line.unit, (wasteByUnit.get(line.unit) ?? 0) + n(line.wastage));
  return (
    <E9Panel title="Variance · BOQ vs produced vs certified">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-body-xs-regular">
          <thead>
            <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
              {headings.map((heading, index) => (
                <th key={heading} className={cn("px-3 py-2.5", index >= 3 && index !== 9 && "text-right")}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle text-primary">
            {lines.map((line) => {
              const certified = n(line.certified_on_site);
              const diff = certified - n(line.allowed);
              const status = varianceStatus(line);
              const reprints = n(line.internal_reprints) + n(line.client_reprints) + n(line.extras);
              const billable =
                certified > 0 || n(line.client_reprints) > 0 ? certified + n(line.client_reprints) : null;
              return (
                <tr key={line.id}>
                  <td className="px-3 py-2 font-semibold">{line.line_no}</td>
                  <td className="max-w-[260px] truncate px-3 py-2">{line.description || "—"}</td>
                  <td className="px-3 py-2 text-right">{unitText(line.unit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(line.allowed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(line.on_tracker)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{reprints ? fmt(reprints) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(line.installed)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {certified ? fmt(certified) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-semibold tabular-nums",
                      certified > 0 && diff > 0 && "text-warning-primary"
                    )}
                  >
                    {certified > 0 ? `${diff > 0 ? "+" : ""}${fmt(diff)}` : "—"}
                  </td>
                  <td className={cn("px-3 py-2 font-semibold", status.tone)}>{status.text}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n(line.client_reprints) ? fmt(line.client_reprints) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {billable === null ? "—" : fmt(billable)}
                  </td>
                  <td
                    className={cn("px-3 py-2 text-right tabular-nums", n(line.wastage) > 0 && "text-warning-primary")}
                    title="Production minus site-measured quantity. It does not change when the BOQ is amended."
                  >
                    {line.wastage === null || line.wastage === undefined
                      ? "—"
                      : `${fmt(line.wastage)}${line.wastage_pct ? ` · ${fmt(line.wastage_pct)}%` : ""}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {totalsByUnit(lines, {
              allowed: (line) => line.allowed,
              produced: (line) => line.on_tracker,
              reprints: (line) => n(line.internal_reprints) + n(line.client_reprints) + n(line.extras),
              installed: (line) => line.installed,
              certified: (line) => line.certified_on_site,
              clientChange: (line) => line.client_reprints,
              wastage: (line) => line.wastage,
            }).map(([unit, total]) => (
              <tr key={unit} className="border-t border-subtle bg-layer-1 text-body-xs-semibold text-primary">
                <td className="px-3 py-2" colSpan={3}>
                  Total {unitText(unit as TE9BoqLine["unit"])}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(total.allowed)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(total.produced)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{total.reprints ? fmt(total.reprints) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(total.installed)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{total.certified ? fmt(total.certified) : "—"}</td>
                <td colSpan={2} />
                <td className="px-3 py-2 text-right tabular-nums">
                  {total.clientChange ? fmt(total.clientChange) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {total.certified || total.clientChange ? fmt(total.certified + total.clientChange) : "—"}
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums", total.wastage > 0 && "text-warning-primary")}>
                  {wasteByUnit.has(unit) ? fmt(total.wastage) : "—"}
                </td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      <p className="border-t border-subtle px-5 py-2.5 text-body-2xs-regular text-tertiary">
        Produced = production size on the tracker. Certified = the Certified columns on the tracker (after the JMC).
        Billable = certified + client-change reprints.
      </p>
    </E9Panel>
  );
}
