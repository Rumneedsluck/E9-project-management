/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { CloseOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { cn, renderFormattedDate } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { inputClass, showError } from "./commercial/shared";
import { useE9Announcements } from "./hooks";
import { e9Confirm } from "./confirm";

/** Team notices. Everyone reads them; workspace admins post and remove them. */
export function E9Announcements({
  workspaceSlug,
  allowPosting = false,
  limit,
  className,
}: {
  workspaceSlug: string;
  /** show the "post an announcement" box to admins */
  allowPosting?: boolean;
  limit?: number;
  className?: string;
}) {
  const { data, mutate } = useE9Announcements(workspaceSlug);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = data?.announcements ?? [];
  const shown = limit ? rows.slice(0, limit) : rows;
  const canPost = allowPosting && !!data?.can_post;
  if (!data || (rows.length === 0 && !canPost)) return null;

  const post = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await mutate(
        e9ProjectService.postAnnouncement(workspaceSlug, { title, body, important, ends_on: endsOn || null }),
        { revalidate: false }
      );
      setTitle("");
      setBody("");
      setEndsOn("");
      setImportant(false);
      setOpen(false);
    } catch (error) {
      showError("Couldn't post the announcement", error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await e9Confirm("Remove this announcement for everyone?"))) return;
    try {
      await mutate(e9ProjectService.deleteAnnouncement(workspaceSlug, id), { revalidate: false });
    } catch (error) {
      showError("Couldn't remove it", error);
    }
  };

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-body-xs-semibold tracking-[0.14em] text-tertiary uppercase">Announcements</h2>
        {canPost && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-body-xs-semibold text-accent-primary hover:underline"
          >
            + Post
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-subtle bg-surface-1 p-4">
          <input
            className={inputClass}
            placeholder="Title, e.g. Site visit at Jaipur on Friday"
            value={title}
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            className={cn(inputClass, "h-20 py-2")}
            placeholder="Details (optional)"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-body-xs-medium text-secondary">
              Show until
              <input
                type="date"
                className={cn(inputClass, "w-auto")}
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-body-xs-medium text-secondary">
              <input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} />
              Important (shown in red, on top)
            </label>
            <div className="ml-auto flex gap-2">
              <Button stretch="auto" variant="secondary" size="sm" label="Cancel" onClick={() => setOpen(false)} />
              <Button
                stretch="auto"
                variant="primary"
                size="sm"
                label="Post"
                onClick={post}
                loading={busy}
                disabled={!title.trim()}
              />
            </div>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-body-sm-regular text-tertiary">No announcements right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <li
              key={row.id}
              className={cn(
                "group flex items-start gap-3 rounded-xl border bg-surface-1 px-4 py-3",
                row.important ? "border-danger-subtle" : "border-subtle"
              )}
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  row.important ? "bg-[var(--brand-default)]" : "bg-layer-3"
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("text-body-sm-semibold", row.important ? "text-danger-primary" : "text-primary")}>
                  {row.title}
                </span>
                {row.body && <p className="text-body-xs-regular whitespace-pre-line text-secondary">{row.body}</p>}
                <span className="text-body-2xs-regular text-tertiary">
                  {[row.author, renderFormattedDate(row.created_at)].filter(Boolean).join(" · ")}
                  {row.ends_on ? ` · until ${renderFormattedDate(row.ends_on)}` : ""}
                </span>
              </div>
              {data.can_post && (
                <button
                  type="button"
                  aria-label={`Remove ${row.title}`}
                  onClick={() => remove(row.id)}
                  className="grid size-6 place-items-center rounded text-tertiary opacity-0 group-hover:opacity-100 hover:text-danger-primary focus:opacity-100"
                >
                  <CloseOutline className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
