/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Activity heatmap for a project's Overview: one square per day of the last year, a column per week,
 * darker red = more tracker changes that day. Built to the same recipe as the Bklit UI heatmap
 * (cells, week/day axes, quarter separators with labels, tooltip, 2 px gaps and corners, a 1.1 s
 * ease-in-out entrance), drawn here as plain SVG.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { E9LoadingState } from "./states";
import { ChartStatFlow } from "./chart-stat-flow";
import { useE9Activity } from "./hooks";
import { E9Panel } from "./ui";

const GAP = 2;
const RADIUS = 2;
const QUARTER_SPACING = 12;
const LABEL_ROW = 14;
const Y_AXIS = 32;
const X_AXIS = 20;
const MIN_CELL = 9;
const MAX_CELL = 18;
const LEVELS = 5;
const TIP_HALF = 90; // keeps the tooltip inside the chart at both edges
const STAGGER_MS = 18;
const DAY_LABELS: Record<number, string> = { 0: "Mon", 2: "Wed", 4: "Fri" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TCell = { row: number; date: Date; iso: string; count: number };
type TColumn = { cells: TCell[]; quarter: string; month: number | null };

const pad = (value: number) => String(value).padStart(2, "0");
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseIso = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const mondayIndex = (date: Date) => (date.getDay() + 6) % 7;
const quarterOf = (date: Date) => `${date.getFullYear()}-${Math.floor(date.getMonth() / 3)}`;

/** Week columns (Monday first) covering from..to, with each day's change count. */
export const buildColumns = (from: string, to: string, counts: Map<string, number>): TColumn[] => {
  const first = parseIso(from);
  const last = parseIso(to);
  const columns: TColumn[] = [];
  let seenMonth = -1;
  for (let week = addDays(first, -mondayIndex(first)); week <= last; week = addDays(week, 7)) {
    const cells: TCell[] = [];
    for (let row = 0; row < 7; row += 1) {
      const date = addDays(week, row);
      if (date < first || date > last) continue;
      const iso = toIso(date);
      cells.push({ row, date, iso, count: counts.get(iso) ?? 0 });
    }
    if (cells.length === 0) continue;
    const anchor = cells[0].date;
    const month = anchor.getMonth() !== seenMonth ? anchor.getMonth() : null;
    if (month !== null) seenMonth = month;
    columns.push({ cells, quarter: quarterOf(anchor), month });
  }
  return columns;
};

/** 0 = nothing happened, 1..5 = busier. */
export const levelFor = (count: number, max: number): number =>
  count <= 0 || max <= 0 ? 0 : Math.min(LEVELS, Math.max(1, Math.ceil((count / max) * LEVELS)));

const quarterLabel = (key: string) => {
  const [year, quarter] = key.split("-").map(Number);
  return `Q${quarter + 1} '${String(year).slice(2)}`;
};

type THover = { x: number; y: number; text: string };

function HeatmapGrid({ columns, max }: { columns: TColumn[]; max: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<THover | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 900));
    observer.observe(element);
    setWidth(element.clientWidth || 900);
    return () => observer.disconnect();
  }, []);

  const groups = useMemo(() => new Set(columns.map((column) => column.quarter)).size, [columns]);
  const cell = Math.max(
    MIN_CELL,
    Math.min(
      MAX_CELL,
      Math.floor((width - Y_AXIS - (groups - 1) * QUARTER_SPACING - (columns.length - 1) * GAP) / columns.length)
    )
  );

  // x position of each week column, with extra room where a new quarter starts
  const layout = useMemo(() => {
    let extra = 0;
    return columns.map((column, index) => {
      if (index > 0 && column.quarter !== columns[index - 1].quarter) extra += QUARTER_SPACING;
      return { column, x: Y_AXIS + index * (cell + GAP) + extra, index };
    });
  }, [columns, cell]);

  const gridHeight = 7 * (cell + GAP) - GAP;
  const svgWidth = (layout.at(-1)?.x ?? 0) + cell;
  const svgHeight = LABEL_ROW + gridHeight + X_AXIS;
  const quarterStarts = layout.filter(
    ({ column, index }) => index === 0 || column.quarter !== columns[index - 1].quarter
  );

  return (
    <div ref={wrapRef} className="relative overflow-x-auto text-primary">
      <svg
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label="Changes per day over the last year, one square per day"
        onMouseLeave={() => setHover(null)}
      >
        {/* quarter separators and their labels */}
        {quarterStarts.map(({ column, x, index }) => (
          <g key={`${column.quarter}-${index}`}>
            {index > 0 && (
              <line
                x1={x - QUARTER_SPACING / 2 - GAP / 2}
                x2={x - QUARTER_SPACING / 2 - GAP / 2}
                y1={LABEL_ROW}
                y2={LABEL_ROW + gridHeight}
                stroke="var(--border-color-subtle, currentColor)"
                strokeOpacity={0.9}
              />
            )}
            <text x={x} y={LABEL_ROW - 4} fontSize={10} fill="currentColor" opacity={0.75}>
              {quarterLabel(column.quarter)}
            </text>
          </g>
        ))}
        {/* y axis: day names */}
        {Object.entries(DAY_LABELS).map(([row, name]) => (
          <text
            key={name}
            x={0}
            y={LABEL_ROW + Number(row) * (cell + GAP) + cell - 2}
            fontSize={10}
            fill="currentColor"
            opacity={0.55}
          >
            {name}
          </text>
        ))}
        {/* x axis: month names under the first week of each month */}
        {layout.map(({ column, x, index }) =>
          column.month === null ? null : (
            <text
              key={`m-${index}`}
              x={x}
              y={LABEL_ROW + gridHeight + 14}
              fontSize={10}
              fill="currentColor"
              opacity={0.55}
            >
              {MONTHS[column.month]}
            </text>
          )
        )}
        {/* the cells */}
        {layout.map(({ column, x, index }) =>
          column.cells.map((day) => (
            <rect
              key={day.iso}
              className="e9-heat-cell"
              x={x}
              y={LABEL_ROW + day.row * (cell + GAP)}
              width={cell}
              height={cell}
              rx={RADIUS}
              ry={RADIUS}
              style={{ fill: `var(--e9-heat-${levelFor(day.count, max)})`, animationDelay: `${index * STAGGER_MS}ms` }}
              onMouseEnter={() =>
                setHover({
                  x: x + cell / 2,
                  y: LABEL_ROW + day.row * (cell + GAP),
                  text: `${day.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}: ${
                    day.count === 0 ? "no changes" : `${day.count} change${day.count === 1 ? "" : "s"}`
                  }`,
                })
              }
            />
          ))
        )}
      </svg>
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-body-2xs-medium whitespace-nowrap text-primary shadow-raised-100"
          style={{
            left: Math.min(Math.max(hover.x, TIP_HALF), Math.max(svgWidth - TIP_HALF, TIP_HALF)),
            top: hover.y - 6,
          }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}

/** "Activity" panel on a project's Overview. */
export function E9ActivityHeatmap({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) {
  const { data, error } = useE9Activity(workspaceSlug, projectId);
  const columns = useMemo(() => {
    if (!data) return [];
    return buildColumns(data.from, data.to, new Map(data.days.map((day) => [day.date, day.count])));
  }, [data]);
  const max = useMemo(() => Math.max(0, ...(data?.days.map((day) => day.count) ?? [])), [data]);

  return (
    <E9Panel title="Activity · last 12 months">
      <div className="flex flex-col gap-4 px-5 py-5">
        {!data ? (
          error ? (
            <p className="text-body-sm-regular text-tertiary">Couldn't load the activity right now.</p>
          ) : (
            <E9LoadingState />
          )
        ) : (
          <>
            <div className="flex flex-col items-start">
              <ChartStatFlow
                value={data.total}
                label="changes made to this project in the last year"
                valueClassName="e9-display text-[40px] leading-none"
                labelClassName="text-body-xs-regular"
              />
            </div>
            <HeatmapGrid columns={columns} max={max} />
          </>
        )}
      </div>
    </E9Panel>
  );
}
