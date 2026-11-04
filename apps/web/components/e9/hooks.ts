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
