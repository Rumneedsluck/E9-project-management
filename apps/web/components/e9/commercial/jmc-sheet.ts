/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Printable JMC (joint measurement certificate) sheet, built from the tracker.
 * Opens in a new tab and shows the print dialog. "Blank" leaves the certified columns empty for
 * site; "filled" prints the certified sizes/quantities already typed in the tracker.
 */

import { splitFloors } from "../tracker/logic";
import type { TE9ProjectScope, TE9ScopeItem } from "../tracker/logic";
import type { TE9Project } from "../types";

const norm = (value: string) => value.split(/\s+/).join(" ").trim().toLowerCase();

const isFilled = (item: TE9ScopeItem) =>
  !!(item.floor_area.trim() || item.description.trim() || item.height_in || item.width_in || item.qty);

/** Same rule as the backend: does a JMC for this floor / scope cover this tracker row? */
export const jmcCovers = (part: { floor: string; scope: string }, item: TE9ScopeItem) =>
  (!part.floor || splitFloors(item.floor_area).some((floor) => norm(floor) === norm(part.floor))) &&
  (!part.scope || part.scope === item.scope);

const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const num = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "";
};

const size = (height: string | null, width: string | null) => (height || width ? `${num(height)} × ${num(width)}` : "");

export function printJmcSheet({
  project,
  items,
  scopes,
  part,
  filled,
}: {
  project: TE9Project;
  items: TE9ScopeItem[];
  scopes: TE9ProjectScope[];
  part: { label: string; floor: string; scope: string; jmc_number?: string };
  filled: boolean;
}) {
  const rows = items.filter((item) => isFilled(item) && jmcCovers(part, item));
  const groups = scopes
    .map((scope) => ({ scope, rows: rows.filter((item) => item.scope === scope.key) }))
    .filter((group) => group.rows.length > 0);

  const body = groups
    .map(({ scope, rows: scopeRows }) => {
      const lines = scopeRows
        .map(
          (item, index) => `<tr>
  <td>${index + 1}</td>
  <td><b>${escape(item.item_code)}</b></td>
  <td>${escape(item.floor_area)}</td>
  <td>${escape(item.description)}</td>
  <td>${escape(item.boq_item_no)}</td>
  <td class="n">${escape(size(item.height_in, item.width_in))}</td>
  <td class="n">${escape(num(item.qty))}</td>
  <td class="n">${item.unit === "sqft" ? escape(num(item.area_sqft)) : ""}</td>
  <td class="n c">${filled ? escape(size(item.certified_height_in, item.certified_width_in)) : ""}</td>
  <td class="n c">${filled ? escape(num(item.certified_qty)) : ""}</td>
  <td class="n c">${filled && item.unit === "sqft" ? escape(num(item.certified_measure)) : ""}</td>
  <td class="c"></td>
</tr>`
        )
        .join("");
      return `<h2>${escape(scope.label)} <span>${scopeRows.length} item${scopeRows.length === 1 ? "" : "s"}</span></h2>
<table>
<thead><tr>
  <th>#</th><th>Code</th><th>Floor / area</th><th>Description</th><th>BOQ No.</th>
  <th class="n">Size H × W (in)</th><th class="n">Qty</th><th class="n">Sq ft</th>
  <th class="n c">Certified H × W</th><th class="n c">Certified qty</th><th class="n c">Certified sq ft</th><th class="c">Remarks</th>
</tr></thead>
<tbody>${lines}</tbody>
</table>`;
    })
    .join("");

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>JMC · ${escape(project.name)} · ${escape(part.label)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font: 11px/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #DA1E26; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark { background: #0B0B0B; color: #DA1E26; font-weight: 800; font-size: 18px; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 8px; }
  .brand b { font-size: 15px; letter-spacing: .02em; }
  h1 { font-size: 16px; margin: 0; text-align: right; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 18px; margin-bottom: 14px; }
  .meta div { border-bottom: 1px solid #ddd; padding: 3px 0; }
  .meta span { color: #666; display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
  h2 { font-size: 12px; margin: 16px 0 6px; }
  h2 span { color: #777; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #bbb; padding: 4px 5px; vertical-align: top; text-align: left; }
  th { background: #f2f2f2; font-size: 9.5px; }
  .n { text-align: right; white-space: nowrap; }
  .c { background: #fbfbf7; min-width: 70px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid #111; padding-top: 6px; }
  .sign p { margin: 2px 0; color: #444; }
  .empty { padding: 30px; text-align: center; color: #777; border: 1px dashed #bbb; }
  @media screen { body { padding: 24px; max-width: 1200px; margin: auto; } }
</style></head><body>
<header>
  <div class="brand"><div class="mark">E9</div><div><b>E9 CREATIVE</b></div></div>
  <h1>Joint Measurement Certificate<br><span style="font-weight:400;font-size:12px">${escape(part.label)}</span></h1>
</header>
<div class="meta">
  <div><span>Project</span>${escape(project.name)} (${escape(project.identifier)})</div>
  <div><span>Client</span>${escape(project.e9.client_name)}</div>
  <div><span>Site</span>${escape([project.e9.site_address, project.e9.city].filter(Boolean).join(", "))}</div>
  <div><span>Work order / PO</span>${escape(project.e9.work_order_number)}</div>
  <div><span>JMC no.</span>${escape(part.jmc_number ?? "")}</div>
  <div><span>Measured on</span>&nbsp;</div>
  <div><span>Items</span>${rows.length}</div>
  <div><span>Printed</span>${today}</div>
</div>
${body || '<p class="empty">No tracker rows for this part yet.</p>'}
<div class="sign">
  <div><b>For E9 Creative</b><p>Name:</p><p>Signature:</p><p>Date:</p></div>
  <div><b>For ${escape(project.e9.client_name || "the client")}</b><p>Name &amp; designation:</p><p>Signature &amp; stamp:</p><p>Date:</p></div>
</div>
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;

  const tab = window.open("", "_blank");
  if (!tab) {
    window.alert("Allow pop-ups for this site to print the JMC sheet.");
    return;
  }
  tab.document.open();
  tab.document.write(html);
  tab.document.close();
}
