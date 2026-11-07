/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AddOutline, SearchOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { cn, renderFormattedDate } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// local
import { E9_PRIORITIES, E9_STATUSES } from "./constants";
import { DEFAULT_E9_FILTERS, filterProjects, getProgressPercent, sortProjects } from "./helpers";
import type { TE9ProjectFilters, TE9SortKey } from "./helpers";
import { useCanCreateE9Project, useE9Projects } from "./hooks";
import { E9Showcase } from "./showcase";
import { E9EmptyState, E9ErrorState, E9LoadingState } from "./states";
import type { TE9CertState, TE9Project } from "./types";
import {
  E9CertSteps,
  E9CodeTile,
  E9DeadlineText,
  E9MemberStack,
  E9PageBody,
  E9PageHeader,
  E9PriorityBadge,
  E9ProgressBar,
  E9StatusBadge,
} from "./ui";

type TCertFilter = "all" | TE9CertState | "billing_open";
const CERT_FILTERS: { key: TCertFilter; label: string }[] = [
  { key: "all", label: "Any certification" },
  { key: "in_progress", label: "Work in progress" },
  { key: "jmc_pending", label: "Waiting for JMC" },
  { key: "part_certified", label: "Part certified" },
  { key: "certified", label: "Certified" },
  { key: "billing_open", label: "Billing open" },
];
const matchesCert = (project: TE9Project, filter: TCertFilter) =>
  filter === "all" || (filter === "billing_open" ? project.billing_open : project.cert_state === filter);

type TView = "slider" | "list";
const VIEW_KEY = "e9-projects-view";

const SORT_OPTIONS: { key: TE9SortKey; label: string }[] = [
  { key: "deadline", label: "Deadline" },
  { key: "priority", label: "Priority" },
  { key: "name", label: "Name" },
  { key: "recent", label: "Newest" },
];

const selectClass =
  "h-9 rounded-lg border border-subtle bg-surface-1 px-3 text-body-sm-regular text-primary outline-none focus-visible:border-accent-strong";

const isStatusFilter = (value: string | null): value is TE9ProjectFilters["status"] =>
  !!value && (value === "all" || value === "active" || E9_STATUSES.some((status) => status.key === value));

function ProjectIdentity({ project }: { project: TE9Project }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <E9CodeTile code={project.identifier} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body-sm-semibold text-primary">{project.name}</span>
        <span className="truncate text-body-xs-regular text-tertiary">
          {project.identifier}
          {project.e9.client_name ? ` · ${project.e9.client_name}` : ""}
          {project.e9.city ? ` · ${project.e9.city}` : ""}
        </span>
      </span>
    </span>
  );
}

function ProjectTable({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  const router = useAppRouter();
  return (
    <div className="hidden overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-raised-100 md:block">
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="border-b border-subtle bg-layer-1">
          <tr className="text-body-xs-medium text-tertiary">
            <th className="w-[31%] px-5 py-3 font-medium">Project</th>
            <th className="w-[14%] px-3 py-3 font-medium">Stage</th>
            <th className="w-[14%] px-3 py-3 font-medium">Deadline</th>
            <th className="w-[16%] px-3 py-3 font-medium">Certification</th>
            <th className="w-[10%] px-3 py-3 font-medium">Team</th>
            <th className="w-[15%] px-5 py-3 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {projects.map((project) => {
            const href = `/${workspaceSlug}/e9/projects/${project.id}`;
            const progress = getProgressPercent(project);
            return (
              <tr
                key={project.id}
                className="cursor-pointer transition-colors hover:bg-layer-1-hover"
                onClick={() => router.push(href)}
              >
                <td className="px-5 py-3.5">
                  {/* real link for keyboard users and "open in new tab" */}
                  <Link href={href} className="block min-w-0 outline-none" onClick={(e) => e.stopPropagation()}>
                    <ProjectIdentity project={project} />
                  </Link>
                </td>
                <td className="px-3 py-3.5">
                  <E9StatusBadge status={project.e9.status} />
                </td>
                <td className="px-3 py-3.5">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-body-sm-regular text-primary">
                      {renderFormattedDate(project.e9.deadline) ?? "—"}
                    </span>
                    <E9DeadlineText project={project} />
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <E9CertSteps project={project} />
                </td>
                <td className="px-3 py-3.5">
                  <E9MemberStack userIds={project.member_ids} max={3} />
                </td>
                <td className="px-5 py-3.5">
                  <span className="flex items-center gap-3">
                    <E9ProgressBar value={progress} />
                    <span className="w-9 text-right text-body-xs-medium text-tertiary tabular-nums">{progress}%</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectCards({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {projects.map((project) => {
        const progress = getProgressPercent(project);
        return (
          <li key={project.id}>
            <Link
              href={`/${workspaceSlug}/e9/projects/${project.id}`}
              className="flex flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-4 shadow-raised-100 active:bg-layer-1-hover"
            >
              <ProjectIdentity project={project} />
              <span className="flex flex-wrap items-center gap-2">
                <E9StatusBadge status={project.e9.status} />
                <E9PriorityBadge priority={project.e9.priority} />
              </span>
              <E9CertSteps project={project} compact />
              <span className="flex items-center gap-3">
                <E9ProgressBar value={progress} />
                <span className="text-body-xs-medium text-tertiary tabular-nums">{progress}%</span>
              </span>
              <span className="flex items-center justify-between gap-3">
                <E9DeadlineText project={project} />
                <E9MemberStack userIds={project.member_ids} max={3} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export const E9ProjectList = observer(function E9ProjectList({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const canCreate = useCanCreateE9Project(workspaceSlug);
  const { data: projects, error, isLoading, mutate } = useE9Projects(workspaceSlug);

  const initialStatus = searchParams.get("status");
  const initialSort = searchParams.get("sort");
  const initialCert = searchParams.get("cert");
  const [certFilter, setCertFilter] = useState<TCertFilter>(
    CERT_FILTERS.some((option) => option.key === initialCert) ? (initialCert as TCertFilter) : "all"
  );
  // a link to a certification filter (e.g. from the Dashboard) opens the list, not the slider
  const [view, setView] = useState<TView>(initialCert ? "list" : "slider");
  useEffect(() => {
    if (initialCert) return;
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {
      // storage blocked: keep the slider
    }
  }, [initialCert]);
  const chooseView = (next: TView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  };
  const [filters, setFilters] = useState<TE9ProjectFilters>({
    ...DEFAULT_E9_FILTERS,
    status: isStatusFilter(initialStatus) ? initialStatus : DEFAULT_E9_FILTERS.status,
  });
  const [sortKey, setSortKey] = useState<TE9SortKey>(
    SORT_OPTIONS.some((option) => option.key === initialSort) ? (initialSort as TE9SortKey) : "deadline"
  );

  const visible = useMemo(
    () =>
      sortProjects(
        filterProjects(projects ?? [], filters).filter((project) => matchesCert(project, certFilter)),
        sortKey
      ),
    [projects, filters, sortKey, certFilter]
  );
  const isFiltered =
    certFilter !== "all" ||
    filters.search !== "" ||
    filters.status !== DEFAULT_E9_FILTERS.status ||
    filters.priority !== DEFAULT_E9_FILTERS.priority;

  return (
    <E9PageBody>
      <E9PageHeader
        eyebrow="Projects"
        title="Projects"
        description="Every site with its stage, deadline and certification."
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative flex w-full items-center lg:max-w-sm">
          <span className="sr-only">Search projects</span>
          <SearchOutline className="pointer-events-none absolute left-3 size-4 text-placeholder" />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search by project, code, client or city"
            className="h-9 w-full rounded-lg border border-subtle bg-surface-1 pr-3 pl-9 text-body-sm-regular text-primary outline-none placeholder:text-placeholder focus-visible:border-accent-strong"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <label className="flex min-w-0 flex-col">
            <span className="sr-only">Stage</span>
            <select
              className={selectClass}
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value as TE9ProjectFilters["status"] }))
              }
            >
              <option value="active">Open projects</option>
              <option value="all">All stages</option>
              {E9_STATUSES.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col">
            <span className="sr-only">Priority</span>
            <select
              className={selectClass}
              value={filters.priority}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, priority: event.target.value as TE9ProjectFilters["priority"] }))
              }
            >
              <option value="all">Any priority</option>
              {E9_PRIORITIES.map((priority) => (
                <option key={priority.key} value={priority.key}>
                  {priority.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col">
            <span className="sr-only">Certification</span>
            <select
              className={selectClass}
              value={certFilter}
              onChange={(event) => setCertFilter(event.target.value as TCertFilter)}
            >
              {CERT_FILTERS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col">
            <span className="sr-only">Sort by</span>
            <select
              className={selectClass}
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as TE9SortKey)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading && !projects ? (
        <E9LoadingState />
      ) : error ? (
        <E9ErrorState onRetry={() => mutate()} />
      ) : visible.length === 0 ? (
        <E9EmptyState
          title={isFiltered ? "No projects match these filters" : "No projects yet"}
          description={
            isFiltered
              ? "Try a different search, or show all stages."
              : "Create your first project to start tracking a site from audit to sign-off."
          }
          action={
            isFiltered ? (
              <Button
                size="md"
                stretch="auto"
                variant="secondary"
                label="Clear filters"
                onClick={() => {
                  setFilters(DEFAULT_E9_FILTERS);
                  setCertFilter("all");
                }}
              />
            ) : (
              canCreate && (
                <Button
                  size="md"
                  stretch="auto"
                  variant="primary"
                  label="New project"
                  onClick={() => router.push(`/${workspaceSlug}/e9/projects/new`)}
                />
              )
            )
          }
        />
      ) : (
        <>
          <div className="-mb-2 flex items-center justify-between gap-3">
            <p className="text-body-xs-regular text-tertiary">
              Showing {visible.length} of {projects?.length ?? 0} projects
            </p>
            <div role="tablist" aria-label="View" className="flex rounded-lg border border-subtle bg-surface-1 p-0.5">
              {(["slider", "list"] as TView[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={view === option}
                  onClick={() => chooseView(option)}
                  className={cn(
                    "rounded-md px-3 py-1 text-body-xs-semibold capitalize transition-colors",
                    view === option ? "bg-[#0B0B0B] text-white" : "text-tertiary hover:text-primary"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          {view === "slider" ? (
            <E9Showcase projects={visible} workspaceSlug={workspaceSlug} />
          ) : (
            <>
              <ProjectTable projects={visible} workspaceSlug={workspaceSlug} />
              <ProjectCards projects={visible} workspaceSlug={workspaceSlug} />
            </>
          )}
        </>
      )}
    </E9PageBody>
  );
});
