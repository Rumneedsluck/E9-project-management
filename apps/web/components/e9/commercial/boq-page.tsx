/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import { AddOutline, EditOutline, NewTabArrowOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { cn, renderFormattedDate } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import type { TE9BoqKind } from "@/services/e9/project.service";
import { e9BillsKey, e9SummaryKey, useE9Boq, useE9Scopes } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import { NumberCell, TextCell } from "../tracker/cells";
import { E9Modal } from "../tracker/modal";
import {
  E9RefFiles,
  FormField,
  ItemLink,
  STATUS_META,
  SmallButton,
  StatusPill,
  fmt,
  inputClass,
  isPositive,
  money,
  showError,
  trackerHref,
  unitText,
} from "./shared";
import type { TE9Amendment, TE9Boq, TE9BoqLine, TE9PO } from "./types";

type Props = { workspaceSlug: string; project: TE9Project };

type TModal =
  | { type: "po"; po?: TE9PO }
  | { type: "line"; poId: string; line?: TE9BoqLine; amendmentId?: string }
  | { type: "amendment"; po: TE9PO; amendment?: TE9Amendment }
  | null;

const AMENDMENT_TEXT: Record<TE9Amendment["status"], { label: string; className: string }> = {
  requested: { label: "Mail received – waiting for confirmation", className: "bg-warning-subtle text-warning-primary" },
  confirmed: { label: "Confirmed – amended BOQ / PO", className: "bg-success-subtle text-success-primary" },
  rejected: { label: "Not going ahead", className: "bg-layer-2 text-tertiary" },
};

export function E9BoqPage({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Boq(workspaceSlug, project.id);
  const { data: scopes } = useE9Scopes(workspaceSlug, project.id);
  const [modal, setModal] = useState<TModal>(null);
  const scopeLabel = (key: string) => scopes?.find((scope) => scope.key === key)?.label ?? "";

  /** Send a change, show the new BOQ, and refresh what depends on it. */
  const send = async (title: string, request: () => Promise<TE9Boq>) => {
    try {
      const next = await request();
      await mutate(next, { revalidate: false });
      void globalMutate(e9BillsKey(workspaceSlug, project.id));
      void globalMutate(e9SummaryKey(workspaceSlug));
      return true;
    } catch (problem) {
      showError(title, problem);
      return false;
    }
  };
  const remove = (kind: TE9BoqKind, id: string, what: string) => {
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
    void send(`Couldn't delete ${what}`, () => e9ProjectService.boqDelete(workspaceSlug, project.id, kind, id));
  };

  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  /** Add blank BOQ lines (BO next numbers) straight into the sheet. */
  const quickAdd = async (poId: string, count: number) => {
    const used = data.lines.map((line) => Number(line.line_no.replace(/\D/g, ""))).filter(Number.isFinite);
    let next = used.length ? Math.max(...used) + 1 : 1;
    for (let index = 0; index < count; index += 1) {
      const ok = await send("Couldn't add the line", () =>
        e9ProjectService.boqCreate(workspaceSlug, project.id, "lines", {
          po: poId,
          line_no: `BO${next}`,
          unit: "nos",
          qty: "0",
        })
      );
      if (!ok) break;
      next += 1;
    }
  };
  const patchLine = (line: TE9BoqLine, patch: object) =>
    send(`Couldn't save ${line.line_no}`, () =>
      e9ProjectService.boqUpdate(workspaceSlug, project.id, "lines", line.id, patch)
    );
  const startBoq = async () => {
    const ok = await send("Couldn't start the BOQ", () =>
      e9ProjectService.boqCreate(workspaceSlug, project.id, "pos", { kind: "original" })
    );
    if (ok) {
      const fresh = await e9ProjectService.getBoq(workspaceSlug, project.id);
      const po = fresh.pos[0];
      if (po) await quickAdd(po.id, 3);
    }
  };

  const linesByPo = (poId: string) => data.lines.filter((line) => line.po === poId);
  const linkedGroups = data.unlinked.filter((group) => !group.missing);
  const missing = data.unlinked.find((group) => group.missing);

  return (
    <div className="flex flex-col gap-4">
      {/* Alerts */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AlertTile
          tone={data.totals.excess_lines ? "danger" : "ok"}
          value={data.totals.excess_lines}
          label="BOQ lines over the BOQ, not approved"
          hint="Production on the tracker is more than allowed. Get a client mail and add an amendment."
        />
        <AlertTile
          tone={data.totals.pending_lines ? "warning" : "ok"}
          value={data.totals.pending_lines}
          label="Waiting for client confirmation"
          hint="Covered by a mail, but the amended BOQ / PO is not confirmed yet."
        />
        <AlertTile
          tone={data.totals.unlinked_items ? "danger" : "ok"}
          value={data.totals.unlinked_items}
          label="Tracker rows not on the BOQ"
          hint="Their BOQ No. is blank or not in this BOQ."
        />
      </div>

      {(linkedGroups.length > 0 || missing) && (
        <section className="flex flex-col gap-2 rounded-xl border border-[var(--border-color-danger-strong)] bg-danger-subtle/40 p-4">
          <p className="text-body-sm-semibold text-danger-primary">Tracker rows that are not covered by the BOQ</p>
          {linkedGroups.map((group) => (
            <div key={group.boq_no} className="flex flex-wrap items-center gap-1.5 text-body-xs-regular text-secondary">
              <span className="font-semibold text-primary">BOQ No. “{group.boq_no}” is not on the BOQ:</span>
              {group.items.map((item) => (
                <ItemLink
                  key={item.id}
                  slug={workspaceSlug}
                  projectId={project.id}
                  scope={item.scope}
                  code={item.code}
                />
              ))}
            </div>
          ))}
          {missing && (
            <div className="flex flex-wrap items-center gap-1.5 text-body-xs-regular text-secondary">
              <span className="font-semibold text-primary">No BOQ No. typed ({missing.count}):</span>
              {missing.items.slice(0, 30).map((item) => (
                <ItemLink
                  key={item.id}
                  slug={workspaceSlug}
                  projectId={project.id}
                  scope={item.scope}
                  code={item.code}
                />
              ))}
              {missing.count > 30 && <span>+{missing.count - 30} more</span>}
            </div>
          )}
        </section>
      )}

      {data.pos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-strong bg-surface-1 px-6 py-12 text-center">
          <p className="text-body-md-semibold text-primary">No BOQ yet</p>
          <p className="max-w-lg text-body-sm-regular text-tertiary">
            Type the client&apos;s BOQ here like a sheet: BO1, BO2… with description, unit and quantity. Tracker rows
            count against a line through their BOQ No. (“Import from Excel” on the Tracker also reads your BOQ sheet.)
          </p>
          {data.can_edit && (
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              icon={<AddOutline className="size-4" />}
              label="Start the BOQ"
              onClick={startBoq}
            />
          )}
        </div>
      ) : (
        <>
          {data.pos.map((po) => (
            <POCard
              key={po.id}
              po={po}
              lines={linesByPo(po.id)}
              canEdit={data.can_edit}
              slug={workspaceSlug}
              projectId={project.id}
              scopeLabel={scopeLabel}
              onEdit={() => setModal({ type: "po", po })}
              onDelete={() => remove("pos", po.id, po.label)}
              onAddLine={(amendmentId) => setModal({ type: "line", poId: po.id, amendmentId })}
              onQuickAdd={(count) => quickAdd(po.id, count)}
              onPatchLine={patchLine}
              scopes={(scopes ?? []).map((scope) => ({ key: scope.key, label: scope.label, unit: scope.unit_mode }))}
              onEditLine={(line) => setModal({ type: "line", poId: po.id, line })}
              onDeleteLine={(line) => remove("lines", line.id, line.line_no)}
              onAddAmendment={() => setModal({ type: "amendment", po })}
              onEditAmendment={(amendment) => setModal({ type: "amendment", po, amendment })}
              onDeleteAmendment={(amendment) =>
                remove("amendments", amendment.id, amendment.reference || "this amendment")
              }
              onConfirmAmendment={(amendment) =>
                send("Couldn't confirm", () =>
                  e9ProjectService.boqUpdate(workspaceSlug, project.id, "amendments", amendment.id, {
                    status: "confirmed",
                  })
                )
              }
            />
          ))}
          {data.can_edit && (
            <div>
              <Button
                variant="secondary"
                size="md"
                stretch="auto"
                icon={<AddOutline className="size-4" />}
                label="Add a new PO"
                onClick={() => setModal({ type: "po" })}
              />
            </div>
          )}
        </>
      )}

      {modal?.type === "po" && (
        <POModal
          po={modal.po}
          onClose={() => setModal(null)}
          onSave={(body) =>
            send("Couldn't save the PO", () =>
              modal.po
                ? e9ProjectService.boqUpdate(workspaceSlug, project.id, "pos", modal.po.id, body)
                : e9ProjectService.boqCreate(workspaceSlug, project.id, "pos", body)
            )
          }
        />
      )}
      {modal?.type === "line" && (
        <LineModal
          boq={data}
          poId={modal.poId}
          line={modal.line}
          amendmentId={modal.amendmentId}
          scopes={(scopes ?? []).map((scope) => ({ key: scope.key, label: scope.label, unit: scope.unit_mode }))}
          onClose={() => setModal(null)}
          onSave={(body) =>
            send("Couldn't save the BOQ line", () =>
              modal.line
                ? e9ProjectService.boqUpdate(workspaceSlug, project.id, "lines", modal.line.id, body)
                : e9ProjectService.boqCreate(workspaceSlug, project.id, "lines", body)
            )
          }
        />
      )}
      {modal?.type === "amendment" && (
        <AmendmentModal
          po={modal.po}
          amendment={modal.amendment}
          lines={linesByPo(modal.po.id).filter((line) => line.amendment !== modal.amendment?.id || !modal.amendment)}
          slug={workspaceSlug}
          projectId={project.id}
          onClose={() => setModal(null)}
          onSave={(body) =>
            send("Couldn't save the amendment", () =>
              modal.amendment
                ? e9ProjectService.boqUpdate(workspaceSlug, project.id, "amendments", modal.amendment.id, body)
                : e9ProjectService.boqCreate(workspaceSlug, project.id, "amendments", body)
            )
          }
        />
      )}
    </div>
  );
}

function AlertTile({
  tone,
  value,
  label,
  hint,
}: {
  tone: "danger" | "warning" | "ok";
  value: number;
  label: string;
  hint: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-4",
        tone === "danger" && "border-[var(--border-color-danger-strong)] bg-danger-subtle/50",
        tone === "warning" && "border-[var(--border-color-warning-strong,#f59e0b)] bg-warning-subtle/50",
        tone === "ok" && "border-subtle bg-surface-1"
      )}
    >
      <span
        className={cn(
          "text-h4-semibold tabular-nums",
          tone === "danger" && "text-danger-primary",
          tone === "warning" && "text-warning-primary",
          tone === "ok" && "text-success-primary"
        )}
      >
        {value}
      </span>
      <span className="text-body-sm-semibold text-primary">{label}</span>
      <span className="text-body-2xs-regular text-tertiary">{hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One PO with its lines and amendments
// ---------------------------------------------------------------------------

type TPOCardProps = {
  po: TE9PO;
  lines: TE9BoqLine[];
  canEdit: boolean;
  slug: string;
  projectId: string;
  scopeLabel: (key: string) => string;
  onEdit: () => void;
  onDelete: () => void;
  onAddLine: (amendmentId?: string) => void;
  onQuickAdd: (count: number) => void;
  onPatchLine: (line: TE9BoqLine, patch: object) => void;
  scopes: { key: string; label: string; unit: string }[];
  onEditLine: (line: TE9BoqLine) => void;
  onDeleteLine: (line: TE9BoqLine) => void;
  onAddAmendment: () => void;
  onEditAmendment: (amendment: TE9Amendment) => void;
  onDeleteAmendment: (amendment: TE9Amendment) => void;
  onConfirmAmendment: (amendment: TE9Amendment) => void;
};

const HEADINGS = [
  "BOQ No.",
  "Description",
  "Status",
  "Unit",
  "BOQ qty",
  "Amended (+)",
  "Waiting mail",
  "Allowed",
  "On tracker",
  "Over BOQ",
  "Installed",
  "Reprints (ours)",
  "Reprints (client)",
  "Rate",
];

function POCard(props: TPOCardProps) {
  const { po, lines, canEdit, slug, projectId, scopeLabel } = props;
  return (
    <E9Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-body-2xs-semibold uppercase",
              po.kind === "original" ? "bg-layer-2 text-secondary" : "bg-accent-subtle text-accent-primary"
            )}
          >
            {po.kind === "original" ? "Original BOQ / PO" : "New PO"}
          </span>
          {po.title}
          {po.number && <span className="text-body-xs-regular text-tertiary">PO no. {po.number}</span>}
          {po.po_date && (
            <span className="text-body-xs-regular text-tertiary">· {renderFormattedDate(po.po_date)}</span>
          )}
        </span>
      }
      action={
        canEdit ? (
          <span className="flex gap-1">
            <SmallButton onClick={() => props.onQuickAdd(1)}>
              <AddOutline className="size-3.5" /> Add line
            </SmallButton>
            <SmallButton onClick={() => props.onQuickAdd(5)}>Add 5 lines</SmallButton>
            <SmallButton onClick={props.onAddAmendment}>
              <AddOutline className="size-3.5" /> Amendment (client mail)
            </SmallButton>
            <SmallButton tone="neutral" onClick={props.onEdit}>
              <EditOutline className="size-3.5" /> Edit
            </SmallButton>
            <SmallButton tone="danger" onClick={props.onDelete}>
              Delete
            </SmallButton>
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-5 py-2 text-body-xs-regular text-tertiary">
        <span>PO / BOQ document:</span>
        <E9RefFiles slug={slug} projectId={projectId} kind="po" refId={po.id} canUpload={canEdit} />
        {po.link && (
          <a
            href={po.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent-primary"
          >
            Open link <NewTabArrowOutline className="size-3" />
          </a>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1320px] text-left text-body-xs-regular">
          <thead>
            <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
              {HEADINGS.map((heading, index) => (
                <th key={heading} className={cn("px-3 py-2.5 font-semibold", index >= 4 && "text-right")}>
                  {heading}
                </th>
              ))}
              <th className="w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle text-primary">
            {lines.length === 0 && (
              <tr>
                <td colSpan={16} className="px-5 py-6 text-center text-tertiary">
                  No lines yet. {canEdit ? "Click “+ Add line” and type straight into the row." : ""}
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id} className={STATUS_META[line.status].row}>
                <td className="px-3 py-2.5 font-semibold whitespace-nowrap">
                  {canEdit ? (
                    <span className="block w-20">
                      <TextCell
                        label="BOQ No."
                        value={line.line_no}
                        onSave={(value) => value && props.onPatchLine(line, { line_no: value.toUpperCase() })}
                      />
                    </span>
                  ) : (
                    line.line_no
                  )}
                  {line.amendment && (
                    <span className="ml-1 rounded bg-layer-2 px-1 text-body-2xs-medium text-tertiary">amendment</span>
                  )}
                </td>
                <td className="max-w-[300px] min-w-[220px] px-3 py-2.5">
                  {canEdit ? (
                    <>
                      <TextCell
                        label="Description"
                        value={line.description}
                        placeholder="e.g. Printed vinyl wall graphics"
                        onSave={(value) => props.onPatchLine(line, { description: value })}
                      />
                      <select
                        aria-label="Scope"
                        className="mt-0.5 h-7 w-full rounded-md bg-transparent px-1.5 text-body-2xs-regular text-tertiary hover:bg-layer-1-hover"
                        value={line.scope}
                        onChange={(event) => {
                          const chosen = props.scopes.find((scope) => scope.key === event.target.value);
                          props.onPatchLine(line, {
                            scope: event.target.value,
                            ...(chosen && chosen.unit !== "either" ? { unit: chosen.unit } : {}),
                          });
                        }}
                      >
                        <option value="">Scope: —</option>
                        {props.scopes.map((scope) => (
                          <option key={scope.key} value={scope.key}>
                            {scope.label}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <span className="line-clamp-2">{line.description || "—"}</span>
                      {line.scope && (
                        <span className="text-body-2xs-regular text-tertiary">{scopeLabel(line.scope)}</span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill status={line.status} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {canEdit ? (
                    <select
                      aria-label="Unit"
                      className="h-8 rounded-md bg-transparent px-1.5 text-body-xs-regular hover:bg-layer-1-hover"
                      value={line.unit}
                      onChange={(event) => props.onPatchLine(line, { unit: event.target.value })}
                    >
                      <option value="sqft">sq ft</option>
                      <option value="nos">Nos</option>
                    </select>
                  ) : (
                    unitText(line.unit)
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {canEdit ? (
                    <span className="ml-auto block w-24">
                      <NumberCell
                        label="BOQ qty"
                        value={line.qty}
                        onSave={(value) => props.onPatchLine(line, { qty: value ?? "0" })}
                      />
                    </span>
                  ) : (
                    fmt(line.qty)
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-success-primary tabular-nums">
                  {isPositive(line.confirmed_change) ? `+${fmt(line.confirmed_change)}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-warning-primary tabular-nums">
                  {isPositive(line.pending) ? `+${fmt(line.pending)}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{fmt(line.allowed)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {line.item_ids.length > 0 ? (
                    <Link
                      href={trackerHref(slug, projectId, line.scope, line.line_no)}
                      className="font-semibold text-primary underline decoration-dotted underline-offset-2 hover:text-accent-primary"
                      title={`${line.item_ids.length} tracker row(s) – open them`}
                    >
                      {fmt(line.on_tracker)}
                    </Link>
                  ) : (
                    <span className="text-placeholder">0</span>
                  )}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-semibold tabular-nums",
                    line.status === "excess" && "text-danger-primary",
                    line.status === "pending" && "text-warning-primary"
                  )}
                >
                  {isPositive(line.extra) ? `+${fmt(line.extra)}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(line.installed)}</td>
                <td className="px-3 py-2.5 text-right text-tertiary tabular-nums">
                  {isPositive(line.internal_reprints) ? fmt(line.internal_reprints) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {isPositive(line.client_reprints) ? fmt(line.client_reprints) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {canEdit ? (
                    <span className="ml-auto block w-24" title="Rate ₹ per sq ft / per Nos (optional)">
                      <NumberCell
                        label="Rate"
                        value={line.rate}
                        onSave={(value) => props.onPatchLine(line, { rate: value })}
                      />
                    </span>
                  ) : line.rate ? (
                    money(line.rate)
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {canEdit && (
                    <>
                      <SmallButton tone="neutral" onClick={() => props.onEditLine(line)}>
                        More
                      </SmallButton>
                      <SmallButton tone="danger" onClick={() => props.onDeleteLine(line)}>
                        ✕
                      </SmallButton>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {po.amendments.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-subtle px-5 py-4">
          <h3 className="text-body-xs-semibold tracking-wide text-tertiary uppercase">
            Amendments (client mails) · {po.amendments.length}
          </h3>
          {po.amendments.map((amendment) => (
            <div
              key={amendment.id}
              className="flex flex-col gap-2 rounded-lg border border-subtle bg-layer-1 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm-semibold text-primary">{amendment.reference || "Amendment"}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-body-2xs-semibold",
                      AMENDMENT_TEXT[amendment.status].className
                    )}
                  >
                    {AMENDMENT_TEXT[amendment.status].label}
                  </span>
                </span>
                <span className="text-body-xs-regular text-secondary">
                  {[
                    ...amendment.changes.map(
                      (change) =>
                        `${change.line_no} ${Number(change.qty_change) > 0 ? "+" : ""}${fmt(change.qty_change)}`
                    ),
                    ...amendment.new_lines.map((lineNo) => `new line ${lineNo}`),
                  ].join(" · ") || "No quantities yet"}
                </span>
                <span className="text-body-2xs-regular text-tertiary">
                  {[
                    amendment.requested_on && `Mail received ${renderFormattedDate(amendment.requested_on)}`,
                    amendment.confirmed_on && `Confirmed ${renderFormattedDate(amendment.confirmed_on)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-body-2xs-regular text-tertiary">
                  Mail / approval:
                  <E9RefFiles
                    slug={slug}
                    projectId={projectId}
                    kind="mail"
                    refId={amendment.id}
                    canUpload={canEdit}
                    addText="Attach mail"
                  />
                  {amendment.mail_link && (
                    <a
                      href={amendment.mail_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-accent-primary"
                    >
                      Open mail link
                    </a>
                  )}
                </span>
              </div>
              {canEdit && (
                <span className="flex shrink-0 flex-wrap gap-1">
                  {amendment.status === "requested" && (
                    <SmallButton onClick={() => props.onConfirmAmendment(amendment)}>✓ Mark confirmed</SmallButton>
                  )}
                  <SmallButton onClick={() => props.onAddLine(amendment.id)}>
                    <AddOutline className="size-3.5" /> New line
                  </SmallButton>
                  <SmallButton tone="neutral" onClick={() => props.onEditAmendment(amendment)}>
                    Edit
                  </SmallButton>
                  <SmallButton tone="danger" onClick={() => props.onDeleteAmendment(amendment)}>
                    Delete
                  </SmallButton>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </E9Panel>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

function ModalFooter({
  onClose,
  onSave,
  busy,
  label,
}: {
  onClose: () => void;
  onSave: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <>
      <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
      <Button variant="primary" size="md" stretch="auto" label={label} loading={busy} onClick={onSave} />
    </>
  );
}

function useSaver(onSave: (body: object) => Promise<boolean>, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const save = async (body: object) => {
    setBusy(true);
    const ok = await onSave(body);
    setBusy(false);
    if (ok) onClose();
  };
  return { busy, save };
}

function POModal({
  po,
  onClose,
  onSave,
}: {
  po?: TE9PO;
  onClose: () => void;
  onSave: (body: object) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<TE9PO["kind"]>(po?.kind ?? "original");
  const [number, setNumber] = useState(po?.number ?? "");
  const [title, setTitle] = useState(po?.title ?? "");
  const [poDate, setPoDate] = useState(po?.po_date ?? "");
  const [link, setLink] = useState(po?.link ?? "");
  const { busy, save } = useSaver(onSave, onClose);
  return (
    <E9Modal
      open
      onClose={onClose}
      title={po ? "Edit PO" : "Add a BOQ / PO"}
      description="The original BOQ / PO, or a new PO for other work. Extra quantity on the same PO goes in an amendment."
      footer={
        <ModalFooter
          onClose={onClose}
          busy={busy}
          label="Save"
          onSave={() => save({ kind, number, title, po_date: poDate || null, link })}
        />
      }
    >
      <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
        <FormField label="Type">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as TE9PO["kind"])}>
            <option value="original">Original BOQ / PO</option>
            <option value="new">New PO (other work)</option>
          </select>
        </FormField>
        <FormField label="PO / work order no.">
          <input className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} />
        </FormField>
        <FormField label="Name" hint="Left empty: “Original BOQ / PO” or “New PO <no.>”">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="PO date">
          <input type="date" className={inputClass} value={poDate} onChange={(e) => setPoDate(e.target.value)} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField
            label="Link (optional)"
            hint="Not needed: the BOQ is typed on the BOQ tab. Attach the PO PDF there too if you like."
          >
            <input
              className={inputClass}
              value={link}
              placeholder="https://"
              onChange={(e) => setLink(e.target.value)}
            />
          </FormField>
        </div>
      </div>
    </E9Modal>
  );
}

function LineModal({
  boq,
  poId,
  line,
  amendmentId,
  scopes,
  onClose,
  onSave,
}: {
  boq: TE9Boq;
  poId: string;
  line?: TE9BoqLine;
  amendmentId?: string;
  scopes: { key: string; label: string; unit: string }[];
  onClose: () => void;
  onSave: (body: object) => Promise<boolean>;
}) {
  const nextNumber = useMemo(() => {
    const numbers = boq.lines.map((entry) => Number(entry.line_no.replace(/\D/g, ""))).filter(Number.isFinite);
    return `BO${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
  }, [boq.lines]);
  const [lineNo, setLineNo] = useState(line?.line_no ?? nextNumber);
  const [scope, setScope] = useState(line?.scope ?? "");
  const [description, setDescription] = useState(line?.description ?? "");
  const [unit, setUnit] = useState(line?.unit ?? "nos");
  const [qty, setQty] = useState(line ? String(Number(line.qty)) : "");
  const [rate, setRate] = useState(line?.rate ? String(Number(line.rate)) : "");
  const [remarks, setRemarks] = useState(line?.remarks ?? "");
  const { busy, save } = useSaver(onSave, onClose);
  const amendment = boq.pos
    .flatMap((po) => po.amendments)
    .find((entry) => entry.id === (amendmentId ?? line?.amendment));
  return (
    <E9Modal
      open
      onClose={onClose}
      title={line ? `Edit ${line.line_no}` : amendment ? "New line from an amendment" : "Add a BOQ line"}
      description={
        amendment
          ? `Part of “${amendment.reference || "amendment"}”: counts only once that amendment is confirmed.`
          : "Tracker rows with this BOQ No. are added up against the quantity."
      }
      footer={
        <ModalFooter
          onClose={onClose}
          busy={busy}
          label="Save line"
          onSave={() =>
            save({
              po: poId,
              ...(amendmentId ? { amendment: amendmentId } : {}),
              line_no: lineNo,
              scope,
              description,
              unit,
              qty: qty || "0",
              rate: rate || null,
              remarks,
            })
          }
        />
      }
    >
      <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
        <FormField label="BOQ Item No." hint="Type the same on the tracker rows (BOQ No. column).">
          <input className={inputClass} value={lineNo} onChange={(e) => setLineNo(e.target.value.toUpperCase())} />
        </FormField>
        <FormField label="Scope">
          <select
            className={inputClass}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              const chosen = scopes.find((entry) => entry.key === e.target.value);
              if (chosen && chosen.unit !== "either") setUnit(chosen.unit as "sqft" | "nos");
            }}
          >
            <option value="">—</option>
            {scopes.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Description">
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Unit">
          <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value as "sqft" | "nos")}>
            <option value="sqft">Sq Ft</option>
            <option value="nos">Nos</option>
          </select>
        </FormField>
        <FormField label="BOQ quantity">
          <input
            type="number"
            min={0}
            step="any"
            className={inputClass}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </FormField>
        <FormField label="Rate ₹ (optional)" hint="Per sq ft or per Nos. Used for the bill amount.">
          <input
            type="number"
            min={0}
            step="any"
            className={inputClass}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </FormField>
        <FormField label="Remarks">
          <input className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormField>
      </div>
    </E9Modal>
  );
}

function AmendmentModal({
  po,
  amendment,
  lines,
  slug,
  projectId,
  onClose,
  onSave,
}: {
  po: TE9PO;
  amendment?: TE9Amendment;
  lines: TE9BoqLine[];
  slug: string;
  projectId: string;
  onClose: () => void;
  onSave: (body: object) => Promise<boolean>;
}) {
  const [reference, setReference] = useState(amendment?.reference ?? "");
  const [status, setStatus] = useState<TE9Amendment["status"]>(amendment?.status ?? "requested");
  const [requestedOn, setRequestedOn] = useState(amendment?.requested_on ?? new Date().toISOString().slice(0, 10));
  const [confirmedOn, setConfirmedOn] = useState(amendment?.confirmed_on ?? "");
  const [mailLink, setMailLink] = useState(amendment?.mail_link ?? "");
  const [changes, setChanges] = useState<{ key: number; boq_line: string; qty_change: string }[]>(
    amendment?.changes.map((change, index) => ({
      key: index,
      boq_line: change.boq_line,
      qty_change: String(Number(change.qty_change)),
    })) ?? [{ key: 0, boq_line: lines.find((line) => line.status !== "ok")?.id ?? lines[0]?.id ?? "", qty_change: "" }]
  );
  const { busy, save } = useSaver(onSave, onClose);
  const setChange = (key: number, patch: Partial<{ boq_line: string; qty_change: string }>) =>
    setChanges((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <E9Modal
      open
      onClose={onClose}
      size="lg"
      title={amendment ? "Edit amendment" : `Amendment to ${po.label}`}
      description="The client asked for more by mail. Keep it “waiting” until they confirm; then the extra is approved."
      footer={
        <ModalFooter
          onClose={onClose}
          busy={busy}
          label="Save amendment"
          onSave={() =>
            save({
              po: po.id,
              reference,
              status,
              requested_on: requestedOn || null,
              confirmed_on: confirmedOn || null,
              mail_link: mailLink,
              changes: changes
                .filter((row) => row.boq_line && row.qty_change)
                .map(({ boq_line, qty_change }) => ({ boq_line, qty_change })),
            })
          }
        />
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Reference" hint="Amended PO no. or the mail subject">
            <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
          </FormField>
          <FormField label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as TE9Amendment["status"])}
            >
              <option value="requested">Mail received – waiting for confirmation</option>
              <option value="confirmed">Confirmed – amended BOQ / PO</option>
              <option value="rejected">Not going ahead</option>
            </select>
          </FormField>
          <FormField label="Mail received on">
            <input
              type="date"
              className={inputClass}
              value={requestedOn}
              onChange={(e) => setRequestedOn(e.target.value)}
            />
          </FormField>
          <FormField label="Confirmed on">
            <input
              type="date"
              className={inputClass}
              value={confirmedOn}
              onChange={(e) => setConfirmedOn(e.target.value)}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField
              label="Mail link (optional)"
              hint="Or attach the mail as a PDF / screenshot on the amendment after saving."
            >
              <input
                className={inputClass}
                value={mailLink}
                placeholder="https://mail.google.com/…"
                onChange={(e) => setMailLink(e.target.value)}
              />
            </FormField>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-body-xs-semibold text-primary">Extra quantity on existing lines</span>
          {lines.length === 0 && <p className="text-body-xs-regular text-tertiary">This PO has no lines yet.</p>}
          {changes.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <select
                className={cn(inputClass, "flex-1")}
                value={row.boq_line}
                onChange={(e) => setChange(row.key, { boq_line: e.target.value })}
              >
                <option value="">Choose a BOQ line</option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.line_no} · {line.description || "—"} (allowed {fmt(line.allowed)}, on tracker{" "}
                    {fmt(line.on_tracker)} {unitText(line.unit)})
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                aria-label="Extra quantity"
                className={cn(inputClass, "w-32")}
                placeholder="+5"
                value={row.qty_change}
                onChange={(e) => setChange(row.key, { qty_change: e.target.value })}
              />
              <SmallButton tone="danger" onClick={() => setChanges((rows) => rows.filter((r) => r.key !== row.key))}>
                ✕
              </SmallButton>
            </div>
          ))}
          <div>
            <SmallButton
              onClick={() =>
                setChanges((rows) => [...rows, { key: Date.now(), boq_line: lines[0]?.id ?? "", qty_change: "" }])
              }
            >
              <AddOutline className="size-3.5" /> Another line
            </SmallButton>
          </div>
          <p className="text-body-2xs-regular text-tertiary">
            Something completely new in the same mail? Save this, then click “+ New line” on the amendment.
          </p>
          {amendment && (
            <span className="flex flex-wrap items-center gap-2 text-body-xs-regular text-tertiary">
              Mail / approval files:
              <E9RefFiles
                slug={slug}
                projectId={projectId}
                kind="mail"
                refId={amendment.id}
                canUpload
                addText="Attach mail"
              />
            </span>
          )}
        </div>
      </div>
    </E9Modal>
  );
}
