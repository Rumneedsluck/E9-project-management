/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { ArrowNarrowRightOutline } from "@makeplane/propel/icons";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { renderFormattedDate } from "@plane/utils";
import { getStatusMeta } from "./constants";
import { getProgressPercent, sortProjects } from "./helpers";
import { Reveal } from "./motion";
import type { TE9Project } from "./types";
import { E9DeadlineText, E9MemberStack, E9PriorityBadge, E9ProgressBar } from "./ui";

/** Project boxes at the bottom of the dashboard: one card per project, newest deadline first. */
export function E9ProjectCards({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  const open = sortProjects(
    projects.filter((project) => project.e9.status !== "completed"),
    "deadline"
  );
  const shown = [...open, ...projects.filter((project) => project.e9.status === "completed")].slice(0, 12);
  if (shown.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <Reveal className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-body-xs-semibold tracking-[0.14em] text-accent-primary uppercase">Projects</span>
          <h2 className="text-h4-semibold tracking-tight text-primary">All sites at a glance</h2>
        </div>
        <Link
          href={`/${workspaceSlug}/e9/projects`}
          className="group inline-flex items-center gap-1 text-body-sm-semibold text-accent-primary"
        >
          View all
          <ArrowNarrowRightOutline className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((project, index) => {
          const stage = getStatusMeta(project.e9.status);
          const progress = getProgressPercent(project);
          return (
            <Reveal key={project.id} delay={Math.min(index, 8) * 0.05}>
              <Link
                href={`/${workspaceSlug}/e9/projects/${project.id}`}
                className="e9-lift group flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-1 hover:border-strong"
              >
                {/* cover: stage colour wash + project icon */}
                <div className="relative h-28 overflow-hidden">
                  <div
                    className="e9-lift-zoom absolute inset-0"
                    style={{
                      background: `radial-gradient(120% 140% at 0% 0%, ${stage.color}55 0%, transparent 60%), linear-gradient(135deg, #141416 0%, #26262b 100%)`,
                    }}
                  />
                  <span className="absolute top-4 left-4 grid size-11 place-items-center rounded-xl bg-white/90 shadow-raised-100">
                    <Logo logo={project.logo_props} size={22} />
                  </span>
                  <span
                    className="absolute top-4 right-4 rounded-full px-2.5 py-1 text-body-2xs-semibold text-white"
                    style={{ backgroundColor: stage.color }}
                  >
                    {stage.label}
                  </span>
                  <span className="absolute bottom-3 left-4 text-body-2xs-semibold tracking-[0.18em] text-white/70 uppercase">
                    {project.identifier}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body-md-semibold text-primary">{project.name}</span>
                    <span className="truncate text-body-xs-regular text-tertiary">
                      {[project.e9.client_name, project.e9.city].filter(Boolean).join(" · ") || "No client yet"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <E9ProgressBar value={progress} />
                    <span className="text-body-xs-semibold text-primary tabular-nums">{progress}%</span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="flex flex-col">
                      <span className="text-body-2xs-medium text-placeholder">
                        {project.e9.deadline ? `Handover ${renderFormattedDate(project.e9.deadline)}` : "No deadline"}
                      </span>
                      <E9DeadlineText project={project} className="text-body-2xs-semibold" />
                    </span>
                    <span className="flex items-center gap-2">
                      <E9PriorityBadge priority={project.e9.priority} />
                      <E9MemberStack userIds={project.member_ids} max={3} />
                    </span>
                  </div>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
