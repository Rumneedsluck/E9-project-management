/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { ArrowLeftOutline, EditOutline, NewTabArrowOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// local
import { getStatusMeta } from "./constants";
import { getProgressPercent } from "./helpers";
import { useE9Project } from "./hooks";
import { E9ErrorState, E9LoadingState } from "./states";
import {
  E9DeadlineText,
  E9MemberAvatar,
  E9PageBody,
  E9Panel,
  E9PriorityBadge,
  E9ProgressBar,
  E9StageTrack,
  E9StatusBadge,
} from "./ui";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-body-xs-medium text-tertiary">{label}</dt>
      <dd className="text-body-sm-regular break-words text-primary">{children}</dd>
    </div>
  );
}

const empty = <span className="text-placeholder">Not set</span>;

type Props = { workspaceSlug: string; projectId: string };

export const E9ProjectDetail = observer(function E9ProjectDetail({ workspaceSlug, projectId }: Props) {
  const router = useAppRouter();
  const { data: project, error, isLoading, mutate } = useE9Project(workspaceSlug, projectId);

  if (isLoading && !project)
    return (
      <E9PageBody>
        <E9LoadingState />
      </E9PageBody>
    );
  if (error || !project)
    return (
      <E9PageBody>
        <E9ErrorState message="This project doesn't exist, or you are not part of its team." onRetry={() => mutate()} />
      </E9PageBody>
    );

  const { e9 } = project;
  const progress = getProgressPercent(project);
  const team = project.member_ids.filter((id) => id !== project.project_lead);

  return (
    <E9PageBody>
      <Link
        href={`/${workspaceSlug}/e9/projects`}
        className="inline-flex w-fit items-center gap-1.5 text-body-xs-medium text-tertiary hover:text-primary"
      >
        <ArrowLeftOutline className="size-3.5" />
        All projects
      </Link>

      {/* Title block */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-layer-2">
            <Logo logo={project.logo_props} size={28} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-body-xs-semibold tracking-[0.14em] text-accent-primary uppercase">
              {project.identifier}
            </span>
            <h1 className="text-h3-semibold tracking-tight break-words text-primary">{project.name}</h1>
            <p className="text-body-sm-regular text-tertiary">
              {[e9.client_name, e9.city].filter(Boolean).join(" · ") || "No client added yet"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            stretch="auto"
            variant="secondary"
            size="lg"
            icon={<NewTabArrowOutline className="size-4" />}
            label="Work items"
            onClick={() => router.push(`/${workspaceSlug}/projects/${project.id}/issues`)}
          />
          {project.can_edit && (
            <Button
              stretch="auto"
              variant="primary"
              size="lg"
              icon={<EditOutline className="size-4" />}
              label="Edit project"
              onClick={() => router.push(`/${workspaceSlug}/e9/projects/${project.id}/edit`)}
            />
          )}
        </div>
      </div>

      {/* Status strip */}
      <section className="flex flex-col gap-5 rounded-xl border border-subtle bg-surface-1 p-5 shadow-raised-100 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-body-xs-medium text-tertiary">Current stage</span>
            <E9StatusBadge status={e9.status} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-body-xs-medium text-tertiary">Priority</span>
            <E9PriorityBadge priority={e9.priority} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-body-xs-medium text-tertiary">Handover</span>
            <span className="flex items-baseline gap-2">
              <span className="text-body-sm-semibold text-primary">{renderFormattedDate(e9.deadline) ?? "—"}</span>
              <E9DeadlineText project={project} />
            </span>
          </div>
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5 sm:max-w-xs sm:items-end sm:text-right">
            <span className="text-body-xs-medium text-tertiary">
              Progress
              {project.work_items.total > 0 &&
                ` · ${project.work_items.completed}/${project.work_items.total} work items done`}
            </span>
            <span className="flex w-full items-center gap-3">
              <E9ProgressBar value={progress} />
              <span className="text-body-sm-semibold text-primary tabular-nums">{progress}%</span>
            </span>
          </div>
        </div>
        {e9.status === "on_hold" ? (
          <p className="rounded-lg bg-danger-subtle px-4 py-3 text-body-sm-medium text-danger-primary">
            {getStatusMeta("on_hold").hint}.
          </p>
        ) : (
          <E9StageTrack status={e9.status} />
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <E9Panel title="Project details" className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
            <Detail label="Client">{e9.client_name || empty}</Detail>
            <Detail label="City">{e9.city || empty}</Detail>
            <Detail label="Site address">{e9.site_address || empty}</Detail>
            <Detail label="Work order / PO no.">{e9.work_order_number || empty}</Detail>
            <Detail label="Start date">{renderFormattedDate(e9.start_date) ?? empty}</Detail>
            <Detail label="Handover deadline">{renderFormattedDate(e9.deadline) ?? empty}</Detail>
            <div className="sm:col-span-2">
              <Detail label="Scope & notes">
                {project.description ? <span className="whitespace-pre-line">{project.description}</span> : empty}
              </Detail>
            </div>
          </dl>
        </E9Panel>

        <E9Panel title="Team">
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-2">
              <span className="text-body-xs-medium text-tertiary">Project coordinator</span>
              {project.project_lead ? <E9MemberAvatar userId={project.project_lead} size="md" showName /> : empty}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-body-xs-medium text-tertiary">Team members · {team.length}</span>
              {team.length === 0 ? (
                empty
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {team.map((id) => (
                    <li key={id}>
                      <E9MemberAvatar userId={id} size="md" showName />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </E9Panel>
      </div>
    </E9PageBody>
  );
});
