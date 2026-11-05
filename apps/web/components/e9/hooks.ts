/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { mutate } from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";
import { e9ProjectService } from "@/services/e9/project.service";

export const e9ProjectsKey = (workspaceSlug: string) => `E9_PROJECTS_${workspaceSlug}`;
export const e9ProjectKey = (workspaceSlug: string, projectId: string) => `E9_PROJECT_${workspaceSlug}_${projectId}`;

/** All E9 projects the signed-in person can see. */
export const useE9Projects = (workspaceSlug: string | undefined) =>
  useSWR(workspaceSlug ? e9ProjectsKey(workspaceSlug) : null, () => e9ProjectService.list(workspaceSlug!), {
    revalidateOnFocus: false,
  });

/** One E9 project. */
export const useE9Project = (workspaceSlug: string | undefined, projectId: string | undefined) =>
  useSWR(
    workspaceSlug && projectId ? e9ProjectKey(workspaceSlug, projectId) : null,
    () => e9ProjectService.retrieve(workspaceSlug!, projectId!),
    { revalidateOnFocus: false }
  );

export const e9ItemsKey = (workspaceSlug: string, projectId: string) => `E9_ITEMS_${workspaceSlug}_${projectId}`;

/** All tracker rows of one project. */
export const useE9Items = (workspaceSlug: string | undefined, projectId: string | undefined) =>
  useSWR(
    workspaceSlug && projectId ? e9ItemsKey(workspaceSlug, projectId) : null,
    () => e9ProjectService.listItems(workspaceSlug!, projectId!),
    { revalidateOnFocus: false }
  );

export const e9ScopesKey = (slug: string, projectId: string) => `E9_SCOPES_${slug}_${projectId}`;
export const e9FloorsKey = (slug: string, projectId: string) => `E9_FLOORS_${slug}_${projectId}`;
export const e9PhotosKey = (slug: string, projectId: string) => `E9_PHOTOS_${slug}_${projectId}`;
export const e9DocsKey = (slug: string, projectId: string) => `E9_DOCS_${slug}_${projectId}`;
export const e9HistoryKey = (slug: string, projectId: string, entityId?: string) =>
  `E9_HISTORY_${slug}_${projectId}_${entityId ?? "all"}`;

const opts = { revalidateOnFocus: false };

/** The project's scope sheets (standard + the team's own). */
export const useE9Scopes = (slug: string, projectId: string) =>
  useSWR(e9ScopesKey(slug, projectId), () => e9ProjectService.listScopes(slug, projectId), opts);

export const useE9Floors = (slug: string, projectId: string) =>
  useSWR(e9FloorsKey(slug, projectId), () => e9ProjectService.listFloors(slug, projectId), opts);

/** All item photos of a project (grouped by item on the sheet). */
export const useE9Photos = (slug: string, projectId: string) =>
  useSWR(e9PhotosKey(slug, projectId), () => e9ProjectService.listAttachments(slug, projectId, "photo"), opts);

/** Site audit reports and other project PDFs. */
export const useE9Documents = (slug: string, projectId: string) =>
  useSWR(e9DocsKey(slug, projectId), () => e9ProjectService.listAttachments(slug, projectId, "site_audit"), opts);

export const useE9History = (slug: string, projectId: string, entityId?: string) =>
  useSWR(e9HistoryKey(slug, projectId, entityId), () => e9ProjectService.listHistory(slug, projectId, entityId), opts);

export const e9BoqKey = (slug: string, projectId: string) => `E9_BOQ_${slug}_${projectId}`;
export const e9LogsKey = (slug: string, projectId: string) => `E9_LOGS_${slug}_${projectId}`;
export const e9BillsKey = (slug: string, projectId: string) => `E9_BILLS_${slug}_${projectId}`;
export const e9SnagsKey = (slug: string, projectId: string) => `E9_SNAGS_${slug}_${projectId}`;

export const useE9Snags = (slug: string, projectId: string) =>
  useSWR(e9SnagsKey(slug, projectId), () => e9ProjectService.getSnags(slug, projectId), opts);

export const e9SummaryKey = (slug: string) => `E9_SUMMARY_${slug}`;

export const useE9Boq = (slug: string, projectId: string) =>
  useSWR(e9BoqKey(slug, projectId), () => e9ProjectService.getBoq(slug, projectId), opts);

export const useE9Logs = (slug: string, projectId: string) =>
  useSWR(e9LogsKey(slug, projectId), () => e9ProjectService.getLogs(slug, projectId), opts);

export const useE9Bills = (slug: string, projectId: string) =>
  useSWR(e9BillsKey(slug, projectId), () => e9ProjectService.getBills(slug, projectId), opts);

export const useE9Summary = (slug: string | undefined) =>
  useSWR(slug ? e9SummaryKey(slug) : null, () => e9ProjectService.getSummary(slug!), opts);

/** BOQ, billing and the summary all depend on each other: refresh them together. */
export const refreshE9Commercial = async (slug: string, projectId: string) => {
  await Promise.all([
    mutate(e9BoqKey(slug, projectId)),
    mutate(e9BillsKey(slug, projectId)),
    mutate(e9SummaryKey(slug)),
    mutate((key) => typeof key === "string" && key.startsWith(`E9_HISTORY_${slug}_${projectId}`)),
  ]);
};

/** After a big change (import, scope set-up) reload everything for the project. */
export const refreshE9Tracker = async (slug: string, projectId: string) => {
  await Promise.all([
    mutate(e9ItemsKey(slug, projectId)),
    mutate(e9ScopesKey(slug, projectId)),
    mutate(e9FloorsKey(slug, projectId)),
    mutate(e9PhotosKey(slug, projectId)),
    mutate(e9DocsKey(slug, projectId)),
    mutate(e9ProjectKey(slug, projectId)),
    mutate(e9BoqKey(slug, projectId)),
    mutate(e9LogsKey(slug, projectId)),
    mutate(e9BillsKey(slug, projectId)),
    mutate((key) => typeof key === "string" && key.startsWith(`E9_HISTORY_${slug}_${projectId}`)),
  ]);
};

/** Refresh the cached E9 data after a change. */
export const refreshE9Projects = async (workspaceSlug: string, projectId?: string) => {
  await mutate(e9ProjectsKey(workspaceSlug));
  if (projectId) await mutate(e9ProjectKey(workspaceSlug, projectId));
};

/** Plane rule: workspace admins and members can create projects (guests cannot). */
export const useCanCreateE9Project = (workspaceSlug: string | undefined) => {
  const { allowPermissions } = useUserPermissions();
  if (!workspaceSlug) return false;
  return allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE,
    workspaceSlug
  );
};
