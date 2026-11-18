/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* On hold & cancelled items (the template's "Held Items" and "Cancelled Items" sheets), as readable tables. */

import { cn } from "@plane/utils";
import { ItemLink } from "../commercial/shared";
import { useE9Hold } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import type { TE9HoldRow } from "./hold-types";

export const formatDay = (value: string | null) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** "Replaced by" with a tick when the item code really exists, or a warning. */
export function ReplacementNote({ row }: { row: TE9HoldRow }) {
  if (!row.replacement && !row.replaced_by) return <span className="text-placeholder">—</span>;
  const warning =
    row.replacement === "missing"
      ? "Replaced by is empty"
      : row.replacement === "unknown"
        ? `No item ${row.replaced_by}`
        : "";
  return (
    <span className="flex flex-col">
      {row.replaced_by && <span>{row.replaced_by}</span>}
      {warning && <span className="text-body-2xs-semibold text-warning-primary">! {warning}</span>}
    </span>
  );
}

function HoldTable({
  rows,
  slug,
  projectId,
  held,
}: {
  rows: TE9HoldRow[];
  slug: string;
  projectId: string;
  held: boolean;
}) {
  const headings = [
    "Item",
    "Scope",
    "Floor / description",
    "Reason",
    held ? "Since" : "Cancelled on",
    ...(held ? ["Days on hold", "Bill now?", "Billable now?"] : []),
    "Replaced by / note",
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-body-xs-regular">
        <thead>
          <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
            {headings.map((heading) => (
              <th key={heading} className="px-3 py-2.5">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle text-primary">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2">
                <ItemLink slug={slug} projectId={projectId} scope={row.scope} code={row.code} />
              </td>
              <td className="px-3 py-2">{row.scope_label}</td>
              <td className="max-w-[260px] px-3 py-2">
                <span className="block truncate">
                  {[row.floor, row.description].filter(Boolean).join(" · ") || "—"}
                </span>
              </td>
              <td className="px-3 py-2">{row.reason || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDay(row.since)}</td>
              {held && (
                <>
                  <td className="px-3 py-2 tabular-nums">{row.days ?? "—"}</td>
                  <td className="px-3 py-2">{row.bill_now || "—"}</td>
                  <td
                    className={cn("px-3 py-2 font-semibold", row.billable ? "text-success-primary" : "text-tertiary")}
                  >
                    {row.billable ? "Yes" : "No"}
                  </td>
                </>
              )}
              <td className="px-3 py-2">
                <ReplacementNote row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function E9HoldPage({ workspaceSlug, project }: { workspaceSlug: string; project: TE9Project }) {
  const { data, error, isLoading, mutate } = useE9Hold(workspaceSlug, project.id);
  if (isLoading && !data) return <E9LoadingState />;
  if (!data) return error ? <E9ErrorState onRetry={() => mutate()} /> : <E9LoadingState />;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-sm-regular text-tertiary">
        On hold: the item stays in the totals but shows no progress until it is released. Cancelled: it leaves every
        number. Change an item&apos;s status in the Tracker, in the “On hold / cancel / billing” group.
      </p>
      <E9Panel title={`On hold · ${data.held.length}`}>
        {data.held.length === 0 ? (
          <p className="px-5 py-10 text-center text-body-sm-regular text-success-primary">✓ Nothing is on hold.</p>
        ) : (
          <HoldTable rows={data.held} slug={workspaceSlug} projectId={project.id} held />
        )}
      </E9Panel>
      <E9Panel title={`Cancelled · ${data.cancelled.length}`}>
        {data.cancelled.length === 0 ? (
          <p className="px-5 py-10 text-center text-body-sm-regular text-tertiary">No cancelled items.</p>
        ) : (
          <HoldTable rows={data.cancelled} slug={workspaceSlug} projectId={project.id} held={false} />
        )}
      </E9Panel>
    </div>
  );
}
