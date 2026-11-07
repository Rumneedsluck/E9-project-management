/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { AddOutline, CloseOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { cn, renderFormattedDate } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { useE9Documents, useE9History, useE9Items } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import { E9Panel } from "../ui";
import type { TE9Attachment } from "./logic";
import { E9HistoryList, uploadFiles } from "./photos-history";
import { e9Confirm } from "../confirm";

const inputClass =
  "h-9 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-body-sm-regular text-primary outline-none focus:border-accent-strong";

const errorText = (error: unknown) =>
  error && typeof error === "object"
    ? Object.values(error as Record<string, unknown>)
        .flat()
        .join(" ")
    : "Please try again.";

const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type TProps = { workspaceSlug: string; projectId: string };

/** Site audit reports: one row per visit, with Draft / Final and the date it went to pre-press. */
export function E9SiteAuditPanel({ workspaceSlug, projectId }: TProps) {
  const { data: docs, mutate } = useE9Documents(workspaceSlug, projectId);
  const { data: items } = useE9Items(workspaceSlug, projectId);
  const canEdit = !!items?.can_edit;
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [version, setVersion] = useState<"" | "Draft" | "Final">("Draft");
  const [sentOn, setSentOn] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setAdding(false);
    setLabel("");
    setVersion("Draft");
    setSentOn("");
    setLink("");
    setFile(null);
  };

  const save = async () => {
    if (!file && !link.trim()) {
      setToast({ type: "error", title: "Add a PDF or a link", message: "Choose the report file, or paste its link." });
      return;
    }
    setBusy(true);
    try {
      const extra: Record<string, string> = { kind: "site_audit", label: label.trim(), version };
      if (sentOn) extra.sent_on = sentOn;
      if (link.trim()) extra.link = link.trim();
      if (!file) extra.name = label.trim() || "Site audit report";
      await uploadFiles(workspaceSlug, projectId, file ? [file] : [], extra);
      await mutate();
      reset();
    } catch (error) {
      setToast({ type: "error", title: "Couldn't save", message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const change = async (doc: TE9Attachment, data: Partial<TE9Attachment>) => {
    try {
      await e9ProjectService.updateAttachment(workspaceSlug, projectId, doc.id, data);
      await mutate();
    } catch (error) {
      setToast({ type: "error", title: "Couldn't save", message: errorText(error) });
    }
  };

  const remove = async (doc: TE9Attachment) => {
    if (!(await e9Confirm(`Delete ${doc.label || doc.name || "this report"}?`))) return;
    await e9ProjectService.deleteAttachment(workspaceSlug, projectId, doc.id);
    await mutate();
  };

  const list = docs ?? [];

  return (
    <E9Panel
      title={`Site audit reports · ${list.length}`}
      action={
        canEdit && !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-body-xs-semibold text-accent-primary hover:underline"
          >
            <AddOutline className="size-3.5" /> Add report
          </button>
        ) : undefined
      }
    >
      {adding && (
        <div className="grid grid-cols-1 gap-3 border-b border-subtle bg-layer-1 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary">
            Visit / name
            <input
              className={inputClass}
              value={label}
              placeholder="Visit 2 – 4th floor"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary">
            Draft or Final
            <select
              className={inputClass}
              value={version}
              onChange={(event) => setVersion(event.target.value as "" | "Draft" | "Final")}
            >
              <option value="Draft">Draft</option>
              <option value="Final">Final</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary">
            Sent to pre-press on
            <input
              type="date"
              className={inputClass}
              value={sentOn}
              onChange={(event) => setSentOn(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary">
            PDF file
            <input
              type="file"
              accept="application/pdf,image/*"
              className="text-body-xs-regular text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-layer-3 file:px-3 file:py-1.5 file:text-body-xs-semibold file:text-primary"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="flex flex-col gap-1 text-body-xs-medium text-tertiary sm:col-span-2">
            …or a link (Google Drive etc.)
            <input
              className={inputClass}
              value={link}
              placeholder="https://"
              onChange={(event) => setLink(event.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button stretch="auto" size="md" variant="secondary" label="Cancel" onClick={reset} />
            <Button
              stretch="auto"
              size="md"
              variant="primary"
              label={busy ? "Saving…" : "Save report"}
              disabled={busy}
              onClick={save}
            />
          </div>
        </div>
      )}
      {list.length === 0 && !adding ? (
        <p className="px-5 py-8 text-center text-body-sm-regular text-tertiary">
          No site audit reports yet{canEdit ? " — click “Add report” to upload the PDF." : "."}
        </p>
      ) : (
        <ul className="divide-y divide-subtle">
          {list.map((doc) => {
            const href = doc.has_file ? e9ProjectService.fileUrl(workspaceSlug, projectId, doc.id) : doc.link;
            return (
              <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-body-sm-semibold text-accent-primary hover:underline"
                    >
                      {doc.label || doc.name || "Site audit report"}
                    </a>
                  ) : (
                    <span className="truncate text-body-sm-semibold text-primary">{doc.label || doc.name}</span>
                  )}
                  <span className="truncate text-body-2xs-regular text-tertiary">
                    {[
                      doc.has_file ? `${doc.name} · ${sizeText(doc.size)}` : doc.name !== doc.label ? doc.name : "",
                      `Added ${renderFormattedDate(doc.created_at) ?? ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <select
                  aria-label="Draft or Final"
                  disabled={!canEdit}
                  value={doc.version}
                  onChange={(event) => change(doc, { version: event.target.value as "" | "Draft" | "Final" })}
                  className={cn(
                    "h-8 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-semibold",
                    doc.version === "Final" ? "text-success-primary" : "text-warning-primary"
                  )}
                >
                  <option value="">—</option>
                  <option value="Draft">Draft</option>
                  <option value="Final">Final</option>
                </select>
                <label className="flex items-center gap-2 text-body-2xs-medium text-tertiary">
                  To pre-press
                  <input
                    type="date"
                    disabled={!canEdit}
                    value={doc.sent_on ?? ""}
                    onChange={(event) => change(doc, { sent_on: event.target.value || null })}
                    className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary tabular-nums"
                  />
                </label>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Delete ${doc.label || doc.name}`}
                    onClick={() => remove(doc)}
                    className="grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-1-hover hover:text-danger-primary"
                  >
                    <CloseOutline className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </E9Panel>
  );
}

/** The whole project's change history, visible to everyone on the project. */
export function E9ProjectHistory({ workspaceSlug, projectId }: TProps) {
  const { data, error, isLoading, mutate } = useE9History(workspaceSlug, projectId);
  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm-regular text-tertiary">
        Every change on this project — who made it and when. Newest first. Use the clock button on a tracker row to see
        one item&apos;s history.
      </p>
      <E9HistoryList changes={data} />
    </div>
  );
}
