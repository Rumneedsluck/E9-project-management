/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "@plane/types";

export type TE9ProjectStatus =
  | "awarded"
  | "site_audit"
  | "pre_press"
  | "production"
  | "delivery"
  | "installation"
  | "sign_off"
  | "completed"
  | "on_hold";

export type TE9ProjectPriority = "high" | "medium" | "low";

/** E9 business details stored by the backend `plane.e9` app. */
export type TE9ProjectProfile = {
  client_name: string;
  site_address: string;
  city: string;
  work_order_number: string;
  status: TE9ProjectStatus;
  priority: TE9ProjectPriority;
  start_date: string | null;
  deadline: string | null;
  client_contact: string;
  site_contact: string;
  work_order_date: string | null;
  site_timings: string;
  target_site_audit: string | null;
  target_pre_press: string | null;
  target_material: string | null;
  target_delivered: string | null;
  target_installation: string | null;
  target_sign_off: string | null;
  updated_at: string | null;
};

/** A Plane project together with its E9 profile, as returned by /api/workspaces/:slug/e9/projects/. */
export type TE9Project = {
  id: string;
  name: string;
  identifier: string;
  description: string;
  logo_props: TLogoProps;
  project_lead: string | null;
  member_ids: string[];
  created_at: string;
  can_edit: boolean;
  work_items: { total: number; completed: number };
  e9: TE9ProjectProfile;
};

export type TE9ProfilePayload = Partial<Omit<TE9ProjectProfile, "updated_at">>;
