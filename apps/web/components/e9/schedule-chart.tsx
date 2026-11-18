/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * The schedule: every open site as a bar from its start date to its handover date, with a line for today.
 * The pale bar is the time the site has; the solid part is how much of the work is done. A solid part that
 * stops short of the today line is a site that is behind.
 * Each bar wears its stage's colour, and the stage is also named by the icon and the tooltip, so nothing
 * depends on colour alone. The numbers are repeated in a table for screen readers.
 */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { cn, renderFormattedDate } from "@plane/utils";
import { monthTicks, scheduleRows, timePosition } from "./chart-math";
import type { TMonthTick, TScheduleRow } from "./chart-math";
import { E9ChartTable, E9Tip } from "./chart-kit";
import { getStatusMeta } from "./constants";
import { startOfToday } from "./helpers";
import { E9StageTile } from "./icons";
import type { TE9Project } from "./types";
import { E9DeadlineText } from "./ui";

const ROWS_SHOWN = 8;
const GRID = "sm:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)_8.5rem]";

/** The hairlines at each month start, and the red line for today. Drawn in every row so they line up exactly. */
function TrackLines({ ticks, today }: { ticks: TMonthTick[]; today: number }) {
  return (
    <>
      {ticks.map((tick) => (
        <span
          key={tick.key}
          aria-hidden
          className="absolute inset-y-0 w-px bg-[var(--e9-grid)]"
          style={{ left: `${tick.at * 100}%` }}
        />
      ))}
      {today >= 0 && today <= 1 && (
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-[var(--brand-default)]"
          style={{ left: `${today * 100}%` }}
        />
      )}
    </>
  );
}

const describe = (row: TScheduleRow) => {
  const stage = getStatusMeta(row.project.e9.status).label;
  const dates = row.end
    ? `${row.start ? renderFormattedDate(row.start, "dd MMM") : "Start not set"} → ${renderFormattedDate(row.end, "dd MMM yyyy")}`
    : "No handover date";
  return { stage, dates };
};

function Row({
  row,
  index,
  ticks,
  today,
  workspaceSlug,
  active,
  onActive,
}: {
  row: TScheduleRow;
  index: number;
  ticks: TMonthTick[];
  today: number;
  workspaceSlug: string;
  active: boolean;
  onActive: (on: boolean) => void;
}) {
  const { project, box, progress } = row;
  const color = getStatusMeta(project.e9.status).color;
  const { stage, dates } = describe(row);
  return (
    <li>
      <Link
        href={`/${workspaceSlug}/e9/projects/${project.id}`}
        aria-label={`${project.name}: ${stage}, ${dates}, ${progress}% done`}
        onMouseEnter={() => onActive(true)}
        onMouseLeave={() => onActive(false)}
        onFocus={() => onActive(true)}
        onBlur={() => onActive(false)}
        className={cn(
          "group grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-x-4 px-5 transition-colors outline-none hover:bg-layer-1-hover focus-visible:bg-layer-1-hover",
          GRID
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5 py-2.5">
          <E9StageTile status={project.e9.status} size="sm" />
          <span className="truncate text-body-xs-semibold text-primary">{project.name}</span>
        </span>
        <span className="flex items-center justify-end py-2.5 sm:order-3">
          <E9DeadlineText project={project} />
        </span>
        {/* the track: month lines, today line, and the site's bar */}
        <span className="relative col-span-2 h-7 sm:order-2 sm:col-span-1 sm:h-auto sm:min-h-10">
          <TrackLines ticks={ticks} today={today} />
          {box ? (
            <span
              className="absolute top-1/2 h-3.5 -translate-y-1/2"
              style={{ left: `${box.left * 100}%`, width: `${box.width * 100}%` }}
            >
              <span
                className={cn(
                  "e9-seg-in e9-mark relative block h-full overflow-hidden",
                  box.clippedStart ? "rounded-l-none" : "rounded-l-[4px]",
                  box.clippedEnd ? "rounded-r-none" : "rounded-r-[4px]"
                )}
                data-on={active}
                style={
                  {
                    backgroundColor: `color-mix(in oklab, ${color} 26%, transparent)`,
                    "--i": index,
                  } as CSSProperties
                }
              >
                <span className="block h-full" style={{ width: `${progress}%`, backgroundColor: color }} />
              </span>
              {active && (
                <E9Tip at={0.5} bottom="calc(100% + 6px)">
                  <span className="text-body-xs-semibold text-primary">{progress}% done</span>
                  <span>
                    {stage} · {dates}
                  </span>
                </E9Tip>
              )}
            </span>
          ) : (
            <span className="absolute inset-y-0 left-2 flex items-center text-body-2xs-regular text-placeholder">
              {row.end ? "Outside the dates shown" : "No handover date yet"}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export function E9ScheduleChart({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  const [active, setActive] = useState<string | null>(null);
  const { rows, domain, hidden, ticks, today } = useMemo(() => {
    const now = startOfToday();
    const result = scheduleRows(projects, now, ROWS_SHOWN);
    return { ...result, ticks: monthTicks(result.domain), today: timePosition(now, result.domain) };
  }, [projects]);

  if (rows.length === 0)
    return <p className="px-5 py-8 text-center text-body-sm-regular text-tertiary">No open sites to schedule.</p>;

  return (
    <figure className="flex flex-col pb-2" data-chart-active={active !== null}>
      {/* the axis: month names, and where today is */}
      <div className={cn("hidden gap-x-4 border-b border-subtle px-5 sm:grid", GRID)} aria-hidden>
        <span />
        <span className="relative h-7">
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className="absolute bottom-1 pl-1.5 text-body-2xs-medium text-tertiary"
              style={{ left: `${tick.at * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
          {today >= 0 && today <= 1 && (
            <span
              className="absolute bottom-1 -translate-x-1/2 rounded-sm bg-[var(--brand-default)] px-1.5 text-[10px] leading-4 font-semibold text-white"
              style={{ left: `${today * 100}%` }}
            >
              Today
            </span>
          )}
        </span>
        <span className="flex items-end justify-end pb-1 text-body-2xs-medium text-tertiary">Handover</span>
      </div>

      <ul className="flex flex-col">
        {rows.map((row, index) => (
          <Row
            key={row.project.id}
            row={row}
            index={index}
            ticks={ticks}
            today={today}
            workspaceSlug={workspaceSlug}
            active={active === row.project.id}
            onActive={(on) => setActive(on ? row.project.id : null)}
          />
        ))}
      </ul>

      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 pt-3 text-body-2xs-regular text-tertiary">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-5 rounded-[2px] bg-[var(--e9-ink)] opacity-25" />
          Time from start to handover
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-5 rounded-[2px] bg-[var(--e9-ink)]" />
          Work done so far
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-px bg-[var(--brand-default)]" />
          Today
        </span>
        {hidden > 0 && (
          <Link
            href={`/${workspaceSlug}/e9/projects?sort=deadline`}
            className="ml-auto text-body-xs-semibold text-accent-primary hover:underline"
          >
            + {hidden} more {hidden === 1 ? "site" : "sites"}
          </Link>
        )}
      </figcaption>

      <E9ChartTable
        caption={`Schedule of open sites, ${renderFormattedDate(domain.from, "dd MMM yyyy")} to ${renderFormattedDate(domain.to, "dd MMM yyyy")}`}
        head={["Site", "Stage", "Start", "Handover", "Work done"]}
        rows={rows.map((row) => [
          row.project.name,
          getStatusMeta(row.project.e9.status).label,
          row.start ? (renderFormattedDate(row.start, "dd MMM yyyy") ?? "") : "Not set",
          row.end ? (renderFormattedDate(row.end, "dd MMM yyyy") ?? "") : "Not set",
          `${row.progress}%`,
        ])}
      />
    </figure>
  );
}
