/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Production Sent (from the Excel sheet): one list of everything sent for production –
 * first sends (tracker rows on a JC) and reprints / extras – with date, JC, vendor and quantity.
 */

import { cn, renderFormattedDate } from "@plane/utils";
import { useE9Boq } from "../hooks";
import { E9Panel } from "../ui";
import { ItemLink, fmt, unitText } from "./shared";
import type { TE9BoqUnit, TE9Logs } from "./types";

type TRow = {
  key: string;
  date: string | null;
  type: "Original" | "Reprint" | "Extra";
  scope: string;
  scopeLabel: string;
  code: string;
  description: string;
  boqNo: string;
  jc: string;
  vendor: string;
  qty: number;
  unit: TE9BoqUnit;
  causedBy: string;
  reason: string;
  approved: string;
};

const CAUSE = { e9: "E9", client: "Client", site: "Site" } as const;

export function E9ProductionSent({ slug, projectId, logs }: { slug: string; projectId: string; logs: TE9Logs }) {
  const { data: boq } = useE9Boq(slug, projectId);
  const rows: TRow[] = [];
  for (const jc of logs.job_cards) {
    for (const item of jc.items) {
      rows.push({
        key: `${jc.number}-${item.id}`,
        date: jc.jc_date || null,
        type: "Original",
        scope: item.scope,
        scopeLabel: item.scope_label,
        code: item.code,
        description: item.description,
        boqNo: "",
        jc: jc.number,
        vendor: jc.vendor,
        qty: Number(item.unit === "sqft" ? item.area : item.qty) || 0,
        unit: item.unit,
        causedBy: "",
        reason: "",
        approved: "",
      });
    }
  }
  for (const reprint of boq?.reprints ?? []) {
    rows.push({
      key: `r-${reprint.id}`,
      date: reprint.reprint_date,
      type: reprint.kind === "extra" ? "Extra" : "Reprint",
      scope: reprint.scope,
      scopeLabel: reprint.scope_label,
      code: reprint.item_code,
      description: reprint.description || reprint.item_description,
      boqNo: reprint.line_no,
      jc: reprint.jc_no,
      vendor: reprint.vendor,
      qty: Number(reprint.qty) || 0,
      unit: reprint.unit,
      causedBy: CAUSE[reprint.cause],
      reason: reprint.reason,
      approved: reprint.approved,
    });
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorting our own fresh array
  rows.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.code.localeCompare(b.code));
  const firsts = rows.filter((row) => row.type === "Original").length;

  return (
    <E9Panel title={`Production sent · ${firsts} first sends · ${rows.length - firsts} reprints / extras`}>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-body-sm-regular text-tertiary">
          Nothing sent yet. Type a JC No. on tracker rows, or add a reprint / extra, and it shows up here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-body-xs-regular">
            <thead>
              <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                {[
                  "Date sent",
                  "Type",
                  "Scope",
                  "Item",
                  "Description",
                  "BOQ No.",
                  "JC No.",
                  "Vendor",
                  "Qty sent",
                  "Caused by",
                  "Reason",
                  "Approved by client?",
                ].map((heading) => (
                  <th key={heading} className={cn("px-3 py-2.5", heading === "Qty sent" && "text-right")}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle text-primary">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-2 whitespace-nowrap">{renderFormattedDate(row.date) ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-body-2xs-semibold",
                        row.type === "Original" ? "bg-layer-2 text-secondary" : "bg-warning-subtle text-warning-primary"
                      )}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.scopeLabel}</td>
                  <td className="px-3 py-2">
                    {row.code ? <ItemLink slug={slug} projectId={projectId} scope={row.scope} code={row.code} /> : "—"}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2">{row.description || "—"}</td>
                  <td className="px-3 py-2">{row.boqNo || "—"}</td>
                  <td className="px-3 py-2 font-semibold">{row.jc || "—"}</td>
                  <td className="px-3 py-2">{row.vendor || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(row.qty)} {unitText(row.unit)}
                  </td>
                  <td className="px-3 py-2">{row.causedBy || "—"}</td>
                  <td className="px-3 py-2">{row.reason || "—"}</td>
                  <td className="px-3 py-2">{row.approved || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </E9Panel>
  );
}
