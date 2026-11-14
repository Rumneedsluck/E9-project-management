/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BuildingOutline, DueDateOutline, PieOutline, WarningTriangleOutline } from "@makeplane/propel/icons";
import { cn, renderFormattedDate } from "@plane/utils";
import { E9BoqDashboardPanel } from "../commercial/boq-dashboard-panel";
import { E9OpenSnagsPanel } from "../commercial/snags-page";
import { refreshE9Projects, useE9Floors, useE9Items, useE9Scopes } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import { setToast } from "@plane/blocks/toast";
import { e9ProjectService } from "@/services/e9/project.service";
import { errorText } from "../commercial/shared";
import { E9ActivityHeatmap } from "../activity-heatmap";
import { E9StagePie } from "../charts";
import { E9ScopeTickPie } from "../scope-pie";
import type { TE9ScopeItem, TScopeProgress, TStageTargetRow } from "./logic";
import {
  STAGE_PIES,
  counted,
  floorProgress,
  formatMeasure,
  isFilled,
  isOpenSiteIssue,
  scopeProgress,
  stageTargetRows,
  trackerKpis,
  workDone,
} from "./logic";
import { E9_TRACKER_STAGES, scopeColor } from "./constants";
import { floorStatusClass } from "./setup-panels";
import { E9TargetDate } from "./target-date";

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

const STAGES_OPEN_KEY = "e9-overview-stages-open";

/** The five stage pies stay tucked away until asked for; the choice is remembered on this computer. */
function useStagesOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STAGES_OPEN_KEY) === "1");
    } catch {
      // storage blocked: the pies simply start folded
    }
  }, []);
  const toggle = () =>
    setOpen((value) => {
      try {
        window.localStorage.setItem(STAGES_OPEN_KEY, value ? "0" : "1");
      } catch {
        // not remembered, still works
      }
      return !value;
    });
  return [open, toggle] as const;
}

/** The big work-done pie, and the 5 stage pies behind an arrow (like the Excel dashboard and scope sheets). */
function WorkDonePies({ items, progress }: { items: TE9ScopeItem[]; progress: TScopeProgress[] }) {
  const done = workDone(items);
  // one sector per scope in use, sized by its pieces (Nos) and sq-ft rows, as in "Items / Qty"
  const slices = progress
    .filter((row) => row.items > 0)
    .map((row, index) => ({
      key: row.scope,
      label: row.label,
      color: scopeColor(row.scope, index),
      value: row.items,
      percent: row.percentItems,
    }));
  const rows = counted(items).filter(isFilled);
  const [stagesOpen, toggleStages] = useStagesOpen();
  const reduceMotion = useReducedMotion();
  return (
    <section className="flex flex-col gap-4">
      {/* the whole project's outcome: one big pie */}
      <div className="e9-crop relative flex flex-col items-center gap-3 border border-subtle bg-surface-1 px-6 py-8">
        <span className="e9-eyebrow">Work done · whole project</span>
        <E9ScopeTickPie slices={slices} percent={done.percent} size={300} label="work done" />
        {/* a slim pull-handle: click it, or drag it up, and the five stages slide up; drag it down to put them away */}
        <motion.button
          type="button"
          aria-expanded={stagesOpen}
          aria-controls="e9-stage-pies"
          aria-label={stagesOpen ? "Put the five stages away" : "Pull up the five stages"}
          title={stagesOpen ? "Drag down or click to close" : "Drag up or click to see the five stages"}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.5}
          onDragEnd={(_, info) => {
            if (info.offset.y < -28 && !stagesOpen) toggleStages();
            else if (info.offset.y > 28 && stagesOpen) toggleStages();
          }}
          onTap={toggleStages}
          className="group mt-2 flex h-8 w-24 cursor-grab touch-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-default)] active:cursor-grabbing"
        >
          <span className="h-1 w-12 rounded-full bg-[var(--e9-grid)] transition-colors group-hover:bg-[var(--e9-brass)]" />
        </motion.button>
      </div>
      {/* the five stages slide up from below when the handle is pulled */}
      <motion.div
        id="e9-stage-pies"
        inert={!stagesOpen}
        initial={false}
        animate={{ height: stagesOpen ? "auto" : 0, opacity: stagesOpen ? 1 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 190, damping: 26 }}
        className="overflow-hidden"
      >
        <motion.div
          initial={false}
          animate={{ y: stagesOpen ? 0 : 56 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 190, damping: 22 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          {STAGE_PIES.map((pie) => (
            <E9StagePie
              key={pie.title}
              title={pie.title}
              segments={pie.statuses.map((status) => ({
                key: status.value || "blank",
                label: status.label,
                value: rows.filter((item) => String(item[pie.field] ?? "") === status.value).length,
                color: status.problem ? "#EF4444" : undefined,
              }))}
            />
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

export function E9TrackerDashboard({ workspaceSlug, project, onOpenSheet, onOpenView }: Props) {
  const { data, error, isLoading, mutate } = useE9Items(workspaceSlug, project.id);
  const items = useMemo(() => data?.items ?? [], [data]);
  const { data: scopeList } = useE9Scopes(workspaceSlug, project.id);
  const { data: floorList, mutate: mutateFloors } = useE9Floors(workspaceSlug, project.id);
  const scopes = useMemo(() => (scopeList ?? []).filter((scope) => scope.enabled), [scopeList]);
  const scopeLabel = (key: string) => scopeList?.find((scope) => scope.key === key)?.label ?? key;
  const progress = useMemo(() => scopeProgress(items, scopes), [items, scopes]);
  const floors = useMemo(() => floorProgress(items, floorList ?? []), [items, floorList]);
  const today = new Date().toISOString().slice(0, 10);
  const kpis = useMemo(() => trackerKpis(items, project.e9.deadline), [items, project.e9.deadline]);
  const stages = useMemo(() => stageTargetRows(items, project.e9), [items, project.e9]);
  const issues = useMemo(() => items.filter(isOpenSiteIssue), [items]);

  // target dates are written right in the tables (they move, so nothing is locked)
  const saveStageTarget = async (field: string, value: string | null) => {
    try {
      await e9ProjectService.updateProfile(workspaceSlug, project.id, { [field]: value });
      await refreshE9Projects(workspaceSlug, project.id);
    } catch (failure) {
      setToast({ type: "error", title: "Couldn't save the date", message: errorText(failure) });
    }
  };
  const saveFloorTarget = async (floorId: string, value: string | null) => {
    try {
      await e9ProjectService.updateFloor(workspaceSlug, project.id, floorId, { target_date: value });
      await mutateFloors();
    } catch (failure) {
      setToast({ type: "error", title: "Couldn't save the date", message: errorText(failure) });
    }
  };
  const canEditFloors = !!data?.can_edit;

  if (isLoading && !data) return <E9LoadingState />;
  if (!data) return error ? <E9ErrorState onRetry={() => mutate()} /> : <E9LoadingState />;

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
  const lateStages = stages.filter((row) => row.status === "overdue").length;
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
      <WorkDonePies items={items} progress={progress} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <E9ActivityHeatmap workspaceSlug={workspaceSlug} projectId={project.id} />

      <E9Panel
        tone="blue"
        icon={PieOutline}
        title="Progress by scope"
        subtitle="Each type of work: how many items, and how far along"
        meta={`${usedScopes.length} ${usedScopes.length === 1 ? "scope" : "scopes"}`}
      >
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

      {floors.length > 0 && (
        <E9Panel
          tone="teal"
          icon={BuildingOutline}
          title="Progress by floor"
          subtitle="Each floor: its status, target date and how much is done"
          meta={`${floors.length} ${floors.length === 1 ? "floor" : "floors"}`}
        >
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
                      <td className="px-4 py-2.5 tabular-nums">
                        <E9TargetDate
                          value={target}
                          label={`Target date for ${row.name}`}
                          editable={canEditFloors && !!row.floor}
                          late={late}
                          onSave={(value) => saveFloorTarget(row.floor!.id, value)}
                        />
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
            Click a floor&apos;s target date to pick or type it (status and notes are on the Tracker sheet › Floors). A
            floor turns red when its target date has passed and it isn&apos;t handed over.
          </p>
        </E9Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <E9Panel
          tone="violet"
          icon={DueDateOutline}
          title="Stage targets & overdue"
          subtitle="The deadline for each stage, and what is running late"
          meta={lateStages > 0 ? `${lateStages} late` : undefined}
          className="lg:col-span-2"
        >
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
                    <td className="px-4 py-2.5 tabular-nums">
                      <E9TargetDate
                        value={row.target}
                        label={`Target date for ${row.label}`}
                        editable={project.can_edit}
                        onSave={(value) =>
                          saveStageTarget(E9_TRACKER_STAGES.find((stage) => stage.key === row.key)!.targetField, value)
                        }
                      />
                    </td>
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
            {project.can_edit
              ? "Click a target date to pick it from the calendar or type it; clear it with ×. Late items turn red on the Tracker sheet."
              : "Only the project's admins change target dates. Late items turn red on the Tracker sheet."}
          </p>
        </E9Panel>

        <E9Panel
          tone="red"
          icon={WarningTriangleOutline}
          title="Open site issues"
          subtitle="Problems reported from the site"
          meta={`${issues.length} open`}
        >
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

      {/* the money and sign-off cards sit last: snags, then BOQ check beside Billing */}
      <E9OpenSnagsPanel workspaceSlug={workspaceSlug} projectId={project.id} onOpen={() => onOpenView?.("snags")} />
      <E9BoqDashboardPanel workspaceSlug={workspaceSlug} projectId={project.id} onOpen={(view) => onOpenView?.(view)} />
    </div>
  );
}
