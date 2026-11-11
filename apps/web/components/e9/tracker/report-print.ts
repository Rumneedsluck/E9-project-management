/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* Printable client progress report. Opens in a new tab and shows the print dialog (choose "Save as PDF"). */

import type { TE9Project } from "../types";
import type { TE9Report } from "./hold-types";

const escape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const day = (value: string | null) =>
  value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";

const table = (head: string[], rows: (string | number)[][]) =>
  `<table><thead><tr>${head.map((cell) => `<th>${escape(cell)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

export function printClientReport(project: TE9Project, report: TE9Report) {
  const head = report.headline;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Client report - ${escape(project.name)}</title>
<style>
  body { font: 11px/1.4 Arial, sans-serif; color: #111; margin: 18px; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 16px; margin: 0; } h2 { font-size: 12px; margin: 16px 0 6px; }
  .tiles { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .tiles div { border: 1px solid #ccc; padding: 6px; } .tiles b { display: block; font-size: 15px; }
  .tiles span { color: #666; font-size: 9px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; } tr { page-break-inside: avoid; }
  th, td { border: 1px solid #bbb; padding: 4px 5px; text-align: left; } th { background: #f2f2f2; font-size: 9.5px; }
  .note { color: #555; margin: 4px 0 10px; }
  @media screen { body { max-width: 1100px; margin: 24px auto; } }
</style></head><body>
<header><div><b>E9 CREATIVE</b> · Signage &amp; Branding</div>
<h1>Client progress report<br><span style="font-weight:400;font-size:12px">${escape(report.project_name)}</span></h1></header>
<p class="note">As on ${escape(day(report.as_on))}. Items on hold are in the totals but add no progress; cancelled items are not counted.</p>
<div class="tiles">
  <div><span>Items counted</span><b>${head.items}</b></div>
  <div><span>% installed</span><b>${head.percent_installed}%</b></div>
  <div><span>Days to deadline</span><b>${head.days_to_deadline ?? "—"}</b></div>
  <div><span>Open site issues</span><b>${head.open_site_issues}</b></div>
  <div><span>Open snags</span><b>${head.open_snags}</b></div>
  <div><span>On hold</span><b>${head.on_hold}</b></div>
  <div><span>Cancelled</span><b>${head.cancelled}</b></div>
</div>
<h2>Progress by scope</h2>
${table(
  [
    "Scope",
    "Items",
    "On hold",
    "Production done",
    "Material received",
    "QC passed",
    "Delivered",
    "Installed",
    "Signed off",
    "% installed",
  ],
  report.by_scope.map((row) => [
    row.label,
    row.items,
    row.on_hold || "",
    row.production_done,
    row.material_received,
    row.qc_passed,
    row.delivered,
    row.installed,
    row.signed_off,
    `${row.percent}%`,
  ])
)}
<h2>Stage targets</h2>
${table(
  ["Stage", "Target date", "Done", "Pending", "Status"],
  report.stages.map((stage) => [stage.stage, day(stage.target), stage.done, stage.pending, stage.state])
)}
<h2>Billing</h2>
${table(
  ["Billable now (items)", "of which on hold", "Not billable yet", "Billable sq ft", "Billable Nos"],
  [
    [
      report.billing.billable_items,
      report.billing.of_which_on_hold,
      report.billing.not_billable_yet,
      report.billing.sqft,
      report.billing.nos,
    ],
  ]
)}
${
  report.held.length
    ? `<h2>Items on hold (counted above, no progress)</h2>${table(
        ["Item", "Description", "Reason", "Since", "Bill now?"],
        report.held.map((row) => [row.code, row.description || row.floor, row.reason, day(row.since), row.bill_now])
      )}`
    : ""
}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
  const tab = window.open("", "_blank");
  if (!tab) {
    window.alert("Allow pop-ups for this site to print the report.");
    return;
  }
  tab.document.open();
  tab.document.write(html);
  tab.document.close();
}
