/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
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

type TItemsData = Awaited<ReturnType<typeof e9ProjectService.listItems>>;

/**
 * After a refresh most rows are unchanged. Reusing the old row objects for those lets the sheet skip
 * redrawing them (a fresh object for every row would redraw the whole visible sheet after every save).
 */
export const keepUnchangedRows = (previous: TItemsData | undefined, fresh: TItemsData): TItemsData => {
  if (!previous) return fresh;
  const before = new Map(previous.items.map((item) => [item.id, item]));
  let same =
    previous.items.length === fresh.items.length &&
    previous.can_edit === fresh.can_edit &&
    previous.can_bill === fresh.can_bill;
  const items = fresh.items.map((item, index) => {
    const old = before.get(item.id);
    if (old && JSON.stringify(old) === JSON.stringify(item)) {
      if (previous.items[index] !== old) same = false;
      return old;
    }
    same = false;
    return item;
  });
  return same ? previous : { ...fresh, items };
};

/** All tracker rows of one project. */
export const useE9Items = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const latest = useRef<TItemsData | undefined>(undefined);
  const result = useSWR(
    workspaceSlug && projectId ? e9ItemsKey(workspaceSlug, projectId) : null,
    async () => keepUnchangedRows(latest.current, await e9ProjectService.listItems(workspaceSlug!, projectId!)),
    { revalidateOnFocus: false }
  );
  latest.current = result.data;
  return result;
};

export const e9ScopesKey = (slug: string, projectId: string) => `E9_SCOPES_${slug}_${projectId}`;
export const e9FloorsKey = (slug: string, projectId: string) => `E9_FLOORS_${slug}_${projectId}`;
/** kind "photo" = site photos; "install_photo" = photos of the finished installation */
export type TE9PhotoKind = "photo" | "install_photo";
export const e9PhotosKey = (slug: string, projectId: string, kind: TE9PhotoKind = "photo") =>
  kind === "photo" ? `E9_PHOTOS_${slug}_${projectId}` : `E9_PHOTOS_${kind}_${slug}_${projectId}`;
export const e9DocsKey = (slug: string, projectId: string) => `E9_DOCS_${slug}_${projectId}`;
export const e9HistoryKey = (slug: string, projectId: string, entityId?: string) =>
  `E9_HISTORY_${slug}_${projectId}_${entityId ?? "all"}`;

const opts = { revalidateOnFocus: false };

/** The project's scope sheets (standard + the team's own). */
export const useE9Scopes = (slug: string, projectId: string) =>
  useSWR(e9ScopesKey(slug, projectId), () => e9ProjectService.listScopes(slug, projectId), opts);

/** The company's own scopes (Writing Film, Dinoc ...), shared by every project. */
export const useE9ScopeTemplates = (slug: string, enabled = true) =>
  useSWR(enabled ? ["e9-scope-templates", slug] : null, () => e9ProjectService.listScopeTemplates(slug), opts);

export const useE9Floors = (slug: string, projectId: string) =>
  useSWR(e9FloorsKey(slug, projectId), () => e9ProjectService.listFloors(slug, projectId), opts);

/** All item photos of a project (grouped by item on the sheet). */
export const useE9Photos = (slug: string, projectId: string, kind: TE9PhotoKind = "photo") =>
  useSWR(e9PhotosKey(slug, projectId, kind), () => e9ProjectService.listAttachments(slug, projectId, kind), opts);

/** Site audit reports and other project PDFs. */
export const useE9Documents = (slug: string, projectId: string) =>
  useSWR(e9DocsKey(slug, projectId), () => e9ProjectService.listAttachments(slug, projectId, "site_audit"), opts);

export const useE9History = (slug: string, projectId: string, entityId?: string) =>
  // entityId "none" means "no item chosen yet": do not ask the server anything
  useSWR(
    entityId === "none" ? null : e9HistoryKey(slug, projectId, entityId),
    () => e9ProjectService.listHistory(slug, projectId, entityId),
    opts
  );

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

export const e9HoldKey = (slug: string, projectId: string) => `E9_HOLD_${slug}_${projectId}`;
export const e9HealthKey = (slug: string, projectId: string) => `E9_HEALTH_${slug}_${projectId}`;
export const e9ReportKey = (slug: string, projectId: string) => `E9_REPORT_${slug}_${projectId}`;
export const e9CertKey = (slug: string, projectId: string) => `E9_CERT_${slug}_${projectId}`;
export const e9AnnouncementsKey = (slug: string) => `E9_ANNOUNCEMENTS_${slug}`;

/** JMCs (whole project / floor / scope) and whether billing is open. */
export const useE9Certifications = (slug: string, projectId: string) =>
  useSWR(e9CertKey(slug, projectId), () => e9ProjectService.getCertifications(slug, projectId), opts);

/** Items on hold / cancelled. */
export const useE9Hold = (slug: string, projectId: string) =>
  useSWR(e9HoldKey(slug, projectId), () => e9ProjectService.getHold(slug, projectId), opts);

export const useE9Health = (slug: string, projectId: string) =>
  useSWR(e9HealthKey(slug, projectId), () => e9ProjectService.getHealth(slug, projectId), opts);

export const useE9Report = (slug: string, projectId: string) =>
  useSWR(e9ReportKey(slug, projectId), () => e9ProjectService.getReport(slug, projectId), opts);

export const useE9Announcements = (slug: string | undefined) =>
  useSWR(slug ? e9AnnouncementsKey(slug) : null, () => e9ProjectService.getAnnouncements(slug!), opts);

/** BOQ, billing, certification and the summary all depend on each other: refresh them together. */
export const refreshE9Commercial = async (slug: string, projectId: string) => {
  await Promise.all([
    mutate(e9BoqKey(slug, projectId)),
    mutate(e9BillsKey(slug, projectId)),
    mutate(e9CertKey(slug, projectId)),
    mutate(e9HoldKey(slug, projectId)),
    mutate(e9HealthKey(slug, projectId)),
    mutate(e9ReportKey(slug, projectId)),
    mutate(e9SummaryKey(slug)),
    mutate(e9ProjectsKey(slug)),
    mutate(e9ProjectKey(slug, projectId)),
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
    mutate(e9PhotosKey(slug, projectId, "install_photo")),
    mutate(e9DocsKey(slug, projectId)),
    mutate(e9ProjectKey(slug, projectId)),
    mutate(e9BoqKey(slug, projectId)),
    mutate(e9LogsKey(slug, projectId)),
    mutate(e9BillsKey(slug, projectId)),
    mutate(e9CertKey(slug, projectId)),
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

/** Changes made per day over the last year (for the Overview heatmap). */
export const useE9Activity = (slug: string, projectId: string) =>
  useSWR(["e9-activity", slug, projectId], () => e9ProjectService.getActivity(slug, projectId), opts);
