/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * "Look ahead" on the Dashboard: turn the dial (React Bits CometDial) to choose how many days
 * ahead to look, and the list shows the open sites whose handover falls inside that window.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useAppRouter } from "@/hooks/use-app-router";
import { daysUntil, isClosed } from "./helpers";
import type { TE9Project } from "./types";
import { E9DeadlineText, E9CodeTile, E9Panel } from "./ui";
import AnimatedList from "./vendor/animated-list";
import CometDial from "./vendor/comet-dial";

const KEY = "e9-lookahead-days";
const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const SHOWN = 6;

/** The list's colours come from the E9 theme, so it follows light and dark on its own. */
const E9_LIST_LOOK = {
  "--al-tile": "var(--e9-paper)",
  "--al-tile-edge": "var(--e9-grid)",
  "--al-tile-highlight": "transparent",
  "--al-tile-shadow": "none",
  "--al-well": "var(--e9-hover)",
  "--al-ink": "var(--e9-ink)",
  "--al-muted": "var(--e9-ink-soft)",
  "--al-thumb": "var(--e9-grid)",
  "--al-hover": "none",
  "--al-press": "brightness(0.96)",
  "--al-active": "none",
} as CSSProperties;

export function E9LookAhead({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  const router = useAppRouter();
  const [days, setDays] = useState(DEFAULT_DAYS);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(KEY));
      if (saved >= 1 && saved <= MAX_DAYS) setDays(saved);
    } catch {
      // storage blocked: the dial starts at its default
    }
  }, []);
  const remember = (value: number) => {
    try {
      window.localStorage.setItem(KEY, String(value));
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  };

  const due = useMemo(
    () =>
      projects
        .map((project) => ({ project, left: daysUntil(project.e9.deadline) }))
        .filter(
          (entry): entry is { project: TE9Project; left: number } =>
            entry.left !== null && entry.left >= 0 && entry.left <= days && !isClosed(entry.project.e9.status)
        )
        // oxlint-disable-next-line unicorn/no-array-sort -- sorting a filtered copy
        .sort((a, b) => a.left - b.left),
    [projects, days]
  );

  return (
    <E9Panel title="Look ahead">
      <div className="flex flex-col items-center gap-6 px-5 py-6 sm:flex-row sm:items-center">
        <div className="shrink-0 text-primary">
          <CometDial
            defaultValue={days}
            min={1}
            max={MAX_DAYS}
            step={1}
            unit="d"
            label="Look ahead, in days"
            accent="#DA1E26"
            ink="currentColor"
            size={200}
            thickness={4}
            onChange={setDays}
            onChangeEnd={remember}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-body-sm-regular text-secondary">
            <span className="e9-display text-[28px] text-primary">{due.length}</span>{" "}
            {due.length === 1 ? "site is" : "sites are"} due within the next {days} {days === 1 ? "day" : "days"}. Turn
            the dial to look further ahead.
          </p>
          {due.length > 0 && (
            // rows slide in as the dial changes; arrow keys and Enter work too, a click opens the project
            <AnimatedList
              items={due.slice(0, SHOWN).map(({ project }) => project)}
              frame={false}
              width="100%"
              maxHeight={340}
              gap={6}
              radius={10}
              animation="pop"
              stagger={0.04}
              showGradients={false}
              accentColor="var(--brand-default)"
              style={E9_LIST_LOOK}
              onItemSelect={(project) => router.push(`/${workspaceSlug}/e9/projects/${project.id}`)}
              renderItem={(project) => (
                <>
                  <E9CodeTile code={project.identifier} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-body-sm-medium text-primary">{project.name}</span>
                  <E9DeadlineText project={project} />
                </>
              )}
            />
          )}
          {due.length > SHOWN && (
            <Link
              href={`/${workspaceSlug}/e9/projects?sort=deadline`}
              className="text-body-xs-semibold text-accent-primary hover:underline"
            >
              + {due.length - SHOWN} more, see all
            </Link>
          )}
        </div>
      </div>
    </E9Panel>
  );
}
