/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TE9ScopeKey, TE9StageKey } from "./constants";
import { E9_SCOPES, E9_TRACKER_STAGES } from "./constants";

/** One row on a scope sheet, as returned by /e9/projects/:id/items/. */
export type TE9ScopeItem = {
  id: string;
  scope: TE9ScopeKey;
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
  scope: TE9ScopeKey;
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

export const scopeProgress = (items: TE9ScopeItem[]): TScopeProgress[] =>
  E9_SCOPES.map((scope) => {
    const rows = items.filter((item) => item.scope === scope.key && isFilled(item));
    const sum = (filter: (item: TE9ScopeItem) => boolean) =>
      rows.filter(filter).reduce((total, item) => total + itemMeasure(item), 0);
    const total = sum(() => true);
    const area = rows.reduce((totalArea, item) => totalArea + itemArea(item), 0);
    const installedArea = rows
      .filter((item) => item.installation_status === "Installation Done")
      .reduce((totalArea, item) => totalArea + itemArea(item), 0);
    const installed = sum((item) => item.installation_status === "Installation Done");
    return {
      scope: scope.key,
      label: scope.label,
      unit: scope.unit === "either" ? "mixed" : scope.unit,
      items: total,
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
