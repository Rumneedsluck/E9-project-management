/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { AddOutline, CloseOutline } from "@makeplane/propel/icons";
import { setToast } from "@plane/blocks/toast";
import { cn, renderFormattedDate } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { useE9History, useE9Photos } from "../hooks";
import type { TE9PhotoKind } from "../hooks";
import type { TE9Attachment, TE9Change, TE9ScopeItem } from "./logic";
import { E9Modal } from "./modal";
import { e9Confirm } from "../confirm";
import { safeHref } from "../commercial/shared";

const errorText = (error: unknown) =>
  error && typeof error === "object"
    ? Object.values(error as Record<string, unknown>)
        .flat()
        .join(" ")
    : "Please try again.";

const isImage = (attachment: TE9Attachment) => attachment.content_type.startsWith("image/");

/** Upload files for an item or the project. Returns the created attachments. */
export async function uploadFiles(
  workspaceSlug: string,
  projectId: string,
  files: FileList | File[],
  extra: Record<string, string> = {}
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  for (const file of Array.from(files)) form.append("files", file);
  return e9ProjectService.uploadAttachments(workspaceSlug, projectId, form);
}

// ---------------------------------------------------------------------------
// Photos of one item
// ---------------------------------------------------------------------------

type TPhotoCellProps = {
  workspaceSlug: string;
  projectId: string;
  item: TE9ScopeItem;
  photos: TE9Attachment[];
  disabled: boolean;
  onOpen: () => void;
};

/** Small thumbnails + count in the sheet. Click to open the item's photos. */
export function E9PhotoCell({ workspaceSlug, projectId, photos, disabled, onOpen }: TPhotoCellProps) {
  const images = photos.filter(isImage);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-8 w-full items-center gap-1 rounded-md px-1.5 text-left hover:bg-layer-1-hover"
      aria-label={photos.length ? `${photos.length} photo(s)` : "Add photos"}
    >
      {images.slice(0, 2).map((photo) => (
        <img
          key={photo.id}
          src={e9ProjectService.fileUrl(workspaceSlug, projectId, photo.id)}
          alt=""
          className="size-7 shrink-0 rounded object-cover ring-1 ring-[var(--border-color-subtle)]"
          loading="lazy"
        />
      ))}
      {photos.length > 2 && <span className="text-body-2xs-semibold text-tertiary">+{photos.length - 2}</span>}
      {photos.length === 0 && !disabled && (
        <span className="flex items-center gap-1 text-body-2xs-semibold text-placeholder">
          <AddOutline className="size-3" /> Photo
        </span>
      )}
    </button>
  );
}

type TPhotosModalProps = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  item: TE9ScopeItem | null;
  disabled: boolean;
  /** which photos this dialog is for (default: site photos) */
  kind?: TE9PhotoKind;
};

export function E9PhotosModal({
  open,
  onClose,
  workspaceSlug,
  projectId,
  item,
  disabled,
  kind = "photo",
}: TPhotosModalProps) {
  const installed = kind === "install_photo";
  const { data: allPhotos, mutate } = useE9Photos(workspaceSlug, projectId, kind);
  const photos = useMemo(() => (allPhotos ?? []).filter((photo) => photo.item === item?.id), [allPhotos, item]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<TE9Attachment | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length || !item) return;
    setBusy(true);
    try {
      await uploadFiles(workspaceSlug, projectId, files, { kind, item: item.id });
      await mutate();
    } catch (error) {
      setToast({ type: "error", title: "Couldn't upload", message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (photo: TE9Attachment) => {
    if (!(await e9Confirm(`Delete ${photo.name || "this photo"}?`))) return;
    await e9ProjectService.deleteAttachment(workspaceSlug, projectId, photo.id);
    if (preview?.id === photo.id) setPreview(null);
    await mutate();
  };

  if (!item) return null;
  return (
    <E9Modal
      open={open}
      onClose={() => {
        setPreview(null);
        onClose();
      }}
      size="xl"
      title={`${item.item_code} ${installed ? "installed photos" : "photos"}`}
      description={[item.floor_area, item.description].filter(Boolean).join(" · ") || undefined}
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {preview ? (
          <div className="flex flex-col gap-3">
            <img
              src={e9ProjectService.fileUrl(workspaceSlug, projectId, preview.id)}
              alt={preview.name}
              className="max-h-[60vh] w-full rounded-xl bg-layer-1 object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs-regular text-tertiary">
              <span>{preview.name}</span>
              <span className="flex gap-3">
                <a
                  className="font-semibold text-accent-primary"
                  href={e9ProjectService.fileUrl(workspaceSlug, projectId, preview.id, true)}
                >
                  Download
                </a>
                <button type="button" className="font-semibold text-secondary" onClick={() => setPreview(null)}>
                  Back to all photos
                </button>
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((photo) => (
              <div key={photo.id} className="group relative overflow-hidden rounded-xl border border-subtle bg-layer-1">
                {isImage(photo) ? (
                  <button type="button" className="block w-full" onClick={() => setPreview(photo)}>
                    <img
                      src={e9ProjectService.fileUrl(workspaceSlug, projectId, photo.id)}
                      alt={photo.name}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <a
                    href={e9ProjectService.fileUrl(workspaceSlug, projectId, photo.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid aspect-square place-items-center text-body-sm-semibold text-secondary"
                  >
                    PDF
                  </a>
                )}
                <span className="block truncate px-2 py-1 text-body-2xs-regular text-tertiary">{photo.name}</span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Delete ${photo.name}`}
                    onClick={() => remove(photo)}
                    className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-surface-1/90 text-secondary opacity-0 shadow-raised-100 group-hover:opacity-100 hover:text-danger-primary focus-visible:opacity-100"
                  >
                    <CloseOutline className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!disabled && (
              <label
                className={cn(
                  "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-strong text-center text-body-xs-semibold text-accent-primary hover:bg-accent-subtle",
                  busy && "pointer-events-none opacity-60"
                )}
              >
                <AddOutline className="size-5" />
                {busy ? "Uploading…" : "Add photos"}
                <span className="px-2 text-body-2xs-regular text-tertiary">or take one on your phone</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    upload(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        )}
        {photos.length === 0 && disabled && (
          <p className="py-6 text-center text-body-sm-regular text-tertiary">No photos yet.</p>
        )}
        {!installed && item.photo_link && (
          <a
            href={safeHref(item.photo_link)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-body-xs-semibold text-accent-primary"
          >
            Open the photo link saved on this item
          </a>
        )}
      </div>
    </E9Modal>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const Value = ({ text }: { text: string }) => (
  <span className="font-semibold text-primary">
    {text ? (ISO_DAY.test(text) ? (renderFormattedDate(text, "dd MMM yyyy") ?? text) : text) : "blank"}
  </span>
);

export function describeChange(change: TE9Change) {
  switch (change.action) {
    case "updated":
      return (
        <>
          changed <span className="font-medium text-primary">{change.field_label}</span> from{" "}
          <Value text={change.old_value} /> to <Value text={change.new_value} />
        </>
      );
    case "created":
      return (
        <>
          added <Value text={change.new_value || change.entity_label} />
        </>
      );
    case "deleted":
      return (
        <>
          deleted <Value text={change.old_value || change.entity_label} />
        </>
      );
    case "uploaded":
      return (
        <>
          uploaded <Value text={change.new_value} />
        </>
      );
    case "imported":
      return <>imported an Excel tracker: {change.new_value}</>;
    default:
      return change.action;
  }
}

export function E9HistoryList({ changes }: { changes: TE9Change[] }) {
  const days = useMemo(() => {
    const groups: { day: string; rows: TE9Change[] }[] = [];
    for (const change of changes) {
      const day = renderFormattedDate(change.created_at, "EEEE, dd MMM yyyy") ?? "";
      const last = groups[groups.length - 1];
      if (last?.day === day) last.rows.push(change);
      else groups.push({ day, rows: [change] });
    }
    return groups;
  }, [changes]);

  if (changes.length === 0)
    return <p className="px-5 py-10 text-center text-body-sm-regular text-tertiary">No changes recorded yet.</p>;

  return (
    <div className="flex flex-col gap-5">
      {days.map((group) => (
        <section key={group.day} className="flex flex-col gap-1">
          <h3 className="text-body-2xs-semibold tracking-wide text-tertiary uppercase">{group.day}</h3>
          <ul className="flex flex-col divide-y divide-subtle rounded-xl border border-subtle bg-surface-1">
            {group.rows.map((change) => (
              <li key={change.id} className="flex items-start gap-3 px-4 py-2.5 text-body-xs-regular text-secondary">
                <span className="w-16 shrink-0 pt-0.5 text-body-2xs-medium text-placeholder tabular-nums">
                  {timeOf(change.created_at)}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">
                  <span className="font-semibold text-primary">{change.actor?.name ?? "Someone"}</span>{" "}
                  {describeChange(change)}
                  {change.entity_label && change.action === "updated" && (
                    <span className="ml-1 rounded bg-layer-2 px-1.5 py-0.5 text-body-2xs-semibold text-secondary">
                      {change.entity_label}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function E9ItemHistoryModal({
  open,
  onClose,
  workspaceSlug,
  projectId,
  item,
}: {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  item: TE9ScopeItem | null;
}) {
  const { data } = useE9History(workspaceSlug, projectId, open && item ? item.id : "none");
  if (!item) return null;
  return (
    <E9Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${item.item_code} history`}
      description="Who changed what, and when."
    >
      <div className="px-5 py-4">
        <E9HistoryList changes={data ?? []} />
      </div>
    </E9Modal>
  );
}
