/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { mutate as globalMutate } from "swr";
import { AddOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { cn } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { e9BillsKey, e9ItemsKey, e9SummaryKey, useE9Boq, useE9Items } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import { DateCell, NumberCell, TextCell } from "../tracker/cells";
import { isFilled } from "../tracker/logic";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import { ItemLink, SmallButton, fmt, showError, unitText } from "./shared";
import type { TE9Boq, TE9Reprint } from "./types";
import { e9Confirm } from "../confirm";

type Props = { workspaceSlug: string; project: TE9Project };

const KIND_LABEL: Record<TE9Reprint["kind"], string> = { reprint: "Reprint", extra: "Extra (Amended PO)" };
const CAUSE_LABEL: Record<TE9Reprint["cause"], string> = { e9: "E9", client: "Client", site: "Site" };

const selectClass =
  "h-8 w-full cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 text-body-xs-regular text-primary hover:border-subtle focus:border-accent-strong disabled:cursor-default disabled:hover:border-transparent";

/** The template's "Reprints & Extras" sheet: one row per reprint or extra, picked by item code. */
export function E9ReprintsPage({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Boq(workspaceSlug, project.id);
  const { data: itemsData } = useE9Items(workspaceSlug, project.id);
  const items = useMemo(() => (itemsData?.items ?? []).filter(isFilled), [itemsData]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ item: "", kind: "reprint", cause: "e9", reason: "" });

  const send = async (title: string, request: () => Promise<TE9Boq>) => {
    try {
      const next = await request();
      await mutate(next, { revalidate: false });
      void globalMutate(e9ItemsKey(workspaceSlug, project.id)); // "Re-sent" column on the tracker
      void globalMutate(e9BillsKey(workspaceSlug, project.id));
      void globalMutate(e9SummaryKey(workspaceSlug));
      return true;
    } catch (problem) {
      showError(title, problem);
      return false;
    }
  };
  const patch = (reprint: TE9Reprint, body: object) =>
    send("Couldn't save", () => e9ProjectService.boqUpdate(workspaceSlug, project.id, "reprints", reprint.id, body));

  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const canEdit = data.can_update;
  const reasons = data.reprint_reasons ?? [];
  const totals = data.reprints.reduce(
    (sum, row) => {
      const key = row.kind === "extra" ? "extra" : row.cause === "client" ? "client" : "ours";
      return { ...sum, [key]: sum[key] + 1 };
    },
    { ours: 0, client: 0, extra: 0 }
  );

  const create = async () => {
    if (!draft.item) {
      showError("Pick the item code", { item: "Choose the item that was reprinted." });
      return;
    }
    const ok = await send("Couldn't add the reprint", () =>
      e9ProjectService.boqCreate(workspaceSlug, project.id, "reprints", {
        ...draft,
        reprint_date: new Date().toISOString().slice(0, 10),
      })
    );
    if (ok) {
      setAdding(false);
      setDraft({ item: "", kind: "reprint", cause: "e9", reason: "" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Reprints – our side (E9 / site)", value: totals.ours, hint: "Not billed, not counted as extra" },
          { label: "Reprints – client changes", value: totals.client, hint: "Billable" },
          { label: "Extras (amended PO)", value: totals.extra, hint: "Extra production the client asked for" },
        ].map((tile) => (
          <div key={tile.label} className="flex flex-col gap-1 rounded-xl border border-subtle bg-surface-1 p-4">
            <span className="text-h4-semibold text-primary tabular-nums">{tile.value}</span>
            <span className="text-body-sm-semibold text-primary">{tile.label}</span>
            <span className="text-body-2xs-regular text-tertiary">{tile.hint}</span>
          </div>
        ))}
      </div>

      <E9Panel
        title={`Reprints & Extras · ${data.reprints.length}`}
        action={
          canEdit && !adding ? (
            <SmallButton onClick={() => setAdding(true)}>
              <AddOutline className="size-3.5" /> Add reprint / extra
            </SmallButton>
          ) : undefined
        }
      >
        <p className="border-b border-subtle px-5 py-2 text-body-2xs-regular text-tertiary">
          Pick the item code: scope, BOQ No., size and unit fill themselves. Only one tile went wrong? Type the tile
          width in “Reprint W” and the number of tiles in “Pieces”. Qty works itself out.
        </p>
        {adding && (
          <div className="grid grid-cols-1 items-end gap-3 border-b border-subtle bg-layer-1 p-4 sm:grid-cols-5">
            <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary">
              Item code
              <select
                className="h-9 rounded-lg border border-subtle bg-surface-1 px-2 text-body-sm-regular text-primary"
                value={draft.item}
                onChange={(e) => setDraft({ ...draft, item: e.target.value })}
              >
                <option value="">Choose…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.item_code} · {item.floor_area || item.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary">
              Type
              <select
                className="h-9 rounded-lg border border-subtle bg-surface-1 px-2 text-body-sm-regular text-primary"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                <option value="reprint">Reprint</option>
                <option value="extra">Extra (Amended PO)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary">
              Caused by
              <select
                className="h-9 rounded-lg border border-subtle bg-surface-1 px-2 text-body-sm-regular text-primary"
                value={draft.cause}
                onChange={(e) => setDraft({ ...draft, cause: e.target.value })}
              >
                <option value="e9">E9</option>
                <option value="client">Client</option>
                <option value="site">Site</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary">
              Reason
              <select
                className="h-9 rounded-lg border border-subtle bg-surface-1 px-2 text-body-sm-regular text-primary"
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              >
                <option value="">—</option>
                {reasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={() => setAdding(false)} />
              <Button variant="primary" size="md" stretch="auto" label="Add" onClick={create} />
            </div>
          </div>
        )}
        {data.reprints.length === 0 && !adding ? (
          <p className="px-5 py-10 text-center text-body-sm-regular text-tertiary">
            No reprints or extras yet.{canEdit ? " Click “Add reprint / extra”." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2300px] text-left text-body-xs-regular">
              <thead>
                <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                  {[
                    "#",
                    "Date",
                    "Item",
                    "Scope",
                    "Item description",
                    "BOQ No.",
                    "Type",
                    "Caused by",
                    "Reason",
                    "Description",
                    "Pieces",
                    "Orig. H",
                    "Orig. W",
                    "Reprint H (tile)",
                    "Reprint W (tile)",
                    "Size used",
                    "Qty (BOQ unit)",
                    "JC No.",
                    "Vendor",
                    "Approved by client?",
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
                {data.reprints.map((row, index) => {
                  const billable = row.kind === "reprint" && row.cause === "client";
                  return (
                    <tr key={row.id} className={cn(row.kind === "reprint" && !billable && "bg-danger-subtle/30")}>
                      <td className="px-2 py-1.5 text-tertiary tabular-nums">{data.reprints.length - index}</td>
                      <td className="w-32 px-1 py-1">
                        <DateCell
                          label="Date"
                          value={row.reprint_date}
                          disabled={!canEdit}
                          onSave={(v) => patch(row, { reprint_date: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {row.item_code ? (
                          <ItemLink
                            slug={workspaceSlug}
                            projectId={project.id}
                            scope={row.scope}
                            code={row.item_code}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{row.scope_label || "—"}</td>
                      <td className="max-w-[180px] truncate px-2 py-1.5" title={row.item_description}>
                        {row.item_description || "—"}
                      </td>
                      <td className="px-2 py-1.5 font-semibold">{row.line_no || "—"}</td>
                      <td className="w-36 px-1 py-1">
                        <select
                          aria-label="Type"
                          className={selectClass}
                          value={row.kind}
                          disabled={!canEdit}
                          onChange={(e) => patch(row, { kind: e.target.value })}
                        >
                          {Object.entries(KIND_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="w-24 px-1 py-1">
                        <select
                          aria-label="Caused by"
                          className={cn(selectClass, billable && "font-semibold text-accent-primary")}
                          value={row.cause}
                          disabled={!canEdit}
                          onChange={(e) => patch(row, { cause: e.target.value })}
                        >
                          {Object.entries(CAUSE_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="w-48 px-1 py-1">
                        <select
                          aria-label="Reason"
                          className={selectClass}
                          value={row.reason}
                          disabled={!canEdit}
                          onChange={(e) => patch(row, { reason: e.target.value })}
                        >
                          <option value="">—</option>
                          {[...new Set([...reasons, row.reason].filter(Boolean))].map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="w-48 px-1 py-1">
                        <TextCell
                          label="Description"
                          value={row.description}
                          placeholder="What went wrong"
                          disabled={!canEdit}
                          onSave={(v) => patch(row, { description: v })}
                        />
                      </td>
                      <td className="w-20 px-1 py-1">
                        <NumberCell
                          label="Pieces"
                          value={row.pieces}
                          disabled={!canEdit}
                          onSave={(v) => patch(row, { pieces: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-tertiary tabular-nums">
                        {row.original_height_in ? fmt(row.original_height_in) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right text-tertiary tabular-nums">
                        {row.original_width_in ? fmt(row.original_width_in) : "—"}
                      </td>
                      <td className="w-24 px-1 py-1">
                        <NumberCell
                          label="Reprint height"
                          value={row.reprint_height_in}
                          disabled={!canEdit}
                          onSave={(v) => patch(row, { reprint_height_in: v })}
                        />
                      </td>
                      <td className="w-24 px-1 py-1">
                        <NumberCell
                          label="Reprint width"
                          value={row.reprint_width_in}
                          disabled={!canEdit}
                          onSave={(v) => patch(row, { reprint_width_in: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-tertiary">{row.size_used || "no size"}</td>
                      <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap tabular-nums">
                        {fmt(row.qty)} <span className="font-normal text-tertiary">{unitText(row.unit)}</span>
                      </td>
                      <td className="w-28 px-1 py-1">
                        <TextCell
                          label="JC No."
                          value={row.jc_no}
                          disabled={!canEdit}
                          onSave={(v) => patch(row, { jc_no: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-tertiary">{row.vendor || "—"}</td>
                      <td className="w-28 px-1 py-1">
                        <select
                          aria-label="Approved by client"
                          className={selectClass}
                          value={row.approved}
                          disabled={!canEdit}
                          onChange={(e) => patch(row, { approved: e.target.value })}
                        >
                          <option value="">—</option>
                          <option value="Yes">Yes</option>
                          <option value="Pending">Pending</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      <td className="w-48 px-1 py-1">
                        <TextCell
                          label="Remarks"
                          value={row.remarks}
                          disabled={!canEdit}
                          onSave={(v) => patch(row, { remarks: v })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {canEdit && (
                          <SmallButton
                            tone="danger"
                            onClick={async () => {
                              if (!(await e9Confirm(`Delete this ${KIND_LABEL[row.kind].toLowerCase()}?`))) return;
                              void send("Couldn't delete", () =>
                                e9ProjectService.boqDelete(workspaceSlug, project.id, "reprints", row.id)
                              );
                            }}
                          >
                            ✕
                          </SmallButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-subtle px-5 py-2 text-body-2xs-regular text-tertiary">
          Light red = our reprint (E9 / site): not billed and not counted as extra over the BOQ. Caused by Client =
          billable, added to what can be certified. The tracker shows “Reprint x1” in its Re-sent column.
        </p>
      </E9Panel>
    </div>
  );
}
