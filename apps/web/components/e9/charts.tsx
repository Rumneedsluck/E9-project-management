/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Ring chart for ordered steps (project stages, bill stages).
 * Steps are one ink colour, light (early) -> dark (late), so the ring reads in order and works
 * in light and dark mode. A status (e.g. On hold) may carry its own colour. Every segment has a
 * labelled legend row with its value, so nothing depends on colour alone. Hover a segment or a
 * row to see it in the middle.
 */

import { useState } from "react";
import { cn } from "@plane/utils";

export type TRingSegment = { key: string; label: string; value: number; color?: string };

const SIZE = 168;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3; // px of surface between segments

/** opacity step for the i-th of n ordered segments (0.18 … 1) */
const inkStep = (index: number, count: number) => (count <= 1 ? 1 : 0.18 + (0.82 * index) / (count - 1));

export function E9Ring({
  segments,
  total,
  totalLabel,
  format = (value) => value.toLocaleString("en-IN"),
  emptyText = "Nothing yet",
}: {
  segments: TRingSegment[];
  total?: number;
  totalLabel: string;
  format?: (value: number) => string;
  emptyText?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
  const shownTotal = total ?? sum;
  const focused = segments.find((segment) => segment.key === active);
  const visible = segments.filter((segment) => segment.value > 0);
  const gap = visible.length > 1 ? GAP : 0;

  let offset = 0;
  const arcs = segments.map((segment, index) => {
    const length = sum > 0 ? (segment.value / sum) * CIRCUMFERENCE : 0;
    const arc = { segment, index, start: offset, length: Math.max(0, length - gap) };
    offset += length;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90 text-primary"
          role="img"
          aria-label={`${totalLabel}: ${format(shownTotal)}`}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.07}
            strokeWidth={STROKE}
          />
          {arcs.map(({ segment, index, start, length }) =>
            length > 0 ? (
              <circle
                key={segment.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={segment.color ?? "currentColor"}
                strokeOpacity={segment.color ? 1 : inkStep(index, segments.length)}
                strokeWidth={active === segment.key ? STROKE + 4 : STROKE}
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-start}
                className="e9-ring-arc cursor-pointer transition-[stroke-width] duration-200"
                style={{ animationDelay: `${index * 0.06}s` }}
                onMouseEnter={() => setActive(segment.key)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${segment.label}: ${format(segment.value)}`}</title>
              </circle>
            ) : null
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-h4-semibold leading-tight text-primary tabular-nums">
            {sum === 0 ? "–" : format(focused ? focused.value : shownTotal)}
          </span>
          <span className="text-body-2xs-medium text-tertiary">
            {sum === 0 ? emptyText : focused ? focused.label : totalLabel}
          </span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-0.5">
        {segments.map((segment, index) => (
          <li
            key={segment.key}
            onMouseEnter={() => setActive(segment.key)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1 text-body-xs-regular",
              active === segment.key && "bg-layer-1-hover",
              segment.value === 0 && "opacity-50"
            )}
          >
            <span
              className="size-2.5 shrink-0 rounded-sm text-primary"
              style={{
                backgroundColor: segment.color ?? "currentColor",
                opacity: segment.color ? 1 : inkStep(index, segments.length),
              }}
            />
            <span className="flex-1 truncate text-secondary">{segment.label}</span>
            <span className="font-semibold text-primary tabular-nums">{format(segment.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
