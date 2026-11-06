/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { getDeadlineState, sortProjects } from "./helpers";
import type { TE9Project } from "./types";

const titleCase = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Same city, different spellings → one card. */
const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  bombay: "Mumbai",
  "new delhi": "Delhi",
  gurgaon: "Gurugram",
  madras: "Chennai",
  calcutta: "Kolkata",
  poona: "Pune",
};

export const cityName = (city: string | null | undefined) => {
  const clean = (city ?? "").trim();
  if (!clean) return "No city set";
  return CITY_ALIASES[clean.toLowerCase()] ?? titleCase(clean);
};

export type TCity = { name: string; projects: TE9Project[]; active: TE9Project[]; overdue: number };

export const groupByCity = (projects: TE9Project[]): TCity[] => {
  const map = new Map<string, TE9Project[]>();
  for (const project of projects) {
    const name = cityName(project.e9.city);
    map.set(name, [...(map.get(name) ?? []), project]);
  }
  return (
    [...map.entries()]
      .map(([name, list]) => {
        const active = list.filter((project) => project.e9.status !== "completed");
        return {
          name,
          projects: list,
          active: sortProjects(active, "deadline"),
          overdue: active.filter((project) => getDeadlineState(project) === "overdue").length,
        };
      })
      .filter((city) => city.active.length > 0)
      // oxlint-disable-next-line unicorn/no-array-sort -- sorting a fresh array
      .sort((a, b) => b.active.length - a.active.length || a.name.localeCompare(b.name))
  );
};
