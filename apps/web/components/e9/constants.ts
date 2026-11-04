/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TE9ProjectPriority, TE9ProjectStatus } from "./types";

type TStatusMeta = {
  key: TE9ProjectStatus;
  label: string;
  /** Short explanation shown in forms */
  hint: string;
  /** Dot / bar colour (works on light and dark backgrounds) */
  color: string;
};

/** Job stages in the order work happens. Keep in sync with E9ProjectStatus in apps/api/plane/e9/models.py. */
export const E9_STAGES: TStatusMeta[] = [
  { key: "awarded", label: "Awarded", hint: "Order confirmed, work not started", color: "#8B8D98" },
  { key: "site_audit", label: "Site Audit", hint: "Measurements, photos and site issues", color: "#3E7BFA" },
  { key: "pre_press", label: "Pre-Press", hint: "Elevations and print-ready files", color: "#7C5CFC" },
  { key: "production", label: "Production", hint: "Printing, fabrication and material", color: "#E8A317" },
  { key: "delivery", label: "Delivery", hint: "Quality check and dispatch to site", color: "#F06A25" },
  { key: "installation", label: "Installation", hint: "Team on site installing", color: "#14A3A3" },
  { key: "sign_off", label: "Client Sign-off", hint: "Handover and approval", color: "#2EA36B" },
  { key: "completed", label: "Completed", hint: "Signed off and closed", color: "#1B7F4E" },
];

export const E9_ON_HOLD: TStatusMeta = {
  key: "on_hold",
  label: "On Hold",
  hint: "Paused, waiting on client or site",
  color: "#D7263D",
};

export const E9_STATUSES: TStatusMeta[] = [...E9_STAGES, E9_ON_HOLD];

export const getStatusMeta = (status: TE9ProjectStatus): TStatusMeta =>
  E9_STATUSES.find((item) => item.key === status) ?? E9_STAGES[0];

/** 0-based position in the job journey; on-hold projects return -1. */
export const getStageIndex = (status: TE9ProjectStatus): number => E9_STAGES.findIndex((item) => item.key === status);

type TPriorityMeta = { key: TE9ProjectPriority; label: string; className: string };

export const E9_PRIORITIES: TPriorityMeta[] = [
  { key: "high", label: "High", className: "bg-danger-subtle text-danger-primary" },
  { key: "medium", label: "Medium", className: "bg-warning-subtle text-warning-primary" },
  { key: "low", label: "Low", className: "border border-subtle bg-layer-1 text-secondary" },
];

export const getPriorityMeta = (priority: TE9ProjectPriority): TPriorityMeta =>
  E9_PRIORITIES.find((item) => item.key === priority) ?? E9_PRIORITIES[1];

/** Deadlines this close (in days) are flagged as "due soon". */
export const E9_DUE_SOON_DAYS = 7;
