/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TE9ProjectPriority, TE9ProjectStatus } from "./types";

// Same characters Plane refuses in project names (see Project.FORBIDDEN_IDENTIFIER_CHARS_PATTERN in the API)
const FORBIDDEN_NAME_CHARS = /[&+,:;$^}{*=?@#|'<>.()%!-]/;

/** Everything the create/edit project form collects. */
export type TE9FormValues = {
  name: string;
  identifier: string;
  description: string;
  client_name: string;
  site_address: string;
  city: string;
  work_order_number: string;
  status: TE9ProjectStatus;
  priority: TE9ProjectPriority;
  start_date: string;
  deadline: string;
  client_contact: string;
  site_contact: string;
  work_order_date: string;
  site_timings: string;
  target_site_audit: string;
  target_pre_press: string;
  target_material: string;
  target_delivered: string;
  target_installation: string;
  target_sign_off: string;
  project_lead: string;
  team: string[];
};

export type TE9FormErrors = Partial<Record<keyof TE9FormValues, string>>;

/** Check the form before saving; returns a message per field that needs fixing. */
export const validateE9Form = (values: TE9FormValues): TE9FormErrors => {
  const errors: TE9FormErrors = {};
  if (!values.name.trim()) errors.name = "Give the project a name.";
  else if (FORBIDDEN_NAME_CHARS.test(values.name))
    errors.name = "Use letters, numbers and spaces only (no symbols such as & - . ( ) ).";
  else if (values.name.length > 255) errors.name = "Keep the name under 255 characters.";
  if (!values.identifier) errors.identifier = "Add a short project code, e.g. NWT.";
  else if (values.identifier.length > 10) errors.identifier = "The code can be at most 10 characters.";
  if (values.start_date && values.deadline && values.deadline < values.start_date)
    errors.deadline = "The deadline cannot be before the start date.";
  return errors;
};
