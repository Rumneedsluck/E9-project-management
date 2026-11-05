/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { cn } from "@plane/utils";
import { statusTone, TONE_CLASSES } from "./constants";

const base =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-body-xs-regular text-primary outline-none placeholder:text-transparent hover:border-subtle focus:border-accent-strong focus:bg-surface-1 focus:placeholder:text-placeholder disabled:cursor-default disabled:hover:border-transparent";

type TCommon = { disabled?: boolean; overdue?: boolean; label: string };

/** Text box that saves when you leave it (or press Enter). */
export function TextCell({
  value,
  onSave,
  disabled,
  overdue,
  label,
  placeholder,
  listId,
}: TCommon & { value: string; onSave: (value: string) => void; placeholder?: string; listId?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() !== value) onSave(draft.trim());
  };
  return (
    <input
      aria-label={label}
      className={cn(base, overdue && "bg-danger-subtle")}
      list={listId}
      value={draft}
      disabled={disabled}
      placeholder={disabled ? "" : placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        if (event.key === "Escape") setDraft(value);
      }}
    />
  );
}

/** Number box (inches / quantity). Empty means "not filled". */
export function NumberCell({
  value,
  onSave,
  disabled,
  label,
}: TCommon & { value: string | null; onSave: (value: string | null) => void }) {
  const clean = value === null ? "" : String(Number(value));
  const [draft, setDraft] = useState(clean);
  useEffect(() => setDraft(clean), [clean]);
  const commit = () => {
    if (draft === clean) return;
    onSave(draft === "" ? null : draft);
  };
  return (
    <input
      aria-label={label}
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      className={cn(base, "text-right tabular-nums")}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Dropdown with the template's colour guide (green done, yellow under way, blue sent, red rework/overdue). */
export function SelectCell({
  value,
  options,
  onSave,
  disabled,
  overdue,
  label,
  blankLabel = "—",
}: TCommon & { value: string; options: string[]; onSave: (value: string) => void; blankLabel?: string }) {
  const tone = statusTone(value);
  return (
    <select
      aria-label={label}
      className={cn(
        base,
        "cursor-pointer appearance-none truncate pr-1 font-medium",
        TONE_CLASSES[tone],
        overdue && "bg-danger-subtle text-danger-primary ring-1 ring-[var(--border-color-danger-strong)]"
      )}
      value={value}
      disabled={disabled}
      title={overdue ? `${value || blankLabel} — overdue against the stage target date` : value}
      onChange={(event) => onSave(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option || blankLabel}
        </option>
      ))}
    </select>
  );
}

export function DateCell({
  value,
  onSave,
  disabled,
  label,
}: TCommon & { value: string | null; onSave: (value: string | null) => void }) {
  return (
    <input
      aria-label={label}
      type="date"
      className={cn(base, "tabular-nums", !value && "text-transparent focus:text-primary")}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onSave(event.target.value || null)}
    />
  );
}
