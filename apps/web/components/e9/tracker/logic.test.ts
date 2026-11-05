/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { TE9ScopeItem } from "./logic";
import { isFilled, isStageOverdue, scopeProgress, stageTargetRows, trackerKpis } from "./logic";

const TODAY = new Date(2026, 10, 5); // 5 Nov 2026

let counter = 0;
const item = (values: Partial<TE9ScopeItem>): TE9ScopeItem => {
  counter += 1;
  return {
    id: `id-${counter}`,
    scope: "wall_graphics",
    item_number: counter,
    item_code: `W${counter}`,
    unit: "sqft",
    area_sqft: null,
    current_stage: "Not Started",
    boq_item_no: "",
    floor_area: "",
    floor_plan_ref: "",
    description: "",
    site_audit_status: "Not Started",
    height_in: null,
    width_in: null,
    qty: null,
    unit_override: "",
    photo_link: "",
    site_issue: "No issues",
    issue_resolved: "N/A",
    pre_press: "Not Started",
    jc_no: "",
    production_status: "Not Started",
    material_status: "",
    quality_check: "Pending",
    qc_done_by: "",
    dc_nos: "",
    dispatch_status: "Not Dispatched",
    installation_status: "Not Started",
    installation_date: null,
    installed_by: "",
    client_sign_off: "Pending",
    remarks: "",
    sort_order: counter,
    updated_at: "",
    ...values,
  };
};

// Six measured walls like the Example Client tracker, two of them installed
const walls = [
  item({ floor_area: "4th Floor", area_sqft: "92.23", site_audit_status: "Measured" }),
  item({ floor_area: "4th Floor", area_sqft: "376.17", site_audit_status: "Measured" }),
  item({ floor_area: "4th Floor", area_sqft: "226.17", site_audit_status: "Measured" }),
  item({ floor_area: "4th Floor", area_sqft: "108.17", site_audit_status: "Measured" }),
  item({
    floor_area: "4th Floor",
    area_sqft: "140.83",
    site_audit_status: "Measured",
    installation_status: "Installation Done",
  }),
  item({
    floor_area: "4th Floor",
    area_sqft: "300.00",
    site_audit_status: "Measured",
    installation_status: "Installation Done",
    site_issue: "Needs oil primer",
    issue_resolved: "No",
  }),
];
const frames = [
  item({ scope: "frames", unit: "nos", description: "A3 frames", qty: "6", installation_status: "Installation Done" }),
  item({ scope: "frames", unit: "nos", description: "A2 frames", qty: "4" }),
];
const emptyRows = [item({}), item({ scope: "frames", unit: "nos" })];
const all = [...walls, ...frames, ...emptyRows];

describe("which rows count", () => {
  it("ignores rows nothing has been typed into", () => {
    expect(isFilled(emptyRows[0])).toBe(false);
    expect(isFilled(walls[0])).toBe(true);
  });
});

describe("progress by scope", () => {
  const rows = scopeProgress(all);
  const wallRow = rows.find((row) => row.scope === "wall_graphics")!;
  const frameRow = rows.find((row) => row.scope === "frames")!;

  it("counts walls by item and sq ft", () => {
    expect(wallRow.items).toBe(6);
    expect(wallRow.area).toBe(1243.57);
    expect(wallRow.installed).toBe(2);
    expect(wallRow.percentItems).toBe(33);
    expect(wallRow.percentArea).toBe(35); // 440.83 of 1243.57
  });

  it("counts frames by quantity (Nos), not rows", () => {
    expect(frameRow.items).toBe(10);
    expect(frameRow.installed).toBe(6);
    expect(frameRow.percentItems).toBe(60);
    expect(frameRow.percentArea).toBeNull();
  });
});

describe("dashboard tiles", () => {
  it("adds up items, area, % done, days left and open issues", () => {
    const kpis = trackerKpis(all, "2026-11-20", TODAY);
    expect(kpis.totalItems).toBe(16); // 6 walls + 10 frames
    expect(kpis.totalArea).toBe(1243.57);
    expect(kpis.percentDone).toBe(50); // 2 walls + 6 frames of 16
    expect(kpis.daysToDeadline).toBe(15);
    expect(kpis.openSiteIssues).toBe(1);
  });
});

describe("stage targets and overdue", () => {
  it("flags pending items once a target date has passed", () => {
    const rows = stageTargetRows(all, { target_site_audit: "2026-11-01", target_installation: "2026-11-01" }, TODAY);
    const audit = rows.find((row) => row.key === "site_audit")!;
    expect(audit.done).toBe(6);
    expect(audit.pending).toBe(10); // the frames were never "Measured"
    expect(audit.status).toBe("overdue");
    const install = rows.find((row) => row.key === "installation")!;
    expect(install.done).toBe(8);
    expect(install.overdue).toBe(8);
    expect(rows.find((row) => row.key === "pre_press")!.status).toBe("no_target");
  });

  it("highlights a single cell only when that item is late", () => {
    const targets = { target_installation: "2026-11-01" };
    expect(isStageOverdue(walls[0], "installation", targets, TODAY)).toBe(true);
    expect(isStageOverdue(walls[4], "installation", targets, TODAY)).toBe(false);
    expect(isStageOverdue(emptyRows[0], "installation", targets, TODAY)).toBe(false);
    expect(isStageOverdue(walls[0], "installation", { target_installation: "2026-12-01" }, TODAY)).toBe(false);
  });
});
