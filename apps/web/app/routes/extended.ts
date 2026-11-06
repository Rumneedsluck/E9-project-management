/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

/**
 * E9 Creative pages.
 *
 * Plane merges these with its own routes (see ./helper.ts). The E9 pages sit
 * inside Plane's workspace layouts, so they get the same sign-in check,
 * sidebar and workspace data as every Plane screen.
 */
const E9 = "./(all)/[workspaceSlug]/(projects)/e9";

export const extendedRoutes: RouteConfigEntry[] = [
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(projects)/layout.tsx", [
        route(":workspaceSlug/e9", `${E9}/page.tsx`),
        route(":workspaceSlug/e9/dashboard", `${E9}/dashboard/page.tsx`),
        route(":workspaceSlug/e9/projects", `${E9}/projects/page.tsx`),
        route(":workspaceSlug/e9/billing", `${E9}/summary/page.tsx`),
        route(":workspaceSlug/e9/summary", `${E9}/summary/page.tsx`, { id: "e9-summary-legacy" }),
        route(":workspaceSlug/e9/projects/new", `${E9}/projects/new/page.tsx`),
        route(":workspaceSlug/e9/projects/:projectId", `${E9}/projects/[projectId]/page.tsx`),
        route(":workspaceSlug/e9/projects/:projectId/edit", `${E9}/projects/[projectId]/edit/page.tsx`),
      ]),
    ]),
  ]),
];
