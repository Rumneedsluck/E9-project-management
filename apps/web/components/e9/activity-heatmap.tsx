/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * "Activity" on a project's Overview: the last 30 days as readable bars (one bar per day, today in red),
 * and next to it the latest changes in words – who did what, and when.
 */

import { useMemo, useState } from "react";
import { renderFormattedDate } from "@plane/utils";
import { useE9Activity, useE9History } from "./hooks";
import { E9LoadingState } from "./states";
import { describeChange } from "./tracker/photos-history";
import { ago, lastDays } from "./activity-utils";
import { E9Panel } from "./ui";

const DAYS = 30;
const LATEST = 8;
const BAR_AREA = 112; // px of height the tallest bar may use

export function E9ActivityHeatmap({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) {
  const { data: activity, error } = useE9Activity(workspaceSlug, projectId);
  const { data: history } = useE9History(workspaceSlug, projectId);
  const [hover, setHover] = useState<number | null>(null);

  const bars = useMemo(
    () => lastDays(new Map((activity?.days ?? []).map((day) => [day.date, day.count])), new Date()),
    [activity]
  );
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  const total = bars.reduce((sum, bar) => sum + bar.count, 0);
  const today = bars.at(-1)?.count ?? 0;
  const busiest = bars.reduce((best, bar) => (bar.count > best.count ? bar : best), bars[0]);
  const latest = (history ?? []).slice(0, LATEST);

  return (
    <E9Panel title="Activity">
      {!activity ? (
        <div className="px-5 py-6">
          {error ? (
            <p className="text-body-sm-regular text-tertiary">Couldn&apos;t load the activity right now.</p>
          ) : (
            <E9LoadingState />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 px-5 py-5 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span>
                <span className="e9-display text-[40px] leading-none text-primary tabular-nums">{total}</span>{" "}
                <span className="text-body-sm-regular text-tertiary">changes in the last {DAYS} days</span>
              </span>
              <span className="text-body-sm-regular text-tertiary">
                <span className="font-semibold text-primary tabular-nums">{today}</span> today
                {busiest.count > 0 && (
                  <>
                    {" · "}busiest day {renderFormattedDate(busiest.date, "dd MMM")} (
                    <span className="tabular-nums">{busiest.count}</span>)
                  </>
                )}
              </span>
            </div>
            <div className="relative">
              <div
                role="img"
                aria-label={`Changes per day over the last ${DAYS} days: ${total} in total`}
                className="flex items-end gap-[3px] border-b border-subtle"
                style={{ height: BAR_AREA + 4 }}
                onMouseLeave={() => setHover(null)}
              >
                {bars.map((bar, index) => (
                  <div key={bar.iso} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(index)}>
                    <div
                      className="w-full rounded-t-[3px] transition-colors"
                      style={{
                        // square-root scale: one very busy day does not flatten all the quiet ones
                        height: bar.count === 0 ? 3 : Math.max(10, Math.round(Math.sqrt(bar.count / max) * BAR_AREA)),
                        background:
                          index === bars.length - 1
                            ? "var(--brand-default)"
                            : bar.count === 0
                              ? "var(--e9-grid)"
                              : "var(--e9-ink)",
                        opacity: bar.count === 0 ? 0.6 : hover === index ? 1 : 0.8,
                      }}
                    />
                  </div>
                ))}
              </div>
              {hover !== null && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-body-2xs-medium whitespace-nowrap text-primary shadow-raised-100"
                  style={{ left: `${((hover + 0.5) / bars.length) * 100}%` }}
                >
                  {renderFormattedDate(bars[hover].date, "EEE, dd MMM")}:{" "}
                  {bars[hover].count === 0
                    ? "no changes"
                    : `${bars[hover].count} change${bars[hover].count === 1 ? "" : "s"}`}
                </div>
              )}
              <div className="mt-1.5 flex justify-between text-body-2xs-regular text-tertiary tabular-nums">
                {[0, 7, 14, 21, 29].map((index) => (
                  <span key={index}>{renderFormattedDate(bars[index].date, "dd MMM")}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 lg:col-span-2">
            <span className="e9-eyebrow">Latest changes</span>
            {latest.length === 0 ? (
              <p className="text-body-sm-regular text-tertiary">
                Nothing yet. Changes to the tracker, files and dates show up here as people make them.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-subtle">
                {latest.map((change) => (
                  <li key={change.id} className="flex flex-col gap-0.5 py-2">
                    <span className="text-body-xs-regular text-secondary">
                      <span className="font-semibold text-primary">{change.actor?.name ?? "Someone"}</span>{" "}
                      {describeChange(change)}
                      {change.entity_label && change.action === "updated" ? ` on ${change.entity_label}` : ""}
                    </span>
                    <span className="text-body-2xs-regular text-tertiary">{ago(change.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </E9Panel>
  );
}
