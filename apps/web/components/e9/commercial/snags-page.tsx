/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { AddOutline } from "@makeplane/propel/icons";
import { cn } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { useE9Items, useE9Snags } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import { DateCell, TextCell } from "../tracker/cells";
import { isFilled } from "../tracker/logic";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import { E9RefFiles, ItemLink, SmallButton, showError } from "./shared";
import type { TE9Snag, TE9Snags } from "./types";
import { e9Confirm } from "../confirm";

type Props = { workspaceSlug: string; project: TE9Project };

const selectClass =
  "h-8 w-full cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 text-body-xs-regular text-primary hover:border-subtle focus:border-accent-strong disabled:cursor-default disabled:hover:border-transparent";

const STATUS_CLASS: Record<TE9Snag["status"], string> = {
  Open: "bg-danger-subtle text-danger-primary",
  "In Progress": "bg-warning-subtle text-warning-primary",
  "Fixed - Awaiting Client": "bg-accent-subtle text-accent-primary",
  Closed: "bg-success-subtle text-success-primary",
};
const PRIORITY_CLASS: Record<string, string> = {
  High: "text-danger-primary font-semibold",
  Medium: "text-warning-primary",
  Low: "text-tertiary",
};

/** The template's "Snag List": defects found at handover, one row each. */
export function E9SnagsPage({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Snags(workspaceSlug, project.id);
  const { data: itemsData } = useE9Items(workspaceSlug, project.id);
  const items = useMemo(() => (itemsData?.items ?? []).filter(isFilled), [itemsData]);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const send = async (title: string, request: () => Promise<TE9Snags>) => {
    try {
      await mutate(await request(), { revalidate: false });
    } catch (problem) {
      showError(title, problem);
    }
  };
  const patch = (snag: TE9Snag, body: object) =>
    send("Couldn't save the snag", () => e9ProjectService.updateSnag(workspaceSlug, project.id, snag.id, body));

  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const canEdit = data.can_update;
  const rows = filter === "open" ? data.snags.filter((snag) => snag.status !== "Closed") : data.snags;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Which snags">
          {(
            [
              ["open", `Open · ${data.open}`],
              ["all", `All · ${data.snags.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-body-xs-semibold",
                filter === key
                  ? "border-accent-strong bg-accent-subtle text-primary"
                  : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1-hover"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {canEdit && (
          <SmallButton
            onClick={() =>
              send("Couldn't add a snag", () =>
                e9ProjectService.createSnag(workspaceSlug, project.id, { priority: "Medium", status: "Open" })
              )
            }
          >
            <AddOutline className="size-3.5" /> Add snag
          </SmallButton>
        )}
      </div>

      <E9Panel>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-body-sm-regular text-tertiary">
            {filter === "open" ? "No open snags. " : "No snags yet. "}
            {canEdit ? "Click “Add snag”, then pick the item and the reason." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2000px] text-left text-body-xs-regular">
              <thead>
                <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                  {[
                    "#",
                    "Date raised",
                    "Item",
                    "Scope",
                    "Item description",
                    "Floor / Area",
                    "Snag reason",
                    "Snag details",
                    "Photo",
                    "Priority",
                    "Raised by",
                    "Assigned to",
                    "Target date",
                    "Status",
                    "Date closed",
                    "Days open",
                    "Remarks",
                    "",
                  ].map((heading) => (
                    <th key={heading || "actions"} className="px-2 py-2.5 font-semibold whitespace-nowrap">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle text-primary">
                {rows.map((snag, index) => (
                  <tr key={snag.id} className={cn(snag.overdue && "bg-danger-subtle/40")}>
                    <td className="px-2 py-1.5 text-tertiary tabular-nums">{index + 1}</td>
                    <td className="w-32 px-1 py-1">
                      <DateCell
                        label="Date raised"
                        value={snag.raised_on}
                        disabled={!canEdit}
                        onSave={(v) => patch(snag, { raised_on: v })}
                      />
                    </td>
                    <td className="w-40 px-1 py-1">
                      {canEdit ? (
                        <select
                          aria-label="Item code"
                          className={cn(selectClass, "font-semibold")}
                          value={snag.item ?? ""}
                          onChange={(e) => patch(snag, { item: e.target.value || null })}
                        >
                          <option value="">Pick item…</option>
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.item_code} · {item.floor_area || item.description}
                            </option>
                          ))}
                        </select>
                      ) : snag.item_code ? (
                        <ItemLink
                          slug={workspaceSlug}
                          projectId={project.id}
                          scope={snag.scope}
                          code={snag.item_code}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{snag.scope_label || "—"}</td>
                    <td className="max-w-[180px] truncate px-2 py-1.5" title={snag.item_description}>
                      {snag.item_description || "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{snag.floor || "—"}</td>
                    <td className="w-48 px-1 py-1">
                      <select
                        aria-label="Snag reason"
                        className={selectClass}
                        value={snag.reason}
                        disabled={!canEdit}
                        onChange={(e) => patch(snag, { reason: e.target.value })}
                      >
                        <option value="">—</option>
                        {data.reasons.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-56 px-1 py-1">
                      <TextCell
                        label="Snag details"
                        value={snag.details}
                        placeholder="Details"
                        disabled={!canEdit}
                        onSave={(v) => patch(snag, { details: v })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <E9RefFiles
                        slug={workspaceSlug}
                        projectId={project.id}
                        kind="snag"
                        refId={snag.id}
                        canUpload={canEdit}
                        addText="Photo"
                      />
                    </td>
                    <td className="w-28 px-1 py-1">
                      <select
                        aria-label="Priority"
                        className={cn(selectClass, PRIORITY_CLASS[snag.priority])}
                        value={snag.priority}
                        disabled={!canEdit}
                        onChange={(e) => patch(snag, { priority: e.target.value })}
                      >
                        {data.priorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-32 px-1 py-1">
                      <TextCell
                        label="Raised by"
                        value={snag.raised_by}
                        disabled={!canEdit}
                        onSave={(v) => patch(snag, { raised_by: v })}
                      />
                    </td>
                    <td className="w-32 px-1 py-1">
                      <TextCell
                        label="Assigned to"
                        value={snag.assigned_to}
                        disabled={!canEdit}
                        onSave={(v) => patch(snag, { assigned_to: v })}
                      />
                    </td>
                    <td className="w-32 px-1 py-1">
                      <DateCell
                        label="Target date"
                        value={snag.target_date}
                        disabled={!canEdit}
                        onSave={(v) => patch(snag, { target_date: v })}
                      />
                    </td>
                    <td className="w-48 px-1 py-1">
                      <select
                        aria-label="Status"
                        className={cn(selectClass, "rounded-full font-semibold", STATUS_CLASS[snag.status])}
                        value={snag.status}
                        disabled={!canEdit}
                        onChange={(e) => patch(snag, { status: e.target.value })}
                      >
                        {data.statuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-32 px-1 py-1">
                      <DateCell
                        label="Date closed"
                        value={snag.closed_on}
                        disabled={!canEdit}
                        onSave={(v) => patch(snag, { closed_on: v })}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        snag.overdue && "font-semibold text-danger-primary"
                      )}
                    >
                      {snag.days_open ?? "—"}
                    </td>
                    <td className="w-48 px-1 py-1">
                      <TextCell
                        label="Remarks"
                        value={snag.remarks}
                        disabled={!canEdit}
                        onSave={(v) => patch(snag, { remarks: v })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {canEdit && (
                        <SmallButton
                          tone="danger"
                          onClick={async () => {
                            if (!(await e9Confirm("Delete this snag?"))) return;
                            void send("Couldn't delete", () =>
                              e9ProjectService.deleteSnag(workspaceSlug, project.id, snag.id)
                            );
                          }}
                        >
                          ✕
                        </SmallButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-subtle px-5 py-2 text-body-2xs-regular text-tertiary">
          Red row = past its target date and not closed. Setting Status to Closed stamps today&apos;s date.
        </p>
      </E9Panel>
    </div>
  );
}

/** Dashboard panel: which items have open snags. */
export function E9OpenSnagsPanel({
  workspaceSlug,
  projectId,
  onOpen,
}: {
  workspaceSlug: string;
  projectId: string;
  onOpen: () => void;
}) {
  const { data } = useE9Snags(workspaceSlug, projectId);
  if (!data || data.snags.length === 0) return null;
  const open = data.snags.filter((snag) => snag.status !== "Closed");
  return (
    <E9Panel title={`Open snags · ${open.length}`} action={<SmallButton onClick={onOpen}>Open Snag List</SmallButton>}>
      {open.length === 0 ? (
        <p className="px-5 py-6 text-center text-body-sm-regular text-success-primary">✓ All snags closed.</p>
      ) : (
        <ul className="divide-y divide-subtle">
          {open.slice(0, 10).map((snag) => (
            <li key={snag.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
              <span className="text-body-xs-regular text-secondary">
                <span className="font-semibold text-primary">{snag.item_code || "No item"}</span>{" "}
                {snag.reason || "Snag"}
                {snag.floor ? ` · ${snag.floor}` : ""}
              </span>
              <span className="flex items-center gap-3 text-body-2xs-semibold">
                <span className={PRIORITY_CLASS[snag.priority]}>{snag.priority}</span>
                <span className={cn("rounded-full px-2 py-0.5", STATUS_CLASS[snag.status])}>{snag.status}</span>
                <span className={cn("tabular-nums", snag.overdue ? "text-danger-primary" : "text-tertiary")}>
                  {snag.days_open ?? 0} day(s)
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </E9Panel>
  );
}
