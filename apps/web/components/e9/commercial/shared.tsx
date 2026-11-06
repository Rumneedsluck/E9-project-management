/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AddOutline, CloseOutline } from "@makeplane/propel/icons";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import type { TE9Attachment } from "../tracker/logic";
import { uploadFiles } from "../tracker/photos-history";
import type { TE9BoqStatus, TE9BoqUnit } from "./types";

export const errorText = (error: unknown) => {
  if (error && typeof error === "object") {
    const text = Object.values(error as Record<string, unknown>)
      .flat()
      .filter((value) => typeof value === "string")
      .join(" ");
    if (text) return text;
  }
  return "Please try again.";
};

export const showError = (title: string, error: unknown) =>
  setToast({ type: "error", title, message: errorText(error) });

const toNumber = (value: string | number | null | undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** 1,250.5 style, no trailing .00 */
export const fmt = (value: string | number | null | undefined) =>
  toNumber(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const unitText = (unit: TE9BoqUnit) => (unit === "sqft" ? "sq ft" : "Nos");

export const money = (value: string | number | null | undefined) =>
  `₹${toNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isPositive = (value: string | number | null | undefined) => toNumber(value) > 0;

/** Link that opens the tracker on a scope with a search typed in. */
export const trackerHref = (slug: string, projectId: string, scope: string, query: string) =>
  `/${slug}/e9/projects/${projectId}?view=tracker&scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(query)}`;

export function ItemLink({
  slug,
  projectId,
  scope,
  code,
}: {
  slug: string;
  projectId: string;
  scope: string;
  code: string;
}) {
  return (
    <Link
      href={trackerHref(slug, projectId, scope, code)}
      className="rounded bg-layer-2 px-1.5 py-0.5 text-body-2xs-semibold text-accent-primary hover:bg-accent-subtle hover:underline"
    >
      {code}
    </Link>
  );
}

export const STATUS_META: Record<TE9BoqStatus, { label: string; pill: string; row: string }> = {
  ok: { label: "Within BOQ", pill: "bg-success-subtle text-success-primary", row: "" },
  pending: {
    label: "Waiting for client mail",
    pill: "bg-layer-2 text-secondary",
    row: "",
  },
  // over the BOQ is marked every time, but in amber, not alarm red (some wastage extra is normal)
  excess: {
    label: "Over BOQ",
    pill: "bg-warning-subtle text-warning-primary",
    row: "bg-warning-subtle/30",
  },
};

export function StatusPill({ status }: { status: TE9BoqStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-body-2xs-semibold whitespace-nowrap",
        STATUS_META[status].pill
      )}
    >
      {STATUS_META[status].label}
    </span>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-subtle bg-surface-1 px-3 text-body-sm-regular text-primary outline-none placeholder:text-placeholder focus:border-accent-strong disabled:cursor-not-allowed disabled:opacity-60";

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-body-xs-medium text-tertiary">{label}</span>
      {children}
      {hint && <span className="text-body-2xs-regular text-placeholder">{hint}</span>}
    </label>
  );
}

export function SmallButton({
  children,
  onClick,
  tone = "accent",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "accent" | "danger" | "neutral";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-body-xs-semibold whitespace-nowrap disabled:opacity-50",
        tone === "accent" && "text-accent-primary hover:bg-accent-subtle",
        tone === "danger" && "text-danger-primary hover:bg-danger-subtle",
        tone === "neutral" && "text-secondary hover:bg-layer-1-hover"
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Files attached to a PO, an amendment mail, a bill stage or a DC
// ---------------------------------------------------------------------------

type TRefFilesProps = {
  slug: string;
  projectId: string;
  kind: "po" | "mail" | "certificate" | "pi" | "wcc" | "dc_scan" | "document" | "snag" | "jmc";
  /** files belong to this PO / amendment / bill … */
  refId?: string;
  /** … or carry this label (DC number) */
  label?: string;
  canUpload: boolean;
  addText?: string;
};

export const e9FilesKey = (slug: string, projectId: string, kind: string) => `E9_FILES_${slug}_${projectId}_${kind}`;

export function E9RefFiles({ slug, projectId, kind, refId, label, canUpload, addText = "Attach" }: TRefFilesProps) {
  const { data, mutate } = useSWR(
    e9FilesKey(slug, projectId, kind),
    () => e9ProjectService.listAttachments(slug, projectId, kind),
    { revalidateOnFocus: false }
  );
  const [busy, setBusy] = useState(false);
  const files = (data ?? []).filter((file) => (refId ? file.ref_id === refId : file.label === label));

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const extra: Record<string, string> = { kind };
      if (refId) extra.ref_id = refId;
      if (label) extra.label = label;
      await uploadFiles(slug, projectId, list, extra);
      await mutate();
    } catch (error) {
      showError("Couldn't upload", error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (file: TE9Attachment) => {
    if (!window.confirm(`Delete ${file.name}?`)) return;
    await e9ProjectService.deleteAttachment(slug, projectId, file.id);
    await mutate();
  };

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {files.map((file) => (
        <span
          key={file.id}
          className="inline-flex items-center gap-1 rounded-md border border-subtle bg-surface-1 py-0.5 pr-1 pl-2"
        >
          <a
            href={file.has_file ? e9ProjectService.fileUrl(slug, projectId, file.id) : file.link}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-[160px] truncate text-body-2xs-semibold text-accent-primary hover:underline"
          >
            {file.name || "File"}
          </a>
          {canUpload && (
            <button
              type="button"
              aria-label={`Delete ${file.name}`}
              onClick={() => remove(file)}
              className="grid size-5 place-items-center rounded text-tertiary hover:text-danger-primary"
            >
              <CloseOutline className="size-3" />
            </button>
          )}
        </span>
      ))}
      {canUpload && (
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-strong px-2 py-0.5 text-body-2xs-semibold text-accent-primary hover:bg-accent-subtle",
            busy && "pointer-events-none opacity-60"
          )}
        >
          <AddOutline className="size-3" />
          {busy ? "Uploading…" : addText}
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
      {!canUpload && files.length === 0 && <span className="text-body-2xs-regular text-placeholder">—</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Opening a JC / DC in Gmail
// ---------------------------------------------------------------------------

const MAIL_KEY = "e9-mail-settings";
export type TE9MailSettings = { account: string; words: string };

export const readMailSettings = (): TE9MailSettings => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(MAIL_KEY) ?? "{}") as Partial<TE9MailSettings>;
    return { account: saved.account ?? "", words: saved.words ?? "" };
  } catch {
    return { account: "", words: "" };
  }
};

export const saveMailSettings = (settings: TE9MailSettings) => {
  try {
    window.localStorage.setItem(MAIL_KEY, JSON.stringify(settings));
  } catch {
    // private window: settings simply are not remembered
  }
};

/** Gmail search for a JC / DC number, in the mail account chosen in Mail settings. */
export const mailSearchUrl = (number: string) => {
  const { account, words } = typeof window === "undefined" ? { account: "", words: "" } : readMailSettings();
  const query = encodeURIComponent([words.trim(), number.trim()].filter(Boolean).join(" "));
  return account.trim()
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.trim())}#search/${query}`
    : `https://mail.google.com/mail/u/0/#search/${query}`;
};
