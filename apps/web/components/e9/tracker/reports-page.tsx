/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* Client progress report and health check (template sheets "Client Report" and "Health Check"). */

import { Button } from "@makeplane/propel/components/button";
import { cn } from "@plane/utils";
import { fmt } from "../commercial/shared";
import { useE9Health, useE9Report } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import { formatDay, ReplacementNote } from "./hold-page";
import { printClientReport } from "./report-print";

const STATE_STYLE = {
  Done: "text-success-primary",
  Overdue: "font-semibold text-danger-primary",
  "On track": "text-secondary",
} as const;

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: "warn" | "good" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-subtle bg-surface-1 px-4 py-3 shadow-raised-100">
      <span className="text-body-2xs-semibold tracking-[0.1em] text-tertiary uppercase">{label}</span>
      <span
        className={cn(
          "text-h4-semibold tabular-nums",
          tone === "warn" && "text-warning-primary",
          tone === "good" && "text-success-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function E9ClientReport({ workspaceSlug, project }: { workspaceSlug: string; project: TE9Project }) {
  const { data, error, isLoading, mutate } = useE9Report(workspaceSlug, project.id);
  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;
  const head = data.headline;
  const th = "px-3 py-2.5";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm-regular text-tertiary">
          As on {formatDay(data.as_on)}. Items on hold are in the totals but add no progress; cancelled items are not
          counted.
        </p>
        <Button
          stretch="auto"
          variant="secondary"
          size="md"
          label="Print / Save as PDF"
          onClick={() => printClientReport(project, data)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Tile label="Items counted" value={head.items} />
        <Tile label="% installed" value={`${head.percent_installed}%`} tone="good" />
        <Tile
          label="Days to deadline"
          value={head.days_to_deadline === null ? "—" : head.days_to_deadline}
          tone={head.days_to_deadline !== null && head.days_to_deadline < 0 ? "warn" : undefined}
        />
        <Tile
          label="Open site issues"
          value={head.open_site_issues}
          tone={head.open_site_issues ? "warn" : undefined}
        />
        <Tile label="Open snags" value={head.open_snags} tone={head.open_snags ? "warn" : undefined} />
        <Tile label="On hold" value={head.on_hold} tone={head.on_hold ? "warn" : undefined} />
        <Tile label="Cancelled" value={head.cancelled} />
      </div>

      <E9Panel title="Progress by scope">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-body-xs-regular">
            <thead>
              <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                {[
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
                ].map((heading) => (
                  <th key={heading} className={th}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle text-primary tabular-nums">
              {data.by_scope.map((row) => (
                <tr key={row.scope}>
                  <td className="px-3 py-2 font-semibold">{row.label}</td>
                  <td className="px-3 py-2">{row.items}</td>
                  <td className="px-3 py-2">{row.on_hold || "—"}</td>
                  <td className="px-3 py-2">{row.production_done}</td>
                  <td className="px-3 py-2">{row.material_received}</td>
                  <td className="px-3 py-2">{row.qc_passed}</td>
                  <td className="px-3 py-2">{row.delivered}</td>
                  <td className="px-3 py-2">{row.installed}</td>
                  <td className="px-3 py-2">{row.signed_off}</td>
                  <td className="px-3 py-2 font-semibold">{row.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </E9Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <E9Panel title="Stage targets">
          <table className="w-full text-left text-body-xs-regular">
            <thead>
              <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                {["Stage", "Target date", "Done", "Pending", "Status"].map((heading) => (
                  <th key={heading} className={th}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle text-primary tabular-nums">
              {data.stages.map((stage) => (
                <tr key={stage.stage}>
                  <td className="px-3 py-2 font-semibold">{stage.stage}</td>
                  <td className="px-3 py-2">{formatDay(stage.target)}</td>
                  <td className="px-3 py-2">{stage.done}</td>
                  <td className="px-3 py-2">{stage.pending}</td>
                  <td className={cn("px-3 py-2", STATE_STYLE[stage.state])}>{stage.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </E9Panel>
        <E9Panel title="Billing">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-body-sm-regular">
            {[
              ["Billable now (items)", data.billing.billable_items],
              ["of which on hold", data.billing.of_which_on_hold],
              ["Not billable yet", data.billing.not_billable_yet],
              ["Billable sq ft", fmt(data.billing.sqft)],
              ["Billable Nos", fmt(data.billing.nos)],
            ].map(([label, value]) => (
              <div key={label as string} className="flex flex-col">
                <dt className="text-body-2xs-semibold text-tertiary">{label}</dt>
                <dd className="text-body-md-semibold text-primary tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </E9Panel>
      </div>

      {data.held.length > 0 && (
        <E9Panel title={`Items on hold · ${data.held.length}`}>
          <ul className="divide-y divide-subtle">
            {data.held.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2.5 text-body-xs-regular">
                <span className="w-14 font-semibold text-primary">{row.code}</span>
                <span className="min-w-[180px] flex-1 text-secondary">{row.description || row.floor || "—"}</span>
                <span>{row.reason || "—"}</span>
                <span className="text-tertiary">since {formatDay(row.since)}</span>
                <ReplacementNote row={row} />
              </li>
            ))}
          </ul>
        </E9Panel>
      )}
    </div>
  );
}

export function E9HealthCheck({ workspaceSlug, project }: { workspaceSlug: string; project: TE9Project }) {
  const { data, error, isLoading, mutate } = useE9Health(workspaceSlug, project.id);
  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;
  return (
    <div className="flex flex-col gap-5">
      <div
        className={cn(
          "rounded-xl border px-5 py-4 text-body-md-semibold",
          data.problems === 0
            ? "border-subtle bg-success-subtle text-success-primary"
            : "border-strong bg-warning-subtle text-warning-primary"
        )}
        role="status"
      >
        {data.problems === 0
          ? "✔ All clear: nothing needs attention."
          : `! ${data.problems} thing${data.problems === 1 ? "" : "s"} to check`}
      </div>
      <E9Panel title="Checks">
        <ul className="divide-y divide-subtle">
          {data.checks.map((check) => (
            <li key={check.key} className="flex flex-col gap-1 px-5 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid min-w-7 place-items-center rounded-full px-2 py-0.5 text-body-2xs-semibold",
                    check.count === 0 ? "bg-success-subtle text-success-primary" : "bg-[#F59E0B] text-black"
                  )}
                >
                  {check.count === 0 ? "✓" : check.count}
                </span>
                <span className="text-body-sm-semibold text-primary">{check.label}</span>
              </div>
              <p className="pl-10 text-body-xs-regular text-tertiary">{check.meaning}</p>
              {check.items.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 pl-10 text-body-xs-regular text-secondary">
                  {check.items.map((entry) => (
                    <li key={entry.id}>
                      <span className="font-semibold text-primary">{entry.code}</span> · {entry.note}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </E9Panel>
      <p className="text-body-xs-regular text-tertiary">
        On hold: {data.on_hold} · Cancelled: {data.cancelled}. Duplicate item codes cannot happen here, because the
        website never gives two rows the same code.
      </p>
    </div>
  );
}
