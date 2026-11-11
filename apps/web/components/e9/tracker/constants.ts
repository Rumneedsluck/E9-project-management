/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * The E9 site-tracker rules, taken from the E9_TRACKER_A23 Excel template.
 * Dropdown words match the template's "Lists" sheet exactly.
 * Keep in sync with apps/api/plane/e9/tracker.py.
 */

export type TE9ScopeKey =
  | "wall_graphics"
  | "glass_film"
  | "internal_signages"
  | "external_signages"
  | "3d_items"
  | "frames"
  | "hand_paintings"
  | "non_tender"
  | "others";

type TUnitRule = "sqft" | "nos" | "either";

export const E9_SCOPES: { key: TE9ScopeKey; label: string; prefix: string; unit: TUnitRule }[] = [
  { key: "wall_graphics", label: "Wall Graphics", prefix: "W", unit: "sqft" },
  { key: "glass_film", label: "Glass Film", prefix: "GF", unit: "sqft" },
  { key: "internal_signages", label: "Internal Signages", prefix: "IS", unit: "nos" },
  { key: "external_signages", label: "External Signages", prefix: "ES", unit: "nos" },
  { key: "3d_items", label: "3D Items", prefix: "3D", unit: "nos" },
  { key: "frames", label: "Frames", prefix: "FR", unit: "nos" },
  { key: "hand_paintings", label: "Hand Paintings", prefix: "HP", unit: "sqft" },
  { key: "non_tender", label: "Non-Tender Items", prefix: "NT", unit: "either" },
  { key: "others", label: "Others", prefix: "OT", unit: "either" },
];

export const getScope = (key: TE9ScopeKey) => E9_SCOPES.find((scope) => scope.key === key) ?? E9_SCOPES[0];

const COMMON_ISSUES_TAIL = ["Size differs from drawing", "Access / permission needed", "Other"];
const SIGNAGE_ISSUES = [
  "No issues",
  "Surface unprepared",
  "Existing signage / graphics to be removed",
  "Obstruction (switch, pipe, fixture)",
  ...COMMON_ISSUES_TAIL,
];

export const SITE_ISSUES: Record<TE9ScopeKey, string[]> = {
  wall_graphics: [
    "No issues",
    "Needs oil primer",
    "Surface unprepared",
    "Existing graphics to be peeled off",
    "Uneven / damaged wall",
    "Obstruction (switch, pipe, fixture)",
    ...COMMON_ISSUES_TAIL,
  ],
  glass_film: [
    "No issues",
    "Existing film to be peeled off",
    "Glass needs cleaning",
    "Cracked / damaged glass",
    "Obstruction (fixture, blind, furniture)",
    ...COMMON_ISSUES_TAIL,
  ],
  internal_signages: SIGNAGE_ISSUES,
  external_signages: [
    "No issues",
    "Permission / approval needed",
    "Scaffolding / lift required",
    "Power / wiring point not available",
    "Surface unprepared",
    "Existing signage to be removed",
    ...COMMON_ISSUES_TAIL,
  ],
  hand_paintings: [
    "No issues",
    "Surface unprepared",
    "Needs oil primer / base coat",
    "Existing paint / graphics to be removed",
    "Uneven / damaged wall",
    "Obstruction (switch, pipe, fixture)",
    ...COMMON_ISSUES_TAIL,
  ],
  frames: [
    "No issues",
    "Wall not suitable for drilling / fixing",
    "Wall surface uneven",
    "Obstruction (switch, pipe, fixture)",
    ...COMMON_ISSUES_TAIL,
  ],
  "3d_items": SIGNAGE_ISSUES,
  non_tender: SIGNAGE_ISSUES,
  others: SIGNAGE_ISSUES,
};

export const SITE_AUDIT_STATUS = ["Not Started", "Visit Scheduled", "Measured", "Re-measure Needed"];
export const ISSUE_RESOLVED = ["Yes", "No", "N/A"];
export const PRE_PRESS = [
  "Not Started",
  "In Progress",
  "Artwork received but not sent to production",
  "Sent for Production",
];
export const PRODUCTION_STATUS = ["Not Started", "In Production", "Production Done"];
/** Blank until a JC is raised (template rule). */
export const MATERIAL_STATUS = ["", "JC Raised", "Partial Received", "Material Received"];
export const QUALITY_CHECK = ["Pending", "Passed", "Needs Revision"];
export const DISPATCH_STATUS = ["Not Dispatched", "Partially Dispatched", "Dispatched", "Delivered at Site"];
export const INSTALLATION_STATUS = ["Not Started", "In Progress", "Installation Done"];
export const CLIENT_SIGN_OFF = ["Pending", "Signed Off", "Rework Required"];
/** On hold / cancelled / billing (blank = a normal item). */
export const HOLD_STATUS = ["", "On Hold", "Cancelled"];
export const HOLD_REASONS = [
  "Client wants no change - waiting",
  "Artwork changed by client",
  "Whole design changed by client",
  "Item replaced by another scope",
  "Waiting for client approval",
  "Site not ready",
  "PO / payment pending",
  "Cancelled by client",
  "Other",
];
export const BILL_NOW = ["", "Yes", "No"];
/** per item; blank = the scope's setting */
export const BILL_WHEN = ["", "Signed off", "Delivered"];
export const SCOPE_BILL_WHEN = ["Signed off", "Delivered"];

/** Template colour guide: green = done/approved, yellow = under way, blue = sent/in pipeline, grey = not started, orange = issue, red = needs rework. */
export type TStatusTone = "done" | "progress" | "sent" | "idle" | "issue" | "bad";

const TONES: Record<string, TStatusTone> = {
  "Not Started": "idle",
  Pending: "idle",
  "Not Dispatched": "idle",
  "N/A": "idle",
  "No issues": "idle",
  "Visit Scheduled": "sent",
  "Re-measure Needed": "bad",
  Measured: "done",
  "In Progress": "progress",
  "Artwork received but not sent to production": "sent",
  "Sent for Production": "sent",
  "In Production": "progress",
  "Production Done": "done",
  "JC Raised": "sent",
  "Partial Received": "progress",
  "Material Received": "done",
  Passed: "done",
  "Needs Revision": "bad",
  "Partially Dispatched": "progress",
  Dispatched: "sent",
  "Delivered at Site": "done",
  "Installation Done": "done",
  "Signed Off": "done",
  "Rework Required": "bad",
  Yes: "done",
  No: "issue",
};

export const statusTone = (value: string): TStatusTone => TONES[value] ?? (value ? "issue" : "idle");

export const TONE_CLASSES: Record<TStatusTone, string> = {
  done: "bg-success-subtle text-success-primary",
  progress: "bg-warning-subtle text-warning-primary",
  sent: "bg-info-subtle text-info-primary",
  idle: "bg-transparent text-secondary",
  issue: "bg-[#F06A25]/15 text-[#C2410C] dark:text-[#FB923C]",
  bad: "bg-danger-subtle text-danger-primary",
};

/** The six stages of the job, each with its target-date field and "done" rule (as on the template dashboard). */
export type TE9StageKey = "site_audit" | "pre_press" | "material" | "delivered" | "installation" | "sign_off";

export const E9_TRACKER_STAGES: {
  key: TE9StageKey;
  label: string;
  targetField:
    | "target_site_audit"
    | "target_pre_press"
    | "target_material"
    | "target_delivered"
    | "target_installation"
    | "target_sign_off";
  /** Band colour on the sheet header */
  color: string;
}[] = [
  { key: "site_audit", label: "1 · Site audit", targetField: "target_site_audit", color: "#3E7BFA" },
  { key: "pre_press", label: "2 · Pre-press done", targetField: "target_pre_press", color: "#7C5CFC" },
  { key: "material", label: "3 · Material received", targetField: "target_material", color: "#E8A317" },
  { key: "delivered", label: "4 · Delivered to site", targetField: "target_delivered", color: "#F06A25" },
  { key: "installation", label: "5 · Installation", targetField: "target_installation", color: "#14A3A3" },
  { key: "sign_off", label: "6 · Client sign-off", targetField: "target_sign_off", color: "#2EA36B" },
];
