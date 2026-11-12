/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@plane/utils";
import { statusTone, TONE_CLASSES } from "./constants";

// Full-bleed, like an Excel cell: no border, no background change and no size change on focus.
// The active cell is drawn by the sheet (the outline around the selection), so nothing jumps.
const base =
  "block h-9 w-full min-w-0 rounded-none border-0 bg-transparent px-2.5 text-body-xs-regular text-primary outline-none placeholder:text-transparent focus:placeholder:text-placeholder disabled:cursor-default";

type TCommon = { disabled?: boolean; overdue?: boolean; label: string };

/*
 * Excel-style moving between typed cells (text and number boxes carry data-e9-nav):
 *   Enter / ↓  -> same column, next row      ↑ -> previous row
 *   ←  at the start of the text / →  at the end -> previous / next typed cell on the row
 * Dropdowns are skipped on purpose (they stay click-to-open). Leaving a cell saves it.
 */
const NAV = "[data-e9-nav]";

function navTarget(from: HTMLElement, direction: "up" | "down" | "left" | "right"): HTMLInputElement | null {
  const cell = from.closest("td");
  const row = cell?.parentElement;
  if (!cell || !row) return null;
  if (direction === "up" || direction === "down") {
    const index = Array.prototype.indexOf.call(row.children, cell);
    let next = (direction === "down" ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
    while (next) {
      const input = next.children[index]?.querySelector<HTMLInputElement>(NAV);
      if (input && !input.disabled) return input;
      next = (direction === "down" ? next.nextElementSibling : next.previousElementSibling) as HTMLElement | null;
    }
    return null;
  }
  let sibling = (direction === "right" ? cell.nextElementSibling : cell.previousElementSibling) as HTMLElement | null;
  while (sibling) {
    const input = sibling.querySelector<HTMLInputElement>(NAV);
    if (input && !input.disabled) return input;
    sibling = (
      direction === "right" ? sibling.nextElementSibling : sibling.previousElementSibling
    ) as HTMLElement | null;
  }
  return null;
}

/** Shared key handling. Returns true when the key moved (or left) the cell. */
export function handleNavKey(event: KeyboardEvent<HTMLInputElement>): boolean {
  const input = event.currentTarget;
  const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
  const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
  let direction: "up" | "down" | "left" | "right" | null = null;
  if (event.key === "Enter" || event.key === "ArrowDown")
    direction = event.shiftKey && event.key === "Enter" ? "up" : "down";
  else if (event.key === "ArrowUp") direction = "up";
  else if (event.key === "ArrowLeft" && atStart) direction = "left";
  else if (event.key === "ArrowRight" && atEnd) direction = "right";
  if (!direction) return false;
  // keep the browser's own suggestion list working for ↑ ↓ while it is open
  if (input.list && (event.key === "ArrowDown" || event.key === "ArrowUp")) return false;
  event.preventDefault();
  const target = navTarget(input, direction);
  if (target) {
    target.focus();
    target.select();
  } else if (event.key === "Enter") {
    input.blur();
  }
  return true;
}

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
      data-e9-nav=""
      data-dirty={draft.trim() !== value ? "1" : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setDraft(value);
          return;
        }
        handleNavKey(event);
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
    const typed = draft.trim().replace(/,/g, "");
    if (typed === clean) return;
    if (typed !== "" && !Number.isFinite(Number(typed))) {
      setDraft(clean); // not a number: put the old value back
      return;
    }
    onSave(typed === "" ? null : typed);
  };
  return (
    // plain text box (no up/down arrows), numbers only – like an Excel cell
    <input
      aria-label={label}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-e9-nav=""
      data-dirty={draft.trim().replace(/,/g, "") !== clean ? "1" : undefined}
      className={cn(base, "text-right tabular-nums")}
      value={draft}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        if (/^[0-9.,]*$/.test(next)) setDraft(next);
      }}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setDraft(clean);
          return;
        }
        handleNavKey(event);
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
        overdue && "bg-danger-subtle text-danger-primary ring-1 ring-[var(--border-color-danger-strong)] ring-inset"
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
