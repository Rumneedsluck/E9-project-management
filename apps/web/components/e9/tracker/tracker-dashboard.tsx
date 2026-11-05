/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { cn, renderFormattedDate } from "@plane/utils";
import { E9BoqDashboardPanel } from "../commercial/boq-dashboard-panel";
import { E9OpenSnagsPanel } from "../commercial/snags-page";
import { useE9Floors, useE9Items, useE9Scopes } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import type { TStageTargetRow } from "./logic";
import { floorProgress, formatMeasure, isOpenSiteIssue, scopeProgress, stageTargetRows, trackerKpis } from "./logic";
import { floorStatusClass } from "./setup-panels";

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "success";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-subtle bg-surface-1 p-4 shadow-raised-100">
      <span className="text-body-2xs-semibold tracking-wide text-tertiary uppercase">{label}</span>
      <span
        className={cn(
          "text-h3-semibold leading-none text-primary tabular-nums",
          tone === "danger" && "text-danger-primary",
          tone === "success" && "text-success-primary"
        )}
      >
        {value}
      </span>
      {hint && <span className="text-body-xs-regular text-placeholder">{hint}</span>}
    </div>
  );
}

function Percent({ value }: { value: number | null }) {
  if (value === null) return <span className="text-placeholder">—</span>;
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-layer-3 sm:block">
        <span
          className={cn("block h-full rounded-full", value === 100 ? "bg-success-primary" : "bg-inverse")}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-9 text-right tabular-nums">{value}%</span>
    </span>
  );
}

const STATUS_TEXT: Record<TStageTargetRow["status"], { text: string; className: string }> = {
  complete: { text: "✓ Complete", className: "text-success-primary" },
  no_target: { text: "No target set", className: "text-placeholder" },
  overdue: { text: "Overdue", className: "text-danger-primary font-semibold" },
  on_track: { text: "On track", className: "text-secondary" },
  no_items: { text: "No items yet", className: "text-placeholder" },
};

type Props = {
  workspaceSlug: string;
  project: TE9Project;
  onOpenSheet: () => void;
  onOpenView?: (view: "boq" | "billing" | "snags") => void;
};

export function E9TrackerDashboard({ workspaceSlug, project, onOpenSheet, onOpenView }: Props) {
  const { data, error, isLoading, mutate } = useE9Items(workspaceSlug, project.id);
  const items = useMemo(() => data?.items ?? [], [data]);
  const { data: scopeList } = useE9Scopes(workspaceSlug, project.id);
  const { data: floorList } = useE9Floors(workspaceSlug, project.id);
  const scopes = useMemo(() => (scopeList ?? []).filter((scope) => scope.enabled), [scopeList]);
  const scopeLabel = (key: string) => scopeList?.find((scope) => scope.key === key)?.label ?? key;
  const progress = useMemo(() => scopeProgress(items, scopes), [items, scopes]);
  const floors = useMemo(() => floorProgress(items, floorList ?? []), [items, floorList]);
  const today = new Date().toISOString().slice(0, 10);
  const kpis = useMemo(() => trackerKpis(items, project.e9.deadline), [items, project.e9.deadline]);
  const stages = useMemo(() => stageTargetRows(items, project.e9), [items, project.e9]);
  const issues = useMemo(() => items.filter(isOpenSiteIssue), [items]);

  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  if (kpis.totalItems === 0)
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-strong bg-surface-1 px-6 py-14 text-center">
        <p className="text-body-md-semibold text-primary">No items on the tracker yet</p>
        <p className="max-w-md text-body-sm-regular text-tertiary">
          Add walls, glass, signages and frames on the Tracker sheet. This dashboard fills itself from those rows.
        </p>
        <button
          type="button"
          onClick={onOpenSheet}
          className="text-body-sm-semibold text-accent-primary hover:underline"
        >
          Open the Tracker sheet
        </button>
      </div>
    );

  const days = kpis.daysToDeadline;
  const usedScopes = progress.filter((row) => row.items > 0);
  const totals = usedScopes.reduce(
    (sum, row) => ({
      area: sum.area + row.area,
      productionDone: sum.productionDone + row.productionDone,
      materialReceived: sum.materialReceived + row.materialReceived,
      qcPassed: sum.qcPassed + row.qcPassed,
      delivered: sum.delivered + row.delivered,
      installed: sum.installed + row.installed,
      signedOff: sum.signedOff + row.signedOff,
      items: sum.items + row.items,
    }),
    { area: 0, productionDone: 0, materialReceived: 0, qcPassed: 0, delivered: 0, installed: 0, signedOff: 0, items: 0 }
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile
          label="Total items / qty"
          value={kpis.totalItems.toLocaleString("en-IN")}
          hint="Signages, frames & 3D by Nos"
        />
        <Tile
          label="Total area"
          value={formatMeasure(kpis.totalArea, "sqft")}
          hint={`${formatMeasure(kpis.installedArea, "sqft")} installed`}
        />
        <Tile
          label="Work done (installed)"
          value={`${kpis.percentDone}%`}
          tone={kpis.percentDone === 100 ? "success" : undefined}
        />
        <Tile
          label="Days to deadline"
          value={days === null ? "—" : days < 0 ? `${Math.abs(days)} late` : String(days)}
          hint={project.e9.deadline ? renderFormattedDate(project.e9.deadline) : "Set a handover deadline"}
          tone={days !== null && days < 0 ? "danger" : undefined}
        />
        <Tile
          label="Open site issues"
          value={String(kpis.openSiteIssues)}
          tone={kpis.openSiteIssues > 0 ? "danger" : "success"}
        />
      </div>

      <E9Panel title="Progress by scope">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-body-xs-regular">
            <thead>
              <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                {[
                  "Scope",
                  "Items / Qty",
                  "Area (sq ft)",
                  "Production done",
                  "Material received",
                  "QC passed",
                  "Delivered",
                  "Installed",
                  "Signed off",
                  "% done (items)",
                  "% done (sq ft)",
                ].map((heading, index) => (
                  <th key={heading} className={cn("px-4 py-2.5 font-semibold", index > 0 && "text-right")}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle text-primary">
              {usedScopes.map((row) => (
                <tr key={row.scope}>
                  <td className="px-4 py-2.5 font-medium">{row.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.items}
                    {row.unit === "nos" && <span className="text-tertiary"> Nos</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.area > 0 ? row.area.toLocaleString("en-IN") : "—"}
                  </td>
                  {(
                    [
                      ["production", row.productionDone],
                      ["material", row.materialReceived],
                      ["qc", row.qcPassed],
                      ["delivered", row.delivered],
                      ["installed", row.installed],
                      ["signed", row.signedOff],
                    ] as const
                  ).map(([key, value]) => (
                    <td
                      key={key}
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums",
                        value === 0 && "text-placeholder",
                        value > 0 && value === row.items && "text-success-primary"
                      )}
                    >
                      {value}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <Percent value={row.percentItems} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Percent value={row.percentArea} />
                  </td>
                </tr>
              ))}
              <tr className="bg-layer-1 font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.items}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {totals.area ? (Math.round(totals.area * 100) / 100).toLocaleString("en-IN") : "—"}
                </td>
                {[
                  totals.productionDone,
                  totals.materialReceived,
                  totals.qcPassed,
                  totals.delivered,
                  totals.installed,
                  totals.signedOff,
                ].map((value, index) => (
                  // oxlint-disable-next-line react/no-array-index-key -- fixed column order
                  <td key={index} className="px-4 py-2.5 text-right tabular-nums">
                    {value}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <Percent value={kpis.percentDone} />
                </td>
                <td className="px-4 py-2.5">
                  <Percent
                    value={kpis.totalArea > 0 ? Math.round((kpis.installedArea / kpis.totalArea) * 100) : null}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-body-2xs-regular text-placeholder">
          Sq-ft scopes count each item; Nos scopes (signages, frames, 3D …) count their quantity. Rows left blank are
          not counted.
        </p>
      </E9Panel>

      <E9BoqDashboardPanel workspaceSlug={workspaceSlug} projectId={project.id} onOpen={(view) => onOpenView?.(view)} />
      <E9OpenSnagsPanel workspaceSlug={workspaceSlug} projectId={project.id} onOpen={() => onOpenView?.("snags")} />

      {floors.length > 0 && (
        <E9Panel title={`Progress by floor · ${floors.length}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-body-xs-regular">
              <thead>
                <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                  {[
                    "Floor",
                    "Floor status",
                    "Target date",
                    "Rows",
                    "Items / Qty",
                    "Nos",
                    "Area (sq ft)",
                    "Delivered",
                    "Installed",
                    "Signed off",
                    "% done",
                  ].map((heading, index) => (
                    <th key={heading} className={cn("px-4 py-2.5 font-semibold", index > 2 && "text-right")}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle text-primary">
                {floors.map((row) => {
                  const status = row.floor?.status;
                  const target = row.floor?.target_date ?? null;
                  const late = !!target && target < today && status !== "Handed Over";
                  return (
                    <tr key={row.name} className={cn(late && "bg-danger-subtle/50")}>
                      <td className="px-4 py-2.5 font-medium">
                        {row.name}
                        {row.floor?.notes && (
                          <span className="block max-w-[220px] truncate text-body-2xs-regular text-tertiary">
                            {row.floor.notes}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {status ? (
                          <span
                            className={cn("rounded-full px-2 py-0.5 text-body-2xs-semibold", floorStatusClass(status))}
                          >
                            {status}
                          </span>
                        ) : (
                          <span className="text-placeholder">Not in floor list</span>
                        )}
                      </td>
                      <td className={cn("px-4 py-2.5 tabular-nums", late && "font-semibold text-danger-primary")}>
                        {target ? renderFormattedDate(target) : "—"}
                        {late && " · late"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.rows}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.items}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.nos || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {row.area > 0 ? row.area.toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.delivered}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.installed}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.signedOff}</td>
                      <td className="px-4 py-2.5">
                        <Percent value={row.rows > 0 ? row.percentItems : null} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-body-2xs-regular text-placeholder">
            Set each floor&apos;s status, target date and notes on the Tracker sheet › Floors. A floor turns red when
            its target date has passed and it isn&apos;t handed over.
          </p>
        </E9Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <E9Panel title="Stage targets & overdue" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-body-xs-regular">
              <thead>
                <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                  {["Stage", "Target date", "Done", "Pending", "Overdue", "Days left", "Status"].map(
                    (heading, index) => (
                      <th key={heading} className={cn("px-4 py-2.5", index > 1 && index < 6 && "text-right")}>
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle text-primary">
                {stages.map((row) => (
                  <tr key={row.key} className={cn(row.status === "overdue" && "bg-danger-subtle/50")}>
                    <td className="px-4 py-2.5 font-medium">{row.label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.target ? renderFormattedDate(row.target) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.done}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.pending}</td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums",
                        row.overdue > 0 && "font-semibold text-danger-primary"
                      )}
                    >
                      {row.overdue}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.daysLeft ?? "—"}</td>
                    <td className={cn("px-4 py-2.5", STATUS_TEXT[row.status].className)}>
                      {STATUS_TEXT[row.status].text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-body-2xs-regular text-placeholder">
            Set the target dates on the project (Edit project › Stage target dates). Late items turn red on the Tracker
            sheet.
          </p>
        </E9Panel>

        <E9Panel title={`Open site issues · ${issues.length}`}>
          {issues.length === 0 ? (
            <p className="px-5 py-8 text-center text-body-sm-regular text-tertiary">No open site issues.</p>
          ) : (
            <ul className="divide-y divide-subtle">
              {issues.slice(0, 12).map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5 px-5 py-2.5">
                  <span className="text-body-xs-semibold text-primary">
                    {item.item_code} · {item.floor_area || item.description || scopeLabel(item.scope)}
                  </span>
                  <span className="text-body-xs-regular text-[#C2410C] dark:text-[#FB923C]">{item.site_issue}</span>
                </li>
              ))}
            </ul>
          )}
        </E9Panel>
      </div>
    </div>
  );
}
