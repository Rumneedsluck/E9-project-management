/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * The sums behind the E9 charts, kept apart from the drawing so they can be tested on their own.
 * Nothing here touches the screen.
 */

import { E9_ON_HOLD, E9_STAGES } from "./constants";
import { getProgressPercent, isClosed, parseDateOnly } from "./helpers";
import type { TE9CertState, TE9Project, TE9ProjectStatus } from "./types";

export const DAY_MS = 86_400_000;

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const dayGap = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

/* ---- shares of a whole ---------------------------------------------------------------------------- */

/** Whole-number percentages that always add up to 100 (the largest leftovers get the spare points). */
export const roundShares = (values: number[]): number[] => {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((value) => (Math.max(0, value) / total) * 100);
  const floors = exact.map(Math.floor);
  let spare = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    // oxlint-disable-next-line unicorn/no-array-sort -- sorting a fresh array
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  const result = [...floors];
  for (const { index } of order) {
    if (spare <= 0) break;
    if (exact[index] === 0) continue;
    result[index] += 1;
    spare -= 1;
  }
  return result;
};

/** Whether a short label fits inside a block this wide, with room to breathe on both sides. */
export const labelFits = (blockPx: number, text: string, charPx = 6.6, padPx = 14): boolean =>
  blockPx >= text.length * charPx + padPx;

/** 0 (nothing) to 5 (all of it): how strongly a table cell is tinted for "this much is done". */
export const heatStep = (done: number, total: number): 0 | 1 | 2 | 3 | 4 | 5 => {
  if (total <= 0 || done <= 0) return 0;
  const ratio = Math.min(1, done / total);
  if (ratio >= 1) return 5;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
};

/* ---- sites by stage, by certification step and by city -------------------------------------------- */

export type TStageCount = { key: TE9ProjectStatus; label: string; color: string; count: number };

/** How many sites sit at each job stage, in the order work happens, with "On hold" last. */
export const stageCounts = (projects: TE9Project[]): TStageCount[] =>
  [...E9_STAGES, E9_ON_HOLD].map((stage) => ({
    key: stage.key,
    label: stage.label,
    color: stage.color,
    count: projects.filter((project) => project.e9.status === stage.key).length,
  }));

export type TCertStep = { key: TE9CertState; label: string; hint: string; count: number };

/** From work to money: how many sites are at each certification step. A site sits at exactly one step. */
export const certSteps = (projects: TE9Project[]): TCertStep[] => {
  const at = (state: TE9CertState) =>
    projects.filter((project) => (project.cert_state ?? "in_progress") === state).length;
  return [
    { key: "in_progress", label: "Work in progress", hint: "Nothing signed yet", count: at("in_progress") },
    { key: "jmc_pending", label: "Waiting for JMC", hint: "Work done, client yet to sign", count: at("jmc_pending") },
    {
      key: "part_certified",
      label: "Part certified",
      hint: "Some floors or scopes signed",
      count: at("part_certified"),
    },
    { key: "certified", label: "Certified", hint: "Whole site signed, billing open", count: at("certified") },
  ];
};

export type TCityCount = { city: string; count: number };

/** Open sites per city, busiest first; sites with no city are gathered under "No city set". */
export const cityCounts = (projects: TE9Project[], limit = 6): TCityCount[] => {
  const counts = new Map<string, number>();
  for (const project of projects) {
    if (isClosed(project.e9.status)) continue;
    const city = project.e9.city.trim() || "No city set";
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    // oxlint-disable-next-line unicorn/no-array-sort -- sorting a fresh array
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  if (ranked.length <= limit) return ranked;
  const rest = ranked.slice(limit - 1).reduce((sum, row) => sum + row.count, 0);
  return [...ranked.slice(0, limit - 1), { city: "Other cities", count: rest }];
};

/* ---- the schedule: every open site from its start to its handover date ---------------------------- */

export type TTimeDomain = { from: Date; to: Date };

type TDomainOptions = { padDays?: number; maxBackDays?: number; maxAheadDays?: number; minDays?: number };

/**
 * The stretch of time the schedule shows. It always includes today, is padded a little on both sides,
 * and never reaches further than a few months either way, so one very old or far-off site cannot squash the rest.
 */
export const timelineDomain = (
  spans: { start: Date | null; end: Date | null }[],
  today: Date,
  { padDays = 10, maxBackDays = 75, maxAheadDays = 150, minDays = 42 }: TDomainOptions = {}
): TTimeDomain => {
  const times = spans.flatMap((span) => [span.start, span.end]).filter((date): date is Date => !!date);
  const earliest = times.reduce((min, date) => (date < min ? date : min), today);
  const latest = times.reduce((max, date) => (date > max ? date : max), today);
  let from = addDays(earliest, -padDays);
  let to = addDays(latest, padDays);
  const backLimit = addDays(today, -maxBackDays);
  const aheadLimit = addDays(today, maxAheadDays);
  if (from < backLimit) from = backLimit;
  if (to > aheadLimit) to = aheadLimit;
  if (dayGap(from, to) < minDays) to = addDays(from, minDays);
  return { from, to };
};

/** Where a date falls in the domain: 0 at its start, 1 at its end (may be outside 0..1). */
export const timePosition = (date: Date, domain: TTimeDomain): number =>
  (date.getTime() - domain.from.getTime()) / (domain.to.getTime() - domain.from.getTime());

export type TSpanBox = {
  /** 0..1 from the left edge */
  left: number;
  /** 0..1 of the full width */
  width: number;
  /** the real start / end is off the edge of the chart */
  clippedStart: boolean;
  clippedEnd: boolean;
};

/** The bar for one site. Null when it has no handover date, or lies wholly outside the chart. */
export const spanBox = (start: Date | null, end: Date | null, domain: TTimeDomain): TSpanBox | null => {
  if (!end) return null;
  const rawEnd = timePosition(end, domain);
  // no start date: draw a short stub that ends on the handover date
  const rawStart = start && start <= end ? timePosition(start, domain) : rawEnd - 0.012;
  if (rawEnd <= 0 || rawStart >= 1) return null;
  const left = Math.max(0, rawStart);
  const right = Math.min(1, rawEnd);
  return { left, width: Math.max(0.006, right - left), clippedStart: rawStart < 0, clippedEnd: rawEnd > 1 };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type TMonthTick = { key: string; label: string; at: number };

/** A tick at the first day of each month inside the domain. January carries the year. */
export const monthTicks = (domain: TTimeDomain): TMonthTick[] => {
  const ticks: TMonthTick[] = [];
  let cursor = new Date(domain.from.getFullYear(), domain.from.getMonth() + 1, 1);
  while (cursor <= domain.to) {
    const month = cursor.getMonth();
    ticks.push({
      key: `${cursor.getFullYear()}-${month}`,
      label: month === 0 ? `Jan ${String(cursor.getFullYear()).slice(2)}` : MONTHS[month],
      at: timePosition(cursor, domain),
    });
    cursor = new Date(cursor.getFullYear(), month + 1, 1);
  }
  return ticks;
};

export type TScheduleRow = {
  project: TE9Project;
  start: Date | null;
  end: Date | null;
  box: TSpanBox | null;
  /** 0..100: how much of the work is done */
  progress: number;
  /** days until handover (negative = late); null with no date */
  daysLeft: number | null;
};

/** Open sites for the schedule: most urgent handover first, sites with no date last. */
export const scheduleRows = (
  projects: TE9Project[],
  today: Date,
  limit = 8
): { rows: TScheduleRow[]; domain: TTimeDomain; hidden: number } => {
  const open = projects.filter((project) => !isClosed(project.e9.status));
  const dated = open.map((project) => {
    const end = parseDateOnly(project.e9.deadline);
    const start = parseDateOnly(project.e9.start_date) ?? parseDateOnly(project.created_at?.slice(0, 10));
    return { project, start, end };
  });
  // oxlint-disable-next-line unicorn/no-array-sort -- sorting a fresh array
  const sorted = [...dated].sort((a, b) => {
    if (!a.end && !b.end) return a.project.name.localeCompare(b.project.name);
    if (!a.end) return 1;
    if (!b.end) return -1;
    return a.end.getTime() - b.end.getTime();
  });
  const shown = sorted.slice(0, limit);
  const domain = timelineDomain(
    shown.filter((entry) => entry.end),
    today
  );
  return {
    domain,
    hidden: sorted.length - shown.length,
    rows: shown.map(({ project, start, end }) => ({
      project,
      start,
      end,
      box: spanBox(start, end, domain),
      progress: getProgressPercent(project),
      daysLeft: end ? dayGap(today, end) : null,
    })),
  };
};
