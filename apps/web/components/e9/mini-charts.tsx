/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * The thumbnail charts that sit beside a headline number (Home's strip and the Dashboard's tiles):
 * a thin ring, a week of bars and a strip of stages. Each draws once, then stays still.
 * They are pictures of the number next to them, so they are hidden from screen readers.
 */

import type { CSSProperties } from "react";
import { cn } from "@plane/utils";
import { E9_HUES } from "./palette";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** A thin ring: `part` out of `whole`, drawn once. */
export function E9ShareRing({ part, whole, color }: { part: number; whole: number; color: string }) {
  const size = 44;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = whole > 0 ? Math.min(1, part / whole) : 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="size-11 -rotate-90 text-primary" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.1}
        strokeWidth={stroke}
      />
      {share > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${share * circumference} ${circumference}`}
          className="e9-ring-draw"
          style={{ ["--e9-ring" as string]: circumference }}
        />
      )}
    </svg>
  );
}

/** The next seven days, today first; a taller bar = more sites due that day. */
export function E9WeekBars({ week, todayIndex = new Date().getDay() }: { week: number[]; todayIndex?: number }) {
  const busiest = Math.max(1, ...week);
  return (
    <span className="flex items-end gap-1" aria-hidden>
      {week.map((count, day) => (
        // oxlint-disable-next-line react/no-array-index-key -- the bars are the seven days, in order
        <span key={day} className="flex flex-col items-center gap-0.5">
          <span
            className={cn("e9-bar-rise w-2.5 rounded-sm", count === 0 && "bg-layer-3")}
            style={{
              height: `${count > 0 ? 8 + (count / busiest) * 24 : 4}px`,
              animationDelay: `${0.3 + day * 0.05}s`,
              backgroundColor: count > 0 ? E9_HUES.amber : undefined,
            }}
          />
          <span className="text-[9px] leading-none text-placeholder">{DAY_LETTERS[(todayIndex + day) % 7]}</span>
        </span>
      ))}
    </span>
  );
}

/** One block per stage, as wide as its share of the open sites. */
export function E9StageStrip({
  stages,
  total,
  className,
}: {
  stages: { key: string; label: string; color: string; count: number }[];
  total: number;
  className?: string;
}) {
  const shown = stages.filter((stage) => stage.count > 0);
  return (
    <span className={cn("flex h-2.5 w-28 gap-[2px] overflow-hidden rounded-full", className)} aria-hidden>
      {shown.length === 0 && <span className="h-full w-full bg-layer-3" />}
      {shown.map((stage, index) => (
        <span
          key={stage.key}
          title={`${stage.label}: ${stage.count}`}
          className="e9-seg-in h-full"
          style={
            {
              width: `${(stage.count / Math.max(1, total)) * 100}%`,
              backgroundColor: stage.color,
              "--i": index,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
