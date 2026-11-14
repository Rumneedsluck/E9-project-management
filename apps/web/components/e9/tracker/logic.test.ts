/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { TE9ScopeItem } from "./logic";
import {
  counted,
  floorProgress,
  isFilled,
  isStageOverdue,
  joinDcs,
  parsePastedDate,
  splitDcs,
  scopeProgress,
  splitFloors,
  stageTargetRows,
  trackerKpis,
  workDone,
} from "./logic";
import type { TE9Floor } from "./logic";

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
    production_height_in: null,
    production_width_in: null,
    production_qty: null,
    production_measure: null,
    wastage: null,
    wastage_pct: null,
    is_part: false,
    part_of: null,
    parts_count: 0,
    dc_qty: "",
    dispatched: null,
    balance: null,
    dc_list: [],
    certified_height_in: null,
    certified_width_in: null,
    certified_qty: null,
    certified_measure: null,
    resent: "",
    dispatch_status: "Not Dispatched",
    installation_status: "Not Started",
    installation_date: null,
    installed_by: "",
    client_sign_off: "Pending",
    remarks: "",
    hold_status: "",
    hold_reason: "",
    hold_since: null,
    replaced_by: "",
    bill_now: "",
    bill_when: "",
    sort_order: counter,
    updated_at: "",
    ...values,
  };
};

// Six measured walls like a real 4th-floor tracker, two of them installed
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
  const rows = scopeProgress(all, [
    { key: "wall_graphics", label: "Wall Graphics", unit_mode: "sqft" },
    { key: "frames", label: "Frames", unit_mode: "nos" },
  ]);
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

describe("on hold and cancelled items", () => {
  const rows = [
    item({ description: "normal", area_sqft: "100.00", installation_status: "Installation Done" }),
    item({
      description: "held",
      area_sqft: "100.00",
      installation_status: "Installation Done",
      hold_status: "On Hold",
    }),
    item({ description: "gone", area_sqft: "100.00", hold_status: "Cancelled" }),
  ];

  it("keeps held items in the total with no progress and drops cancelled ones", () => {
    const [row] = scopeProgress(rows, [{ key: "wall_graphics", label: "Wall Graphics", unit_mode: "sqft" }]);
    expect(row.items).toBe(2);
    expect(row.installed).toBe(1);
    expect(row.percentItems).toBe(50);
  });

  it("does not change the items it is given", () => {
    expect(counted(rows)).toHaveLength(2);
    expect(rows[1].installation_status).toBe("Installation Done");
  });
});

describe("items on several floors", () => {
  it("splits a typed list of floors", () => {
    expect(splitFloors("7th Floor, 8th Floor")).toEqual(["7th Floor", "8th Floor"]);
    expect(splitFloors(" Ground ;Terrace,, ")).toEqual(["Ground", "Terrace"]);
    expect(splitFloors("")).toEqual([]);
  });

  it("counts an item on two floors under each of them", () => {
    const rows = [
      item({ description: "long wall", floor_area: "7th Floor, 8th Floor", area_sqft: "50.00" }),
      item({ description: "single", floor_area: "8th Floor", area_sqft: "10.00" }),
    ];
    const byName = Object.fromEntries(floorProgress(rows, []).map((row) => [row.name, row.rows]));
    expect(byName).toEqual({ "7th Floor": 1, "8th Floor": 2 });
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

describe("floor-wise totals", () => {
  const floors: TE9Floor[] = [
    { id: "f1", name: "Reception", sort_order: 1, status: "Handed Over", target_date: null, notes: "" },
    { id: "f2", name: "4th Floor", sort_order: 2, status: "In Progress", target_date: null, notes: "" },
    { id: "f3", name: "17th Floor", sort_order: 3, status: "Not Started", target_date: null, notes: "" },
  ];
  const rows = floorProgress(all, floors);

  it("keeps the floor list order and includes empty floors", () => {
    expect(rows.map((row) => row.name)).toEqual(["Reception", "4th Floor", "17th Floor", "No floor set"]);
    expect(rows[2].items).toBe(0);
    expect(rows[0].floor?.status).toBe("Handed Over");
  });

  it("adds up sq ft and Nos per floor", () => {
    const fourth = rows.find((row) => row.name === "4th Floor")!;
    expect(fourth.items).toBe(6);
    expect(fourth.area).toBe(1243.57);
    expect(fourth.percentItems).toBe(33);
    const unassigned = rows.find((row) => row.name === "No floor set")!;
    expect(unassigned.nos).toBe(10); // the frames have no floor typed (description only)
  });
});

describe("pasting dates from Excel", () => {
  it("reads day-first Indian dates and ISO dates", () => {
    expect(parsePastedDate("12/11/2026")).toBe("2026-11-12");
    expect(parsePastedDate("5-1-26")).toBe("2026-01-05");
    expect(parsePastedDate("2026-11-12")).toBe("2026-11-12");
    expect(parsePastedDate("12 Nov 2026")).toBe("2026-11-12");
    expect(parsePastedDate("31/02/2026")).toBeNull();
    expect(parsePastedDate("soon")).toBeNull();
  });
});

describe("DCs typed in one cell", () => {
  it("splits 3500=190, 3501=60 into the two stored lists and back", () => {
    expect(splitDcs("3500=190, 3501=60")).toEqual({ dc_nos: "3500, 3501", dc_qty: "190, 60" });
    expect(splitDcs("3500 : 190 sq ft; 3501")).toEqual({ dc_nos: "3500, 3501", dc_qty: "190, -" });
    expect(splitDcs("3500")).toEqual({ dc_nos: "3500", dc_qty: "" });
    expect(splitDcs("")).toEqual({ dc_nos: "", dc_qty: "" });
    expect(joinDcs("3500, 3501", "190, 60")).toBe("3500=190, 3501=60");
    expect(joinDcs("3500, 3501", "190, -")).toBe("3500=190, 3501");
    expect(joinDcs("3500", "")).toBe("3500");
  });
});

describe("whole-project work done", () => {
  it("counts installed ITEMS, not square feet", () => {
    const small = item({
      id: "s",
      scope: "wall_graphics",
      unit: "sqft",
      area_sqft: "10",
      description: "Small wall",
      installation_status: "Installation Done",
    });
    const big = item({ id: "b", scope: "wall_graphics", unit: "sqft", area_sqft: "990", description: "Big wall" });
    const done = workDone([small, big]);
    expect(done.percent).toBe(50); // 1 of 2 items, although the installed wall is only 1% of the area
    expect(done.sqftDone).toBe(10);
  });
  it("is 0 for an empty project", () => {
    expect(workDone([]).percent).toBe(0);
  });
  it("does not count part rows: a wall made of pieces is one item", () => {
    const wall = item({ id: "w", scope: "wall_graphics", unit: "sqft", description: "Wall 05", area_sqft: "113.75" });
    const piece = item({ id: "p", scope: "wall_graphics", unit: "sqft", description: "Wall 05 piece", is_part: true });
    const done = workDone([wall, piece]);
    expect(done.rows).toBe(1);
    expect(counted([wall, piece]).map((row) => row.id)).toEqual(["w"]);
    expect(
      scopeProgress([wall, piece], [{ key: "wall_graphics", label: "Wall Graphics", unit_mode: "sqft" }])[0].items
    ).toBe(1);
  });
});

describe("floors that differ only by capitals", () => {
  it("count as one floor", () => {
    const a = item({ id: "a", scope: "wall_graphics", floor_area: "7th Floor", description: "Wall A" });
    const b = item({ id: "b", scope: "wall_graphics", floor_area: "7th floor", description: "Wall B" });
    const rows = floorProgress([a, b], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("7th Floor");
    expect(rows[0].rows).toBe(2);
  });
});
