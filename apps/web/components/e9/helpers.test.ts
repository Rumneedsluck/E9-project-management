/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { validateE9Form } from "./form-validation";
import type { TE9FormValues } from "./form-validation";
import {
  DEFAULT_E9_FILTERS,
  daysUntil,
  describeDeadline,
  filterProjects,
  getAttentionProjects,
  getDeadlineState,
  getInitials,
  getProgressPercent,
  sortProjects,
  suggestIdentifier,
  summarizeProjects,
} from "./helpers";
import type { TE9Project, TE9ProjectProfile } from "./types";

// Fixed "today" so the tests never depend on the real date
const TODAY = new Date(2026, 10, 4); // 4 Nov 2026

const makeProject = (overrides: Partial<TE9Project> = {}, e9: Partial<TE9ProjectProfile> = {}): TE9Project => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  name: "Sample Site",
  identifier: "SMP",
  description: "",
  logo_props: { in_use: "emoji", emoji: { value: "127970" } },
  project_lead: null,
  member_ids: [],
  created_at: "2026-10-01T10:00:00Z",
  can_edit: true,
  work_items: { total: 0, completed: 0 },
  cert_state: "in_progress",
  billing_open: false,
  allow_part_billing: false,
  ...overrides,
  e9: {
    client_name: "",
    site_address: "",
    city: "",
    work_order_number: "",
    status: "awarded",
    priority: "medium",
    start_date: null,
    deadline: null,
    client_contact: "",
    site_contact: "",
    work_order_date: null,
    site_timings: "",
    target_site_audit: null,
    target_pre_press: null,
    target_material: null,
    target_delivered: null,
    target_installation: null,
    target_sign_off: null,
    hidden_columns: [],
    updated_at: null,
    ...e9,
  },
});

describe("deadlines", () => {
  it("counts whole days from today", () => {
    expect(daysUntil("2026-11-04", TODAY)).toBe(0);
    expect(daysUntil("2026-11-11", TODAY)).toBe(7);
    expect(daysUntil("2026-11-01", TODAY)).toBe(-3);
    expect(daysUntil(null, TODAY)).toBeNull();
  });

  it("classifies overdue, due soon and on track", () => {
    expect(getDeadlineState(makeProject({}, { deadline: "2026-11-01" }), TODAY)).toBe("overdue");
    expect(getDeadlineState(makeProject({}, { deadline: "2026-11-11" }), TODAY)).toBe("due_soon");
    expect(getDeadlineState(makeProject({}, { deadline: "2026-11-12" }), TODAY)).toBe("on_track");
    expect(getDeadlineState(makeProject(), TODAY)).toBe("none");
  });

  it("never marks a completed project as overdue", () => {
    const done = makeProject({}, { status: "completed", deadline: "2026-10-01" });
    expect(getDeadlineState(done, TODAY)).toBe("done");
    expect(describeDeadline(done, TODAY)).toBe("Completed");
  });

  it("describes deadlines in plain words", () => {
    expect(describeDeadline(makeProject({}, { deadline: "2026-11-03" }), TODAY)).toBe("1 day overdue");
    expect(describeDeadline(makeProject({}, { deadline: "2026-11-01" }), TODAY)).toBe("3 days overdue");
    expect(describeDeadline(makeProject({}, { deadline: "2026-11-04" }), TODAY)).toBe("Due today");
    expect(describeDeadline(makeProject({}, { deadline: "2026-11-05" }), TODAY)).toBe("Due tomorrow");
    expect(describeDeadline(makeProject({}, { deadline: "2026-11-14" }), TODAY)).toBe("Due in 10 days");
    expect(describeDeadline(makeProject(), TODAY)).toBe("No deadline");
  });
});

describe("progress", () => {
  it("uses work items when there are any", () => {
    expect(getProgressPercent(makeProject({ work_items: { total: 6, completed: 4 } }))).toBe(67);
  });

  it("falls back to the stage when there are no work items", () => {
    expect(getProgressPercent(makeProject({}, { status: "awarded" }))).toBe(0);
    expect(getProgressPercent(makeProject({}, { status: "installation" }))).toBe(71);
    expect(getProgressPercent(makeProject({}, { status: "on_hold" }))).toBe(0);
  });

  it("is always 100% once completed", () => {
    expect(getProgressPercent(makeProject({ work_items: { total: 6, completed: 1 } }, { status: "completed" }))).toBe(
      100
    );
  });
});

describe("dashboard summary", () => {
  const projects = [
    makeProject({}, { status: "installation", deadline: "2026-11-01" }), // overdue
    makeProject({}, { status: "production", deadline: "2026-11-08" }), // due soon
    makeProject({}, { status: "on_hold", deadline: "2026-12-30" }),
    makeProject({}, { status: "completed", deadline: "2026-10-10" }),
  ];

  it("counts active, overdue, due soon, on hold and completed", () => {
    const summary = summarizeProjects(projects, TODAY);
    expect(summary).toMatchObject({ total: 4, active: 3, overdue: 1, dueSoon: 1, onHold: 1, completed: 1 });
    expect(summary.byStatus.installation).toBe(1);
    expect(summary.byStatus.site_audit).toBe(0);
  });

  it("lists the most urgent projects first", () => {
    const attention = getAttentionProjects(projects, TODAY);
    expect(attention.map((project) => project.e9.deadline)).toEqual(["2026-11-01", "2026-11-08"]);
  });
});

describe("filtering and sorting", () => {
  const a = makeProject(
    { name: "Bluefin Bank", created_at: "2026-10-03" },
    { priority: "low", deadline: "2026-12-01" }
  );
  const b = makeProject(
    { name: "Aster Health", created_at: "2026-10-05" },
    { priority: "high", city: "Pune", deadline: "2026-11-20" }
  );
  const c = makeProject({ name: "Cedar Office", created_at: "2026-10-01" }, { status: "completed", deadline: null });

  it("hides completed projects by default", () => {
    expect(filterProjects([a, b, c], DEFAULT_E9_FILTERS)).toEqual([a, b]);
    expect(filterProjects([a, b, c], { ...DEFAULT_E9_FILTERS, status: "all" })).toHaveLength(3);
    expect(filterProjects([a, b, c], { ...DEFAULT_E9_FILTERS, status: "completed" })).toEqual([c]);
  });

  it("searches name, client and city, ignoring case", () => {
    expect(filterProjects([a, b, c], { ...DEFAULT_E9_FILTERS, search: "pune" })).toEqual([b]);
    expect(filterProjects([a, b, c], { ...DEFAULT_E9_FILTERS, search: "BLUE" })).toEqual([a]);
  });

  it("filters by priority", () => {
    expect(filterProjects([a, b], { ...DEFAULT_E9_FILTERS, priority: "high" })).toEqual([b]);
  });

  it("sorts by deadline with undated projects last", () => {
    expect(sortProjects([c, a, b], "deadline")).toEqual([b, a, c]);
    expect(sortProjects([a, b], "priority")).toEqual([b, a]);
    expect(sortProjects([a, b, c], "name")).toEqual([b, a, c]);
    expect(sortProjects([a, b, c], "recent")).toEqual([b, a, c]);
  });

  it("does not change the original list", () => {
    const list = [c, a, b];
    sortProjects(list, "name");
    expect(list).toEqual([c, a, b]);
  });
});

describe("small helpers", () => {
  it("suggests a project code from the name", () => {
    expect(suggestIdentifier("Bluefin Bank Branch Rollout")).toBe("BBBR");
    expect(suggestIdentifier("Lumen")).toBe("LUMEN");
    expect(suggestIdentifier("  ")).toBe("");
  });

  it("builds initials for avatars", () => {
    expect(getInitials("Kavya", "Rao")).toBe("KR");
    expect(getInitials("", "", "imran")).toBe("I");
    expect(getInitials()).toBe("?");
  });
});

describe("project form validation", () => {
  const valid: TE9FormValues = {
    name: "Zenith Mall Phase Two",
    identifier: "ZMPT",
    description: "",
    client_name: "",
    site_address: "",
    city: "",
    work_order_number: "",
    status: "awarded",
    priority: "medium",
    start_date: "2026-11-05",
    deadline: "2026-12-20",
    client_contact: "",
    site_contact: "",
    work_order_date: "",
    site_timings: "",
    target_site_audit: "",
    target_pre_press: "",
    target_material: "",
    target_delivered: "",
    target_installation: "",
    target_sign_off: "",
    project_lead: "",
    team: [],
  };

  it("accepts a complete form", () => {
    expect(validateE9Form(valid)).toEqual({});
  });

  it("requires a name and code", () => {
    expect(validateE9Form({ ...valid, name: " ", identifier: "" })).toMatchObject({
      name: expect.any(String),
      identifier: expect.any(String),
    });
  });

  it("rejects symbols Plane does not allow in names", () => {
    expect(validateE9Form({ ...valid, name: "Zenith Mall - Phase 2" }).name).toBeDefined();
    expect(validateE9Form({ ...valid, name: "Cedar & Co" }).name).toBeDefined();
  });

  it("rejects a deadline before the start date", () => {
    expect(validateE9Form({ ...valid, deadline: "2026-11-01" }).deadline).toBeDefined();
  });
});
