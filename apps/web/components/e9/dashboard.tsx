/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { AddOutline, ArrowNarrowRightOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { cn, renderFormattedDate } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// local
import { E9Announcements } from "./announcements";
import { E9_BRAND } from "./brand";
import { E9DonePie, E9Ring } from "./charts";
import type { TRingSegment } from "./charts";
import { E9_STATUSES } from "./constants";
import { getAttentionProjects, sortProjects, summarizeProjects } from "./helpers";
import { useCanCreateE9Project, useE9Projects, useE9Summary } from "./hooks";
import { CountUp, Reveal } from "./motion";
import { E9ErrorState, E9LoadingState } from "./states";
import type { TE9Project } from "./types";
import { E9DeadlineText, E9MemberAvatar, E9PageBody, E9PageHeader, E9Panel, E9ProgressBar } from "./ui";

type TStatTileProps = {
  label: string;
  value: number;
  hint: string;
  href: string;
  tone?: "default" | "warning" | "danger" | "success";
};

function StatTile({ label, value, hint, href, tone = "default" }: TStatTileProps) {
  return (
    <Link
      href={href}
      className="e9-lift group flex h-full flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-5 shadow-raised-100 hover:border-strong"
    >
      <span className="flex items-center justify-between text-body-xs-medium text-tertiary">
        {label}
        <ArrowNarrowRightOutline className="size-4 text-placeholder transition-transform group-hover:translate-x-0.5" />
      </span>
      <span
        className={cn(
          "text-h2-semibold leading-none tracking-tight text-primary tabular-nums",
          tone === "warning" && value > 0 && "text-warning-primary",
          tone === "danger" && value > 0 && "text-danger-primary",
          tone === "success" && "text-success-primary"
        )}
      >
        <CountUp value={value} />
      </span>
      <span className="text-body-xs-regular text-placeholder">{hint}</span>
    </Link>
  );
}

function AttentionPanel({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  const items = getAttentionProjects(projects).slice(0, 6);
  return (
    <E9Panel title="Needs attention">
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-body-sm-regular text-tertiary">
          Nothing overdue or due this week. Nice work.
        </p>
      ) : (
        <ul className="divide-y divide-subtle">
          {items.map((project) => (
            <li key={project.id}>
              <Link
                href={`/${workspaceSlug}/e9/projects/${project.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-layer-1-hover"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body-sm-medium text-primary">{project.name}</span>
                  <span className="truncate text-body-xs-regular text-tertiary">
                    {project.e9.client_name || project.identifier} · {renderFormattedDate(project.e9.deadline)}
                  </span>
                </span>
                <E9DeadlineText project={project} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </E9Panel>
  );
}

function TeamPanel({ projects }: { projects: TE9Project[] }) {
  const load = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      if (project.e9.status === "completed") continue;
      for (const memberId of project.member_ids) counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
    }
    // oxlint-disable-next-line unicorn/no-array-sort -- sorting a fresh array
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [projects]);
  const max = Math.max(1, ...load.map(([, count]) => count));
  return (
    <E9Panel title="Team workload">
      {load.length === 0 ? (
        <p className="px-5 py-8 text-center text-body-sm-regular text-tertiary">No one is assigned yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 px-5 py-4">
          {load.map(([userId, count]) => (
            <li key={userId} className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between gap-3">
                <E9MemberAvatar userId={userId} showName />
                <span className="text-body-xs-medium whitespace-nowrap text-tertiary">{count} active</span>
              </span>
              <E9ProgressBar value={(count / max) * 100} className="h-1" />
            </li>
          ))}
        </ul>
      )}
    </E9Panel>
  );
}

const BILL_STAGES = [
  { stage: 0, label: "Certified – to Accounts" },
  { stage: 1, label: "PI with Accounts" },
  { stage: 2, label: "PI to sign & submit" },
  { stage: 3, label: "Waiting for WCC" },
  { stage: 4, label: "Done (WCC received)" },
];

/** ₹ in lakh / crore so a ring centre stays short */
const rupees = (value: number) => {
  if (value >= 1e7) return `₹${(value / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

function StagesPanel({ projects }: { projects: TE9Project[] }) {
  const segments: TRingSegment[] = E9_STATUSES.map((status) => ({
    key: status.key,
    label: status.label,
    value: projects.filter((project) => project.e9.status === status.key).length,
    // On hold is a status, not a step: it keeps its own colour
    color: status.key === "on_hold" ? status.color : undefined,
  }));
  return (
    <E9Panel title="Sites by stage">
      <div className="px-5 py-5">
        <E9Ring segments={segments} totalLabel={projects.length === 1 ? "site" : "sites"} emptyText="No sites yet" />
      </div>
    </E9Panel>
  );
}

function BillingPanel({ workspaceSlug }: { workspaceSlug: string }) {
  const { data } = useE9Summary(workspaceSlug);
  const bills = (data?.projects ?? []).flatMap((project) => project.bills);
  const segments: TRingSegment[] = BILL_STAGES.map(({ stage, label }) => ({
    key: String(stage),
    label,
    value: bills.filter((bill) => bill.stage === stage).reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0),
  }));
  return (
    <E9Panel
      title="Billing"
      action={
        <Link
          href={`/${workspaceSlug}/e9/billing`}
          className="text-body-xs-semibold text-accent-primary hover:underline"
        >
          Open billing
        </Link>
      }
    >
      <div className="px-5 py-5">
        <E9Ring segments={segments} totalLabel="in bills" format={rupees} emptyText="No bills yet" />
      </div>
    </E9Panel>
  );
}

/** One small pie per active project: how much of its tracker is installed. */
function ProjectPiesPanel({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  const active = sortProjects(
    projects.filter((project) => project.e9.status !== "completed"),
    "deadline"
  );
  return (
    <E9Panel title="Work done per project">
      {active.length === 0 ? (
        <p className="px-5 py-8 text-center text-body-sm-regular text-tertiary">No active projects.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {active.map((project) => {
            const progress = project.tracker;
            const hasRows = !!progress && progress.rows > 0;
            return (
              <li key={project.id}>
                <Link
                  href={`/${workspaceSlug}/e9/projects/${project.id}`}
                  className="e9-lift flex h-full flex-col items-center gap-3 rounded-xl border border-subtle p-4 text-center hover:border-strong"
                >
                  {hasRows ? (
                    <E9DonePie percent={progress.percent} size={96} label="done" />
                  ) : (
                    <span className="grid size-24 place-items-center rounded-full border border-dashed border-strong text-body-2xs-medium text-tertiary">
                      No tracker
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="line-clamp-2 text-body-xs-semibold text-primary">{project.name}</span>
                    <span className="text-body-2xs-regular text-tertiary">
                      {project.identifier}
                      {project.e9.city ? ` · ${project.e9.city}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </E9Panel>
  );
}

export const E9Dashboard = observer(function E9Dashboard({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useAppRouter();
  const canCreate = useCanCreateE9Project(workspaceSlug);
  const { data: projects, error, isLoading, mutate } = useE9Projects(workspaceSlug);

  const summary = useMemo(() => summarizeProjects(projects ?? []), [projects]);
  const waitingForJmc = (projects ?? []).filter((project) => project.cert_state === "jmc_pending").length;
  const today = renderFormattedDate(new Date(), "EEEE, dd MMMM yyyy");

  return (
    <E9PageBody>
      <E9PageHeader
        eyebrow={E9_BRAND.name}
        title="Dashboard"
        description={today}
        actions={
          canCreate && (
            <Button
              stretch="auto"
              variant="primary"
              size="lg"
              icon={<AddOutline className="size-4" />}
              label="New project"
              onClick={() => router.push(`/${workspaceSlug}/e9/projects/new`)}
            />
          )
        }
      />

      {isLoading && !projects ? (
        <E9LoadingState />
      ) : error ? (
        <E9ErrorState onRetry={() => mutate()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Reveal delay={0.0}>
              <StatTile
                label="Active sites"
                value={summary.active}
                hint={`${summary.onHold} on hold`}
                href={`/${workspaceSlug}/e9/projects`}
              />
            </Reveal>
            <Reveal delay={0.06}>
              <StatTile
                label="Due this week"
                value={summary.dueSoon}
                hint="Handover within 7 days"
                href={`/${workspaceSlug}/e9/projects?sort=deadline`}
                tone="warning"
              />
            </Reveal>
            <Reveal delay={0.12}>
              <StatTile
                label="Overdue"
                value={summary.overdue}
                hint="Past handover deadline"
                href={`/${workspaceSlug}/e9/projects?sort=deadline`}
                tone="danger"
              />
            </Reveal>
            <Reveal delay={0.18}>
              <StatTile
                label="Waiting for JMC"
                value={waitingForJmc}
                hint="Work done, certification not signed"
                href={`/${workspaceSlug}/e9/projects?cert=jmc_pending&status=all`}
                tone="warning"
              />
            </Reveal>
          </div>

          <ProjectPiesPanel projects={projects ?? []} workspaceSlug={workspaceSlug} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StagesPanel projects={projects ?? []} />
            <BillingPanel workspaceSlug={workspaceSlug} />
          </div>

          <E9Announcements workspaceSlug={workspaceSlug} allowPosting />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AttentionPanel projects={projects ?? []} workspaceSlug={workspaceSlug} />
            <TeamPanel projects={projects ?? []} />
          </div>
        </>
      )}
    </E9PageBody>
  );
});
