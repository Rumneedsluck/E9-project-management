/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { E9_DUE_SOON_DAYS, E9_STAGES, E9_STATUSES, getStageIndex } from "./constants";
import type { TE9Project, TE9ProjectPriority, TE9ProjectStatus } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse "YYYY-MM-DD" as a local calendar date (no timezone shift). */
export const parseDateOnly = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const startOfToday = (now: Date = new Date()): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** Whole days from today until the date (negative = in the past). */
export const daysUntil = (value: string | null | undefined, today: Date = startOfToday()): number | null => {
  const date = parseDateOnly(value);
  if (!date) return null;
  return Math.round((date.getTime() - today.getTime()) / DAY_MS);
};

export const isClosed = (status: TE9ProjectStatus): boolean => status === "completed";

export type TDeadlineState = "none" | "done" | "overdue" | "due_soon" | "on_track";

export const getDeadlineState = (project: TE9Project, today: Date = startOfToday()): TDeadlineState => {
  if (isClosed(project.e9.status)) return "done";
  const days = daysUntil(project.e9.deadline, today);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days <= E9_DUE_SOON_DAYS) return "due_soon";
  return "on_track";
};

/** Human wording for a deadline, e.g. "3 days overdue", "Due today", "in 12 days". */
export const describeDeadline = (project: TE9Project, today: Date = startOfToday()): string => {
  const days = daysUntil(project.e9.deadline, today);
  if (days === null) return "No deadline";
  if (isClosed(project.e9.status)) return "Completed";
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
};

/**
 * Progress for a project in percent. Uses Plane work items when the project
 * has any; otherwise falls back to how far along the job stages it is.
 */
export const getProgressPercent = (project: TE9Project): number => {
  // the tracker (installed share, like the Excel dashboard) wins when the project has rows
  if (project.tracker && project.tracker.rows > 0) return project.tracker.percent;
  if (project.e9.status === "completed") return 100;
  const { total, completed } = project.work_items;
  if (total > 0) return Math.round((completed / total) * 100);
  const index = getStageIndex(project.e9.status);
  if (index < 0) return 0;
  return Math.round((index / (E9_STAGES.length - 1)) * 100);
};

export type TE9Summary = {
  total: number;
  active: number;
  dueSoon: number;
  overdue: number;
  completed: number;
  onHold: number;
  byStatus: Record<TE9ProjectStatus, number>;
};

export const summarizeProjects = (projects: TE9Project[], today: Date = startOfToday()): TE9Summary => {
  const byStatus = Object.fromEntries(E9_STATUSES.map((status) => [status.key, 0])) as Record<TE9ProjectStatus, number>;
  const summary: TE9Summary = {
    total: projects.length,
    active: 0,
    dueSoon: 0,
    overdue: 0,
    completed: 0,
    onHold: 0,
    byStatus,
  };
  for (const project of projects) {
    byStatus[project.e9.status] = (byStatus[project.e9.status] ?? 0) + 1;
    if (project.e9.status === "completed") summary.completed += 1;
    else summary.active += 1;
    if (project.e9.status === "on_hold") summary.onHold += 1;
    const state = getDeadlineState(project, today);
    if (state === "overdue") summary.overdue += 1;
    if (state === "due_soon") summary.dueSoon += 1;
  }
  return summary;
};

/** Open projects that need attention, most urgent first: overdue, then due soon. */
export const getAttentionProjects = (projects: TE9Project[], today: Date = startOfToday()): TE9Project[] =>
  projects
    .filter((project) => ["overdue", "due_soon"].includes(getDeadlineState(project, today)))
    // oxlint-disable-next-line unicorn/no-array-sort -- sorting a filtered copy
    .sort((a, b) => (daysUntil(a.e9.deadline, today) ?? 0) - (daysUntil(b.e9.deadline, today) ?? 0));

export type TE9ProjectFilters = {
  search: string;
  status: TE9ProjectStatus | "all" | "active";
  priority: TE9ProjectPriority | "all";
};

export const DEFAULT_E9_FILTERS: TE9ProjectFilters = { search: "", status: "active", priority: "all" };

export const filterProjects = (projects: TE9Project[], filters: TE9ProjectFilters): TE9Project[] => {
  const query = filters.search.trim().toLowerCase();
  return projects.filter((project) => {
    if (filters.status === "active" && project.e9.status === "completed") return false;
    if (filters.status !== "all" && filters.status !== "active" && project.e9.status !== filters.status) return false;
    if (filters.priority !== "all" && project.e9.priority !== filters.priority) return false;
    if (!query) return true;
    return [project.name, project.identifier, project.e9.client_name, project.e9.city, project.e9.work_order_number]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
};

export type TE9SortKey = "deadline" | "name" | "priority" | "recent";

const PRIORITY_RANK: Record<TE9ProjectPriority, number> = { high: 0, medium: 1, low: 2 };

export const sortProjects = (projects: TE9Project[], sortKey: TE9SortKey): TE9Project[] =>
  // oxlint-disable-next-line unicorn/no-array-sort -- sorting a copy
  [...projects].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return a.name.localeCompare(b.name);
      case "priority":
        return PRIORITY_RANK[a.e9.priority] - PRIORITY_RANK[b.e9.priority];
      case "recent":
        return b.created_at.localeCompare(a.created_at);
      case "deadline":
      default: {
        // Projects without a deadline go last
        const aDate = a.e9.deadline ?? "9999-12-31";
        const bDate = b.e9.deadline ?? "9999-12-31";
        return aDate.localeCompare(bDate);
      }
    }
  });

/** Suggest a short project code from its name, e.g. "Bluefin Bank Branch Rollout" -> "BBBR". */
export const suggestIdentifier = (name: string): string => {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 5);
  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 5);
};

/** Initials for an avatar fallback. */
export const getInitials = (firstName?: string, lastName?: string, fallback?: string): string => {
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.trim();
  return (initials || fallback?.[0] || "?").toUpperCase();
};
