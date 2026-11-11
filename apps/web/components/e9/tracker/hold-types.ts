/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Shapes of the read-only screens from the tracker template: hold & cancel lists, health check, client report. */

export type TE9HoldRow = {
  id: string;
  code: string;
  scope: string;
  scope_label: string;
  floor: string;
  description: string;
  reason: string;
  since: string | null;
  days: number | null;
  bill_now: string;
  billable: boolean;
  replaced_by: string;
  /** "" = not a replacement; ok / missing (nothing typed) / unknown (that item code does not exist) */
  replacement: "" | "ok" | "missing" | "unknown";
};

export type TE9Hold = {
  held: TE9HoldRow[];
  cancelled: TE9HoldRow[];
  billable_held: number;
  reasons: string[];
};

export type TE9HealthCheck = {
  key: string;
  label: string;
  meaning: string;
  count: number;
  items: { id: string; code: string; note: string }[];
};

export type TE9Health = {
  problems: number;
  checks: TE9HealthCheck[];
  on_hold: number;
  cancelled: number;
};

export type TE9ReportScope = {
  scope: string;
  label: string;
  items: number;
  sqft: string;
  nos: string;
  on_hold: number;
  production_done: number;
  material_received: number;
  qc_passed: number;
  delivered: number;
  installed: number;
  signed_off: number;
  percent: number;
};

export type TE9Report = {
  project_name: string;
  as_on: string;
  headline: {
    items: number;
    percent_installed: number;
    days_to_deadline: number | null;
    open_site_issues: number;
    open_snags: number;
    on_hold: number;
    cancelled: number;
  };
  by_scope: TE9ReportScope[];
  stages: {
    stage: string;
    target: string | null;
    done: number;
    pending: number;
    state: "Done" | "Overdue" | "On track";
  }[];
  billing: { billable_items: number; of_which_on_hold: number; not_billable_yet: number; sqft: string; nos: string };
  held: TE9HoldRow[];
  cancelled: TE9HoldRow[];
};
