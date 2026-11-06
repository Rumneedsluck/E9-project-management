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
import { useUser } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local
import { E9_BRAND } from "./brand";
import { getAttentionProjects, summarizeProjects } from "./helpers";
import { useCanCreateE9Project, useE9Projects } from "./hooks";
import { CountUp, Reveal } from "./motion";
import { E9ProjectCards } from "./project-cards";
import { E9ErrorState, E9LoadingState } from "./states";
import type { TE9Project } from "./types";
import { E9DeadlineText, E9MemberAvatar, E9PageBody, E9PageHeader, E9Panel, E9ProgressBar } from "./ui";

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

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

export const E9Dashboard = observer(function E9Dashboard({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: currentUser } = useUser();
  const router = useAppRouter();
  const canCreate = useCanCreateE9Project(workspaceSlug);
  const { data: projects, error, isLoading, mutate } = useE9Projects(workspaceSlug);

  const summary = useMemo(() => summarizeProjects(projects ?? []), [projects]);
  const today = renderFormattedDate(new Date(), "EEEE, dd MMMM yyyy");

  return (
    <E9PageBody>
      <E9PageHeader
        eyebrow={E9_BRAND.productName}
        title={`${greeting()}${currentUser?.first_name ? `, ${currentUser.first_name}` : ""}`}
        description={`${today} · Here is how your signage and branding projects are tracking.`}
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
                label="Active projects"
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
                label="Completed"
                value={summary.completed}
                hint={`of ${summary.total} projects`}
                href={`/${workspaceSlug}/e9/projects?status=completed`}
                tone="success"
              />
            </Reveal>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AttentionPanel projects={projects ?? []} workspaceSlug={workspaceSlug} />
            <TeamPanel projects={projects ?? []} />
          </div>

          <E9ProjectCards projects={projects ?? []} workspaceSlug={workspaceSlug} />
        </>
      )}
    </E9PageBody>
  );
});
