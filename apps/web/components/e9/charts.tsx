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

import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@plane/utils";

export type TRingSegment = { key: string; label: string; value: number; color?: string };

const SIZE = 168;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3; // px of surface between segments

/** opacity step for the i-th of n ordered segments (0.18 … 1) */
/*
 * Ordered steps get "traffic" colours that read at a glance in dark mode:
 * first = not started (grey), middle = under way (amber → sky), last = done (green).
 */
const RAMPS: Record<number, string[]> = {
  1: ["#22C55E"],
  2: ["#6B7280", "#22C55E"],
  3: ["#6B7280", "#F59E0B", "#22C55E"],
  4: ["#6B7280", "#F59E0B", "#38BDF8", "#22C55E"],
  5: ["#6B7280", "#F59E0B", "#FB923C", "#38BDF8", "#22C55E"],
};
export const rampColor = (index: number, count: number) => {
  const ramp = RAMPS[Math.min(Math.max(count, 1), 5)];
  if (count <= 5) return ramp[index] ?? ramp[ramp.length - 1];
  // longer lists: spread across the 5-step ramp
  return ramp[Math.round((index / (count - 1)) * 4)];
};

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
                stroke={segment.color ?? rampColor(index, segments.length)}
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
                backgroundColor: segment.color ?? rampColor(index, segments.length),
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

/** Big "work done" pie: one filled share and the rest, % in the middle. */
export function E9DonePie({
  percent,
  size = 200,
  label = "done",
  className,
}: {
  percent: number;
  size?: number;
  label?: string;
  className?: string;
}) {
  const stroke = size * 0.07;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, percent));
  const reduceMotion = useReducedMotion();
  // opening a project: the pie pops up, the red ring sweeps round and the number counts up to the real figure
  const progress = useMotionValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    const controls = animate(progress, 1, { duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.25 });
    return () => controls.stop();
  }, [value, reduceMotion, progress]);
  const dash = useTransform(progress, (p) => `${(value / 100) * circumference * p} ${circumference}`);
  const shown = useTransform(progress, (p) => `${Math.round(value * p)}%`);
  return (
    <motion.div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.82 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 160, damping: 14, mass: 0.9 }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 text-primary"
        role="img"
        aria-label={`${value}% ${label}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.09}
          strokeWidth={stroke}
        />
        {value > 0 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--brand-default)"
            strokeWidth={stroke}
            strokeLinecap="butt"
            style={{ strokeDasharray: dash }}
          />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <motion.span className="e9-display leading-none text-primary tabular-nums" style={{ fontSize: size * 0.26 }}>
          {shown}
        </motion.span>
        <span className="mt-1 text-body-xs-medium text-tertiary">{label}</span>
      </div>
    </motion.div>
  );
}

/** Small stage pie (Production, Material …): grey not started → amber under way → green done; problems in red. */
export function E9StagePie({ title, segments }: { title: string; segments: TRingSegment[] }) {
  const size = 92;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0).length;
  const gap = visible > 1 ? 2 : 0;
  let offset = 0;
  const last = segments[segments.length - 1];
  const donePercent = sum ? Math.round(((last?.value ?? 0) / sum) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-subtle bg-surface-1 p-4">
      <span className="text-body-xs-semibold text-primary">{title}</span>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 text-primary"
          role="img"
          aria-label={`${title}: ${donePercent}% ${last?.label ?? ""}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.07}
            strokeWidth={stroke}
          />
          {segments.map((segment, index) => {
            const length = sum ? (segment.value / sum) * circumference : 0;
            const start = offset;
            offset += length;
            if (length <= 0) return null;
            return (
              <circle
                key={segment.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color ?? rampColor(index, segments.length)}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
                strokeDashoffset={-start}
                className="e9-ring-arc"
              >
                <title>{`${segment.label}: ${segment.value}`}</title>
              </circle>
            );
          })}
        </svg>
        <span className="absolute inset-0 grid place-items-center text-body-sm-semibold text-primary tabular-nums">
          {sum ? `${donePercent}%` : "–"}
        </span>
      </div>
      <ul className="flex w-full flex-col gap-0.5">
        {segments.map((segment, index) => (
          <li
            key={segment.key}
            className={cn("flex items-center gap-2 text-body-2xs-regular", segment.value === 0 && "opacity-50")}
          >
            <span
              className="size-2 shrink-0 rounded-sm text-primary"
              style={{
                backgroundColor: segment.color ?? rampColor(index, segments.length),
              }}
            />
            <span className="flex-1 leading-tight text-secondary">{segment.label}</span>
            <span className="font-semibold text-primary tabular-nums">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
