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
import { E9ShareRing, E9StageStrip, E9WeekBars } from "./mini-charts";
import { CountUp, Reveal } from "./motion";
import { E9_HUES } from "./palette";

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
      chart: <E9StageStrip stages={stages} total={summary.active} />,
    },
    {
      label: "Due this week",
      value: summary.dueSoon,
      hint: "Handover within 7 days",
      href: `${base}?sort=deadline`,
      tone: summary.dueSoon > 0 ? "!text-warning-primary" : undefined,
      chart: <E9WeekBars week={week} />,
    },
    {
      label: "Overdue",
      value: summary.overdue,
      hint: "Past handover deadline",
      href: `${base}?sort=deadline`,
      tone: summary.overdue > 0 ? "!text-danger-primary" : undefined,
      chart: <E9ShareRing part={summary.overdue} whole={summary.active} color="var(--brand-default)" />,
    },
    {
      label: "Waiting for JMC",
      value: waiting,
      hint: "Work done, not yet certified",
      href: `${base}?cert=jmc_pending&status=all`,
      tone: waiting > 0 ? "!text-warning-primary" : undefined,
      chart: <E9ShareRing part={waiting} whole={summary.active} color={E9_HUES.teal} />,
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
