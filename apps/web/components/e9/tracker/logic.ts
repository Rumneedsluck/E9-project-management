/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TE9StageKey } from "./constants";
import { E9_TRACKER_STAGES } from "./constants";

export type TE9UnitMode = "sqft" | "nos" | "either";

/** A scope sheet on a project (standard or added by the team). */
export type TE9ProjectScope = {
  key: string;
  label: string;
  prefix: string;
  unit_mode: TE9UnitMode;
  is_standard: boolean;
  enabled: boolean;
  sort_order: number;
  item_count?: number;
};

export type TE9FloorStatus = "Not Started" | "In Progress" | "Handed Over";

export type TE9Floor = {
  id: string;
  name: string;
  sort_order: number;
  status: TE9FloorStatus;
  target_date: string | null;
  notes: string;
};

export type TE9Attachment = {
  id: string;
  item: string | null;
  kind: "photo" | "site_audit" | "dc_scan" | "document" | "po" | "mail" | "certificate" | "pi" | "wcc" | "snag";
  /** the PO / amendment / bill this file belongs to */
  ref_id?: string | null;
  name: string;
  size: number;
  content_type: string;
  link: string;
  label: string;
  version: "" | "Draft" | "Final";
  sent_on: string | null;
  has_file: boolean;
  created_at: string;
  created_by: string | null;
};

export type TE9Change = {
  id: string;
  entity: "item" | "project" | "scope" | "floor" | "attachment" | "import";
  entity_id: string | null;
  entity_label: string;
  action: "created" | "updated" | "deleted" | "uploaded" | "imported";
  field: string;
  field_label: string;
  old_value: string;
  new_value: string;
  created_at: string;
  actor: { id: string; name: string } | null;
};

/** One row on a scope sheet, as returned by /e9/projects/:id/items/. */
export type TE9ScopeItem = {
  // template columns added later (production size, partial DCs, certified)
  production_height_in: string | null;
  production_width_in: string | null;
  production_qty: string | null;
  production_measure: string | null;
  wastage: string | null;
  dc_qty: string;
  dispatched: string | null;
  balance: string | null;
  dc_list: { dc: string; qty: string | null }[];
  certified_height_in: string | null;
  certified_width_in: string | null;
  certified_qty: string | null;
  certified_measure: string | null;
  resent: string;
  id: string;
  scope: string;
  item_number: number;
  item_code: string;
  unit: "sqft" | "nos";
  area_sqft: string | null;
  current_stage: string;
  boq_item_no: string;
  floor_area: string;
  floor_plan_ref: string;
  description: string;
  site_audit_status: string;
  height_in: string | null;
  width_in: string | null;
  qty: string | null;
  unit_override: "" | "sqft" | "nos";
  photo_link: string;
  site_issue: string;
  issue_resolved: string;
  pre_press: string;
  jc_no: string;
  production_status: string;
  material_status: string;
  quality_check: string;
  qc_done_by: string;
  dc_nos: string;
  dispatch_status: string;
  installation_status: string;
  installation_date: string | null;
  installed_by: string;
  client_sign_off: string;
  remarks: string;
  sort_order: number;
  updated_at: string;
};

export type TE9StageTargets = Partial<Record<(typeof E9_TRACKER_STAGES)[number]["targetField"], string | null>>;

const DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: string | number | null | undefined): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const parseDay = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};

export const todayDate = (now: Date = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** Template rule: a row counts once something is typed in Floor, Description, Height, Width or Qty. */
export const isFilled = (item: TE9ScopeItem): boolean =>
  Boolean(item.floor_area?.trim() || item.description?.trim() || item.height_in || item.width_in || item.qty);

/** How much one item counts: 1 per item for sq-ft scopes, its Qty for Nos scopes (frames, signages, 3D). */
export const itemMeasure = (item: TE9ScopeItem): number => (item.unit === "nos" ? toNumber(item.qty) || 1 : 1);

export const itemArea = (item: TE9ScopeItem): number => (item.unit === "sqft" ? toNumber(item.area_sqft) : 0);

/** Whether an item has finished a given stage (same tests as the template dashboard). */
export const isStageDone = (item: TE9ScopeItem, stage: TE9StageKey): boolean => {
  switch (stage) {
    case "site_audit":
      return item.site_audit_status === "Measured";
    case "pre_press":
      return item.pre_press === "Sent for Production";
    case "material":
      return item.material_status === "Material Received";
    case "delivered":
      return item.dispatch_status === "Delivered at Site";
    case "installation":
      return item.installation_status === "Installation Done";
    case "sign_off":
      return item.client_sign_off === "Signed Off";
    default:
      return false;
  }
};

/** Red highlighting: the stage's target date has passed and this item has not finished that stage. */
export const isStageOverdue = (
  item: TE9ScopeItem,
  stage: TE9StageKey,
  targets: TE9StageTargets,
  today: Date = todayDate()
): boolean => {
  const meta = E9_TRACKER_STAGES.find((entry) => entry.key === stage);
  const target = parseDay(meta ? targets[meta.targetField] : null);
  if (!target || !isFilled(item)) return false;
  return target < today && !isStageDone(item, stage);
};

export type TScopeProgress = {
  scope: string;
  label: string;
  unit: "sqft" | "nos" | "mixed";
  items: number;
  area: number;
  productionDone: number;
  materialReceived: number;
  qcPassed: number;
  delivered: number;
  installed: number;
  signedOff: number;
  /** % installed, by item / Nos count */
  percentItems: number;
  /** % installed, by area; null when the scope has no sq-ft items */
  percentArea: number | null;
};

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Totals for one group of rows (a scope, a floor ...). */
const groupTotals = (rows: TE9ScopeItem[]) => {
  const sum = (filter: (item: TE9ScopeItem) => boolean) =>
    rows.filter(filter).reduce((total, item) => total + itemMeasure(item), 0);
  const total = sum(() => true);
  const area = rows.reduce((totalArea, item) => totalArea + itemArea(item), 0);
  const installedArea = rows
    .filter((item) => item.installation_status === "Installation Done")
    .reduce((totalArea, item) => totalArea + itemArea(item), 0);
  const installed = sum((item) => item.installation_status === "Installation Done");
  return {
    items: total,
    nos: rows.filter((item) => item.unit === "nos").reduce((t, item) => t + itemMeasure(item), 0),
    area: Math.round(area * 100) / 100,
    productionDone: sum((item) => item.production_status === "Production Done"),
    materialReceived: sum((item) => item.material_status === "Material Received"),
    qcPassed: sum((item) => item.quality_check === "Passed"),
    delivered: sum((item) => item.dispatch_status === "Delivered at Site"),
    installed,
    signedOff: sum((item) => item.client_sign_off === "Signed Off"),
    percentItems: percent(installed, total),
    percentArea: area > 0 ? percent(installedArea, area) : null,
  };
};

export type TFloorProgress = ReturnType<typeof groupTotals> & {
  name: string;
  floor: TE9Floor | null;
  rows: number;
};

/** Floor-wise totals. Floors from the floor list come first (in their order), then any other floor names typed on items. */
export const floorProgress = (items: TE9ScopeItem[], floors: TE9Floor[]): TFloorProgress[] => {
  const rows = items.filter(isFilled);
  const names = [...floors.map((floor) => floor.name), ...rows.map((item) => item.floor_area.trim() || "No floor set")];
  return [...new Set(names)]
    .map((name) => {
      const floorRows = rows.filter((item) => (item.floor_area.trim() || "No floor set") === name);
      return {
        name,
        floor: floors.find((floor) => floor.name === name) ?? null,
        rows: floorRows.length,
        ...groupTotals(floorRows),
      };
    })
    .filter((row) => row.rows > 0 || row.floor);
};

export const scopeProgress = (
  items: TE9ScopeItem[],
  scopes: Pick<TE9ProjectScope, "key" | "label" | "unit_mode">[]
): TScopeProgress[] =>
  scopes.map((scope) => {
    const totals = groupTotals(items.filter((item) => item.scope === scope.key && isFilled(item)));
    return {
      scope: scope.key,
      label: scope.label,
      unit: scope.unit_mode === "either" ? "mixed" : scope.unit_mode,
      ...totals,
    };
  });

export type TTrackerKpis = {
  totalItems: number;
  totalArea: number;
  percentDone: number;
  installedArea: number;
  daysToDeadline: number | null;
  openSiteIssues: number;
};

export const isOpenSiteIssue = (item: TE9ScopeItem) =>
  isFilled(item) && !!item.site_issue && item.site_issue !== "No issues" && item.issue_resolved !== "Yes";

export const trackerKpis = (
  items: TE9ScopeItem[],
  deadline: string | null,
  today: Date = todayDate()
): TTrackerKpis => {
  const rows = items.filter(isFilled);
  const totalItems = rows.reduce((total, item) => total + itemMeasure(item), 0);
  const installed = rows
    .filter((item) => item.installation_status === "Installation Done")
    .reduce((total, item) => total + itemMeasure(item), 0);
  const totalArea = rows.reduce((total, item) => total + itemArea(item), 0);
  const installedArea = rows
    .filter((item) => item.installation_status === "Installation Done")
    .reduce((total, item) => total + itemArea(item), 0);
  const deadlineDay = parseDay(deadline);
  return {
    totalItems,
    totalArea: Math.round(totalArea * 100) / 100,
    installedArea: Math.round(installedArea * 100) / 100,
    percentDone: percent(installed, totalItems),
    daysToDeadline: deadlineDay ? Math.round((deadlineDay.getTime() - today.getTime()) / DAY_MS) : null,
    openSiteIssues: rows.filter(isOpenSiteIssue).length,
  };
};

export type TStageTargetRow = {
  key: TE9StageKey;
  label: string;
  target: string | null;
  done: number;
  pending: number;
  overdue: number;
  daysLeft: number | null;
  status: "complete" | "no_target" | "overdue" | "on_track" | "no_items";
};

/** The "STAGE TARGETS & OVERDUE" table from the template dashboard. */
export const stageTargetRows = (
  items: TE9ScopeItem[],
  targets: TE9StageTargets,
  today: Date = todayDate()
): TStageTargetRow[] => {
  const rows = items.filter(isFilled);
  return E9_TRACKER_STAGES.map((stage) => {
    const target = targets[stage.targetField] ?? null;
    const targetDay = parseDay(target);
    const done = rows.filter((item) => isStageDone(item, stage.key)).reduce((t, item) => t + itemMeasure(item), 0);
    const total = rows.reduce((t, item) => t + itemMeasure(item), 0);
    const pending = total - done;
    const daysLeft = targetDay ? Math.round((targetDay.getTime() - today.getTime()) / DAY_MS) : null;
    const overdue = targetDay && targetDay < today ? pending : 0;
    let status: TStageTargetRow["status"];
    if (total === 0) status = "no_items";
    else if (pending === 0) status = "complete";
    else if (!targetDay) status = "no_target";
    else if (overdue > 0) status = "overdue";
    else status = "on_track";
    return { key: stage.key, label: stage.label, target, done, pending, overdue, daysLeft, status };
  });
};

/** sq ft or Nos label for a number in a scope's own unit. */
export const formatMeasure = (value: number, unit: "sqft" | "nos" | "mixed") =>
  `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit === "sqft" ? " sq ft" : unit === "nos" ? " Nos" : ""}`;

/** Work done (installed) the way the Excel dashboard counts it: sq ft for sq-ft rows, Nos for the rest. */
export const workDone = (items: TE9ScopeItem[]) => {
  const rows = items.filter(isFilled);
  let sqftTotal = 0;
  let sqftDone = 0;
  let nosTotal = 0;
  let nosDone = 0;
  for (const item of rows) {
    const done = item.installation_status === "Installation Done";
    if (item.unit === "sqft") {
      const area = toNumber(item.area_sqft);
      sqftTotal += area;
      if (done) sqftDone += area;
    } else {
      const qty = toNumber(item.qty) || 1;
      nosTotal += qty;
      if (done) nosDone += qty;
    }
  }
  const percent = sqftTotal > 0 ? (sqftDone / sqftTotal) * 100 : nosTotal > 0 ? (nosDone / nosTotal) * 100 : 0;
  return { rows: rows.length, sqftTotal, sqftDone, nosTotal, nosDone, percent: Math.round(percent) };
};

/** The 5 stage pies of the Excel scope sheets (counts of rows per status). */
export const STAGE_PIES: {
  title: string;
  field: keyof TE9ScopeItem;
  statuses: { value: string; label: string; problem?: boolean }[];
}[] = [
  {
    title: "Production",
    field: "production_status",
    statuses: [
      { value: "Not Started", label: "Not started" },
      { value: "In Production", label: "In production" },
      { value: "Production Done", label: "Production done" },
    ],
  },
  {
    title: "Material",
    field: "material_status",
    statuses: [
      { value: "", label: "Not raised yet" },
      { value: "JC Raised", label: "JC raised" },
      { value: "Partial Received", label: "Partial received" },
      { value: "Material Received", label: "Material received" },
    ],
  },
  {
    title: "Quality check",
    field: "quality_check",
    statuses: [
      { value: "Needs Revision", label: "Needs revision", problem: true },
      { value: "Pending", label: "Pending" },
      { value: "Passed", label: "Passed" },
    ],
  },
  {
    title: "Dispatch",
    field: "dispatch_status",
    statuses: [
      { value: "Not Dispatched", label: "Not dispatched" },
      { value: "Partially Dispatched", label: "Partly dispatched" },
      { value: "Dispatched", label: "Dispatched" },
      { value: "Delivered at Site", label: "Delivered at site" },
    ],
  },
  {
    title: "Installation",
    field: "installation_status",
    statuses: [
      { value: "Not Started", label: "Not started" },
      { value: "In Progress", label: "In progress" },
      { value: "Installation Done", label: "Installation done" },
    ],
  },
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Excel dates come as 12/11/2026, 12-11-2026, 2026-11-12 or 12 Nov 2026 (day first, Indian style). */
export const parsePastedDate = (raw: string): string | null => {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(value);
  const named = /^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-,]+(\d{2,4})$/i.exec(value);
  let year: number;
  let month: number;
  let day: number;
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else if (named) [day, month, year] = [Number(named[1]), MONTHS.indexOf(named[2].toLowerCase()) + 1, Number(named[3])];
  else return null;
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
};
