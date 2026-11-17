/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * The small parts the E9 charts are built from:
 *   <E9Tip>          the readout that shows on hover and on keyboard focus
 *   <E9SegmentBar>   one whole split into a few blocks, each with its figure printed on it
 *   <E9MeterList>    a name, a bar and a figure per row, the bars lined up
 *   <E9ChartTable>   the same numbers as a plain table for screen readers
 * Rules they all keep: text is always in the text colours (never the series colour), every value can be read
 * without hovering, and the marks arrive once when the card scrolls into view.
 */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@plane/utils";
import { labelFits, roundShares } from "./chart-math";
import { inkOn } from "./palette";

/** The width of an element in px, kept up to date as the page is resized. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** The readout over a mark. `at` is 0..1 across the chart; it never runs off either edge. */
export function E9Tip({
  at,
  bottom = "calc(100% + 8px)",
  children,
}: {
  at: number;
  bottom?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tooltip"
      className="e9-tip flex flex-col gap-0.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-body-2xs-regular whitespace-nowrap text-secondary shadow-raised-200"
      style={{ left: `clamp(84px, ${(at * 100).toFixed(2)}%, calc(100% - 84px))`, bottom }}
    >
      {children}
    </div>
  );
}

/** Screen-reader twin of a chart: the same numbers as a table. */
export function E9ChartTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row[0])}>
            {row.map((cell, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- fixed column order
              <td key={index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---- one whole, split into blocks ---------------------------------------------------------------- */

export type TE9Segment = {
  key: string;
  label: string;
  value: number;
  /** fill colour: a hex from palette.ts, or a CSS variable */
  color: string;
  /** text colour on that fill; worked out for palette colours, needed for a CSS variable */
  ink?: string;
  /** one short line of explanation, shown in the legend and the readout */
  hint?: string;
  /** makes the block and its legend row a link */
  href?: string;
};

type TSegmentBarProps = {
  segments: TE9Segment[];
  /** what is being counted, singular and plural, e.g. ["site", "sites"] */
  unit: [string, string];
  /** read out by screen readers and used as the table caption */
  label: string;
  emptyText?: string;
  className?: string;
};

export function E9SegmentBar({
  segments,
  unit,
  label,
  emptyText = "Nothing to show yet",
  className,
}: TSegmentBarProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const shares = roundShares(segments.map((segment) => segment.value));
  const named = (count: number) => `${count.toLocaleString("en-IN")} ${count === 1 ? unit[0] : unit[1]}`;
  const blocks = segments
    .map((segment, index) => ({ segment, share: shares[index] }))
    .filter((entry) => entry.segment.value > 0);
  const gaps = Math.max(0, blocks.length - 1) * 2;

  // where each block starts and ends, 0..1 across the bar (for the readout)
  let cursor = 0;
  const placed = blocks.map((entry) => {
    const start = cursor;
    cursor += entry.segment.value / total;
    const px = width > 0 ? (entry.segment.value / total) * (width - gaps) : 0;
    const text = entry.segment.value.toLocaleString("en-IN");
    return {
      segment: entry.segment,
      share: entry.share,
      centre: (start + cursor) / 2,
      text,
      printed: labelFits(px, text),
    };
  });
  const focus = placed.find((entry) => entry.segment.key === active);

  return (
    <figure className={cn("flex flex-col gap-3", className)} data-chart-active={active !== null}>
      <div ref={ref} className="relative">
        {total === 0 ? (
          <div className="grid h-7 place-items-center rounded-[4px] bg-layer-3 text-body-2xs-regular text-tertiary">
            {emptyText}
          </div>
        ) : (
          <div role="list" aria-label={label} className="flex h-7 w-full gap-[2px]">
            {placed.map(({ segment, share, text, printed }, index) => {
              const body = printed ? <span className="px-2 text-[11px] font-semibold tabular-nums">{text}</span> : null;
              const shared = {
                role: "listitem" as const,
                "aria-label": `${segment.label}: ${named(segment.value)}, ${share}%`,
                "data-on": active === segment.key,
                onMouseEnter: () => setActive(segment.key),
                onMouseLeave: () => setActive(null),
                onFocus: () => setActive(segment.key),
                onBlur: () => setActive(null),
                className: "e9-seg-in e9-mark flex h-full min-w-[4px] items-center rounded-[4px]",
                style: {
                  flex: `${segment.value} 1 0`,
                  backgroundColor: segment.color,
                  color: segment.ink ?? inkOn(segment.color),
                  "--i": index,
                } as CSSProperties,
              };
              return segment.href ? (
                <Link key={segment.key} href={segment.href} {...shared}>
                  {body}
                </Link>
              ) : (
                <div key={segment.key} tabIndex={0} {...shared}>
                  {body}
                </div>
              );
            })}
          </div>
        )}
        {focus && (
          <E9Tip at={focus.centre}>
            <span className="text-body-xs-semibold text-primary">
              {named(focus.segment.value)} · {focus.share}%
            </span>
            <span>{focus.segment.label}</span>
          </E9Tip>
        )}
      </div>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {segments.map((segment) => {
          const printed = placed.find((entry) => entry.segment.key === segment.key)?.printed ?? false;
          const row = (
            <>
              <span
                aria-hidden
                className="mt-1 size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: segment.color }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-xs-medium text-primary">{segment.label}</span>
                {segment.hint && <span className="text-body-2xs-regular text-tertiary">{segment.hint}</span>}
              </span>
              {/* a block too narrow for its figure hands it to the legend, so no number is lost */}
              {!printed && (
                <span className="text-body-xs-semibold text-primary tabular-nums">
                  {segment.value.toLocaleString("en-IN")}
                </span>
              )}
            </>
          );
          const rowClass = cn(
            "flex items-start gap-2.5 rounded-md px-1.5 py-1 transition-colors",
            active === segment.key && "bg-layer-1-hover",
            segment.value === 0 && "opacity-55"
          );
          return (
            <li
              key={segment.key}
              onMouseEnter={() => setActive(segment.value > 0 ? segment.key : null)}
              onMouseLeave={() => setActive(null)}
            >
              {segment.href ? (
                <Link href={segment.href} className={cn(rowClass, "hover:bg-layer-1-hover")}>
                  {row}
                </Link>
              ) : (
                <div className={rowClass}>{row}</div>
              )}
            </li>
          );
        })}
      </ul>

      <E9ChartTable
        caption={label}
        head={["", unit[1], "share"]}
        rows={segments.map((segment, index) => [segment.label, segment.value, `${shares[index]}%`])}
      />
    </figure>
  );
}

/* ---- a name, a bar and a figure per row ---------------------------------------------------------- */

export type TE9MeterRow = {
  key: string;
  label: string;
  value: number;
  /** what to print at the end of the row (defaults to the value) */
  figure?: string;
  /** bar colour; defaults to the ink of the page */
  color?: string;
  icon?: ReactNode;
  href?: string;
};

type TMeterListProps = {
  rows: TE9MeterRow[];
  /** the value a full bar stands for; defaults to the largest row */
  max?: number;
  label: string;
  /** heading of the value column in the screen-reader table */
  valueHead: string;
  className?: string;
};

export function E9MeterList({ rows, max, label, valueHead, className }: TMeterListProps) {
  const top = max ?? Math.max(1, ...rows.map((row) => row.value));
  return (
    <figure className={cn("flex flex-col", className)}>
      <ul aria-label={label} className="flex flex-col">
        {rows.map((row, index) => {
          const color = row.color ?? "var(--e9-ink)";
          const body = (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                {row.icon}
                <span className="truncate text-body-xs-medium text-primary">{row.label}</span>
              </span>
              <span className="text-right text-body-xs-semibold text-primary tabular-nums sm:order-3">
                {row.figure ?? row.value.toLocaleString("en-IN")}
              </span>
              {/* the track is a pale step of the bar's own colour, so the whole row reads as one thing */}
              <span
                aria-hidden
                className="col-span-2 h-2 overflow-hidden rounded-full sm:order-2 sm:col-span-1"
                style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)` }}
              >
                <span
                  className="e9-grow-i block h-full rounded-full"
                  style={
                    {
                      width: `${Math.max(row.value > 0 ? 2 : 0, Math.min(100, (row.value / top) * 100))}%`,
                      backgroundColor: color,
                      "--i": index,
                    } as CSSProperties
                  }
                />
              </span>
            </>
          );
          const rowClass =
            "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-2.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.5rem]";
          return (
            <li key={row.key}>
              {row.href ? (
                <Link href={row.href} className={cn(rowClass, "transition-colors hover:bg-layer-1-hover")}>
                  {body}
                </Link>
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <E9ChartTable
        caption={label}
        head={["", valueHead]}
        rows={rows.map((row) => [row.label, row.figure ?? row.value])}
      />
    </figure>
  );
}
