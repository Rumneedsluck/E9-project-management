/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Home's live numbers: four figures from the real projects, each with a small chart.
 * Everything counts up / draws once when the page opens, then stays still.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@plane/utils";
import { E9_STAGES } from "./constants";
import { dueByDay, summarizeProjects } from "./helpers";
import { useE9Projects } from "./hooks";
import { CountUp, Reveal } from "./motion";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** A thin ring: `part` out of `whole`, drawn once. */
function ShareRing({ part, whole, color }: { part: number; whole: number; color: string }) {
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

type TFigure = {
  label: string;
  value: number;
  hint: string;
  href: string;
  tone?: string;
  chart: ReactNode;
};

function Figure({ figure, index }: { figure: TFigure; index: number }) {
  return (
    <Reveal delay={0.15 + index * 0.06}>
      <Link
        href={figure.href}
        className="group flex h-full flex-col gap-3 px-5 py-4 transition-colors hover:bg-[var(--e9-hover)]"
      >
        <span className="e9-eyebrow">{figure.label}</span>
        <span className="flex items-end justify-between gap-3">
          <CountUp value={figure.value} className={cn("e9-figure [font-size:52px] text-primary", figure.tone)} />
          <span className="flex h-11 items-end">{figure.chart}</span>
        </span>
        <span className="text-body-xs-regular text-tertiary">{figure.hint}</span>
      </Link>
    </Reveal>
  );
}

export function E9HomeStrip({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: projects } = useE9Projects(workspaceSlug);
  if (!projects || projects.length === 0) return null;
  const summary = summarizeProjects(projects);
  const waiting = projects.filter((project) => project.cert_state === "jmc_pending").length;
  const week = dueByDay(projects);
  const busiest = Math.max(1, ...week);
  const todayIndex = new Date().getDay();
  const stages = E9_STAGES.filter((stage) => stage.key !== "completed")
    .map((stage) => ({
      key: stage.key,
      label: stage.label,
      color: stage.color,
      count: summary.byStatus[stage.key] ?? 0,
    }))
    .filter((stage) => stage.count > 0);
  const base = `/${workspaceSlug}/e9/projects`;

  const figures: TFigure[] = [
    {
      label: "Active sites",
      value: summary.active,
      hint: stages.length ? `across ${stages.length} stage${stages.length === 1 ? "" : "s"}` : "No open sites",
      href: base,
      chart: (
        // one block per stage, as wide as its share of the open sites
        <span className="flex h-2.5 w-28 overflow-hidden rounded-full bg-layer-3" aria-hidden>
          {stages.map((stage) => (
            <span
              key={stage.key}
              title={`${stage.label}: ${stage.count}`}
              className="e9-grow h-full"
              style={{ width: `${(stage.count / Math.max(1, summary.active)) * 100}%`, backgroundColor: stage.color }}
            />
          ))}
        </span>
      ),
    },
    {
      label: "Due this week",
      value: summary.dueSoon,
      hint: "Handover within 7 days",
      href: `${base}?sort=deadline`,
      tone: summary.dueSoon > 0 ? "!text-warning-primary" : undefined,
      chart: (
        // the next seven days, today first; a taller bar = more sites due that day
        <span className="flex items-end gap-1" aria-hidden>
          {week.map((count, day) => (
            // oxlint-disable-next-line react/no-array-index-key -- the bars are the seven days, in order
            <span key={day} className="flex flex-col items-center gap-0.5">
              <span
                className={cn("e9-bar-rise w-2.5 rounded-sm", count > 0 ? "bg-[#E8A317]" : "bg-layer-3")}
                style={{
                  height: `${count > 0 ? 8 + (count / busiest) * 24 : 4}px`,
                  animationDelay: `${0.3 + day * 0.05}s`,
                }}
              />
              <span className="text-[9px] leading-none text-placeholder">{DAY_LETTERS[(todayIndex + day) % 7]}</span>
            </span>
          ))}
        </span>
      ),
    },
    {
      label: "Overdue",
      value: summary.overdue,
      hint: "Past handover deadline",
      href: `${base}?sort=deadline`,
      tone: summary.overdue > 0 ? "!text-danger-primary" : undefined,
      chart: <ShareRing part={summary.overdue} whole={summary.active} color="var(--brand-default)" />,
    },
    {
      label: "Waiting for JMC",
      value: waiting,
      hint: "Work done, not yet certified",
      href: `${base}?cert=jmc_pending&status=all`,
      tone: waiting > 0 ? "!text-warning-primary" : undefined,
      chart: <ShareRing part={waiting} whole={summary.active} color="#14A3A3" />,
    },
  ];

  return (
    <section
      aria-label="Today in numbers"
      className="grid grid-cols-2 divide-x divide-y divide-subtle overflow-hidden rounded-2xl border border-subtle bg-surface-1 lg:grid-cols-4 lg:divide-y-0"
    >
      {figures.map((figure, index) => (
        <Figure key={figure.label} figure={figure} index={index} />
      ))}
    </section>
  );
}
