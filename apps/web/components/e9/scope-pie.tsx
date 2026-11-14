/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * The big pie on a project's Overview, drawn as a ring of thin ticks (the look of the Bklit pie chart,
 * built here by hand). Each scope of work gets a coloured sector sized by how much of it there is;
 * the middle counts up to the whole project's work done. Hover a sector, or a row of the list under it,
 * and the middle shows that scope's own % done instead.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@plane/utils";
import { RING_TICKS, ringTicks } from "./scope-ring";

export type TScopeSlice = {
  key: string;
  label: string;
  color: string;
  /** how big the scope is: pieces (Nos) and sq-ft rows, as in "Items / Qty" */
  value: number;
  /** this scope's own % installed */
  percent: number;
};

type Props = {
  slices: TScopeSlice[];
  /** the whole project's % work done (shown in the middle) */
  percent: number;
  size?: number;
  label?: string;
};

function CountUp({ value, delay = 0.35 }: { value: number; delay?: number }) {
  const reduceMotion = useReducedMotion();
  const progress = useMotionValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    const controls = animate(progress, 1, { duration: 1.3, ease: [0.16, 1, 0.3, 1], delay });
    return () => controls.stop();
  }, [value, delay, reduceMotion, progress]);
  const shown = useTransform(progress, (p) => `${Math.round(value * p)}%`);
  return <motion.span>{shown}</motion.span>;
}

export function E9ScopeTickPie({ slices, percent, size = 300, label = "work done" }: Props) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const ticks = useMemo(() => ringTicks(slices.map((slice) => ({ key: slice.key, value: slice.value }))), [slices]);
  const centre = size / 2;
  const outer = size * 0.47;
  const inner = size * 0.33;
  const stroke = Math.max(2, size * 0.009);
  const total = slices.reduce((acc, slice) => acc + slice.value, 0);
  const current = active === null ? null : slices[active];

  // which scope the pointer is over, from its angle round the ring
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * size - centre;
    const y = ((event.clientY - box.top) / box.height) * size - centre;
    const distance = Math.hypot(x, y);
    if (distance < inner * 0.85 || distance > outer * 1.12) return setActive(null);
    const angle = (Math.atan2(x, -y) * 180) / Math.PI;
    const index = Math.round((((angle + 360) % 360) / 360) * RING_TICKS) % RING_TICKS;
    const tick = ticks.find((entry) => entry.index === index) ?? ticks.find((entry) => entry.index === index - 1);
    setActive(tick ? tick.sector : null);
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <motion.div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 170, damping: 13, mass: 0.9 }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
          role="img"
          aria-label={`${percent}% ${label}. ${slices.map((slice) => `${slice.label} ${slice.percent}%`).join(", ")}`}
          onPointerMove={pick}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.length === 0
            ? Array.from({ length: RING_TICKS }, (_, index) => (
                <line
                  key={index}
                  x1={centre}
                  y1={centre - outer}
                  x2={centre}
                  y2={centre - inner}
                  transform={`rotate(${(index / RING_TICKS) * 360} ${centre} ${centre})`}
                  stroke="currentColor"
                  strokeOpacity={0.12}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  className="text-primary"
                />
              ))
            : ticks.map((tick) => (
                <g key={tick.index} transform={`rotate(${tick.angle} ${centre} ${centre})`}>
                  <g
                    className="e9-tick-grow"
                    data-on={active === tick.sector}
                    data-dim={active !== null && active !== tick.sector}
                  >
                    <line
                      x1={centre}
                      y1={centre - outer}
                      x2={centre}
                      y2={centre - inner}
                      stroke={slices[tick.sector].color}
                      strokeWidth={stroke}
                      strokeLinecap="round"
                      className="e9-tick-in"
                      style={{ "--i": tick.index } as CSSProperties}
                    />
                  </g>
                </g>
              ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="e9-display leading-none text-primary tabular-nums" style={{ fontSize: size * 0.2 }}>
            {current ? `${current.percent}%` : <CountUp value={percent} />}
          </span>
          <span className="mt-1.5 max-w-[60%] truncate text-body-xs-medium text-tertiary">
            {current ? `${current.label} installed` : label}
          </span>
        </div>
      </motion.div>

      {slices.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-x-2 gap-y-1.5" aria-label="Scopes of work">
          {slices.map((slice, index) => (
            <li key={slice.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className={cn(
                  "flex items-center gap-2 rounded-full border border-subtle px-3 py-1 text-body-xs-regular transition-[background-color,opacity] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-default)]",
                  active === index && "bg-layer-1-hover",
                  active !== null && active !== index && "opacity-50"
                )}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                <span className="text-secondary">{slice.label}</span>
                <span className="text-placeholder tabular-nums">
                  {total > 0 ? `${Math.round((slice.value / total) * 100)}% of work` : ""}
                </span>
                <span className="font-semibold text-primary tabular-nums">{slice.percent}% done</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
