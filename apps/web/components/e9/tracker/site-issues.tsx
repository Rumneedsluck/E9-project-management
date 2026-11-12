/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* Open site issues (from the Excel "Site Issues" sheet): every tracker row with an issue not yet resolved. */

import { ItemLink } from "../commercial/shared";
import { useE9Items, useE9Scopes } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import { isOpenSiteIssue } from "./logic";

export function E9SiteIssuesPage({ workspaceSlug, project }: { workspaceSlug: string; project: TE9Project }) {
  const { data, error, isLoading, mutate } = useE9Items(workspaceSlug, project.id);
  const { data: scopes } = useE9Scopes(workspaceSlug, project.id);
  if (isLoading && !data) return <E9LoadingState />;
  if (!data) return error ? <E9ErrorState onRetry={() => mutate()} /> : <E9LoadingState />;
  const scopeLabel = (key: string) => scopes?.find((scope) => scope.key === key)?.label ?? key;
  const open = data.items.filter(isOpenSiteIssue);
  return (
    <E9Panel title={`Open site issues · ${open.length}`}>
      {open.length === 0 ? (
        <p className="px-5 py-10 text-center text-body-sm-regular text-success-primary">
          ✓ No open site issues. (Rows with a site issue show here until “Issue resolved?” is Yes.)
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-body-xs-regular">
            <thead>
              <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                {["Item", "Scope", "Floor / area", "Description", "Site issue", "Resolved?"].map((heading) => (
                  <th key={heading} className="px-3 py-2.5">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle text-primary">
              {open.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <ItemLink slug={workspaceSlug} projectId={project.id} scope={item.scope} code={item.item_code} />
                  </td>
                  <td className="px-3 py-2">{scopeLabel(item.scope)}</td>
                  <td className="px-3 py-2">{item.floor_area || "—"}</td>
                  <td className="max-w-[260px] truncate px-3 py-2">{item.description || "—"}</td>
                  <td className="px-3 py-2 font-semibold text-danger-primary">{item.site_issue}</td>
                  <td className="px-3 py-2">{item.issue_resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </E9Panel>
  );
}
