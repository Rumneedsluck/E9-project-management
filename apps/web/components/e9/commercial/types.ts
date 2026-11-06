/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Quantities and money come from the server as text with 2 decimals ("105.00"). */
export type TE9Num = string;

export type TE9BoqStatus = "ok" | "pending" | "excess";
export type TE9AmendmentStatus = "requested" | "confirmed" | "rejected";
export type TE9BoqUnit = "sqft" | "nos";

export type TE9BoqLine = {
  id: string;
  po: string;
  po_label: string;
  amendment: string | null;
  amendment_status: TE9AmendmentStatus | null;
  line_no: string;
  scope: string;
  description: string;
  unit: TE9BoqUnit;
  qty: TE9Num;
  amended_qty: TE9Num | null;
  amended_note: string;
  is_amended: boolean;
  rate: TE9Num | null;
  remarks: string;
  confirmed_change: TE9Num;
  pending: TE9Num;
  allowed: TE9Num;
  on_tracker: TE9Num;
  produced: TE9Num;
  installed: TE9Num;
  extra: TE9Num;
  unapproved_extra: TE9Num;
  status: TE9BoqStatus;
  internal_reprints: TE9Num;
  client_reprints: TE9Num;
  billable_now: TE9Num;
  max_billable: TE9Num;
  certified: TE9Num;
  item_ids: string[];
};

export type TE9AmendmentChange = { id: string; boq_line: string; line_no: string; qty_change: TE9Num };

export type TE9Amendment = {
  id: string;
  reference: string;
  requested_on: string | null;
  confirmed_on: string | null;
  status: TE9AmendmentStatus;
  mail_link: string;
  notes: string;
  changes: TE9AmendmentChange[];
  new_lines: string[];
};

export type TE9PO = {
  id: string;
  kind: "original" | "new";
  number: string;
  title: string;
  label: string;
  po_date: string | null;
  link: string;
  notes: string;
  amendments: TE9Amendment[];
};

export type TE9Reprint = {
  id: string;
  boq_line: string | null;
  line_no: string;
  item: string | null;
  item_code: string;
  scope: string;
  scope_label: string;
  item_description: string;
  original_height_in: TE9Num | null;
  original_width_in: TE9Num | null;
  size_used: string;
  unit: TE9BoqUnit;
  kind: "reprint" | "extra";
  cause: "e9" | "client" | "site";
  qty: TE9Num;
  reason: string;
  description: string;
  pieces: TE9Num | null;
  reprint_height_in: TE9Num | null;
  reprint_width_in: TE9Num | null;
  jc_no: string;
  vendor: string;
  approved: "" | "Yes" | "Pending" | "No";
  remarks: string;
  reprint_date: string | null;
  created_at: string;
};

export type TE9Unlinked = {
  boq_no: string;
  missing: boolean;
  count: number;
  items: { id: string; code: string; scope: string }[];
};

export type TE9BillSummary = {
  id: string;
  po: string;
  po_label: string;
  title: string;
  certification_label?: string;
  stage: number;
  stage_text: string;
  amount?: TE9Num;
};

export type TE9Boq = {
  can_edit: boolean;
  can_update: boolean;
  pos: TE9PO[];
  lines: TE9BoqLine[];
  reprints: TE9Reprint[];
  reprint_reasons: string[];
  unlinked: TE9Unlinked[];
  bills: TE9BillSummary[];
  totals: { excess_lines: number; pending_lines: number; unlinked_items: number };
};

export type TE9LogItem = {
  id: string;
  code: string;
  scope: string;
  scope_label: string;
  description: string;
  floor: string;
  unit: TE9BoqUnit;
  qty: TE9Num | null;
  area: TE9Num | null;
  /** DC log only: quantity sent on this DC (null = not typed) and whether the item went in parts */
  sent?: TE9Num | null;
  partial?: boolean;
};

export type TE9JobCard = {
  number: string;
  items: TE9LogItem[];
  count: number;
  saved: boolean;
  jc_date: string;
  vendor: string;
  expected_date: string;
  received: "Pending" | "Partly" | "Yes" | "No";
  received_date: string;
  eproof_sent_on: string;
  notes: string;
};

export type TE9Challan = {
  number: string;
  items: TE9LogItem[];
  count: number;
  saved: boolean;
  sqft: TE9Num;
  nos: TE9Num;
  unknown_qty: number;
  client_signatory: string;
  status: "Dispatched" | "Delivered at Site" | "Returned";
  dc_date: string;
  dispatched_from: string;
  sent_by: string;
  vehicle: string;
  invoice_no: string;
  invoice_date: string;
  e9_signoff: "Pending" | "Signed";
  client_signoff: "Pending" | "Signed" | "Returned";
  notes: string;
};

export type TE9Logs = { can_update: boolean; job_cards: TE9JobCard[]; challans: TE9Challan[] };

export type TE9BillLine = {
  id: string;
  boq_line: string;
  line_no: string;
  certified_qty: TE9Num;
  rate: TE9Num | null;
  unit: TE9BoqUnit;
  description: string;
};

export type TE9Bill = {
  id: string;
  po: string;
  po_label: string;
  title: string;
  notes: string;
  stage: number;
  stage_text: string;
  created_at: string;
  lines: TE9BillLine[];
  certified_amount: TE9Num;
  cert_number: string;
  cert_signed_on: string | null;
  cert_to_accounts_on: string | null;
  pi_number: string;
  pi_date: string | null;
  pi_amount: TE9Num | null;
  pi_signed_on: string | null;
  pi_submitted_on: string | null;
  wcc_number: string;
  wcc_date: string | null;
  wcc_acknowledged_on: string | null;
};

export type TE9Bills = {
  can_edit: boolean;
  billing_open: boolean;
  certifications: { id: string; label: string; done_on: string | null }[];
  pos: { id: string; label: string }[];
  bills: TE9Bill[];
  lines: TE9BoqLine[];
};

export type TE9SummaryProject = {
  id: string;
  name: string;
  identifier: string;
  cert_state: "in_progress" | "jmc_pending" | "part_certified" | "certified";
  bills: TE9BillSummary[];
  lines: number;
  billable_now: TE9Num;
  certified: TE9Num;
  billable_amount: TE9Num;
};

export type TE9Summary = {
  projects: TE9SummaryProject[];
  waiting_for_jmc: { id: string; name: string; identifier: string }[];
};

export type TE9Readiness = { rows: number; certified: number; installed: number };

export type TE9Certification = {
  id: string;
  label: string;
  floor: string;
  scope: string;
  is_whole: boolean;
  jmc_number: string;
  jmc_date: string | null;
  client_signatory: string;
  done_on: string | null;
  link: string;
  notes: string;
  files: number;
  bills: number;
  readiness: TE9Readiness;
};

export type TE9Certifications = {
  can_edit: boolean;
  state: "in_progress" | "jmc_pending" | "part_certified" | "certified";
  state_text: string;
  billing_open: boolean;
  allow_part_billing: boolean;
  floors: string[];
  scopes: { key: string; label: string }[];
  overall: TE9Readiness;
  certifications: TE9Certification[];
};

export type TE9Announcement = {
  id: string;
  title: string;
  body: string;
  important: boolean;
  ends_on: string | null;
  created_at: string;
  author: string;
};

export type TE9Announcements = { can_post: boolean; announcements: TE9Announcement[] };

export type TE9Snag = {
  id: string;
  item: string | null;
  item_code: string;
  scope: string;
  scope_label: string;
  item_description: string;
  floor: string;
  days_open: number | null;
  overdue: boolean;
  raised_on: string | null;
  reason: string;
  details: string;
  priority: string;
  raised_by: string;
  assigned_to: string;
  target_date: string | null;
  status: "Open" | "In Progress" | "Fixed - Awaiting Client" | "Closed";
  closed_on: string | null;
  remarks: string;
  created_at: string;
};

export type TE9Snags = {
  can_update: boolean;
  snags: TE9Snag[];
  reasons: string[];
  priorities: string[];
  statuses: TE9Snag["status"][];
  open: number;
};
