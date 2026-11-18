/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * A target date you can change right where you read it: click the box to pick from the calendar, or type the
 * date. It saves as soon as the date is complete; the cross clears it. Target dates move, so nothing is locked.
 */

import { useEffect, useState } from "react";
import { renderFormattedDate } from "@plane/utils";

type Props = {
  value: string | null;
  label: string;
  /** false = just show the date (people who may not change it) */
  editable: boolean;
  late?: boolean;
  onSave: (value: string | null) => Promise<unknown> | unknown;
};

const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date is only saved once it is complete and sensible, so typing the year digit by digit saves nothing early. */
export const isSavableDate = (text: string): boolean => {
  const match = FULL_DATE.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100;
};

export function E9TargetDate({ value, label, editable, late = false, onSave }: Props) {
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value ?? ""), [value]);

  if (!editable)
    return (
      <span className={late ? "font-semibold text-danger-primary" : undefined}>
        {value ? renderFormattedDate(value) : "—"}
        {late && " · late"}
      </span>
    );

  const commit = async (next: string) => {
    if (next === (value ?? "")) return;
    setSaving(true);
    try {
      await onSave(next || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="flex items-center gap-1">
      <input
        type="date"
        aria-label={label}
        value={draft}
        disabled={saving}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next === "" || isSavableDate(next)) void commit(next);
        }}
        className={`e9-date h-8 rounded-md border bg-transparent px-2 text-body-xs-regular tabular-nums outline-none focus:border-[var(--brand-default)] ${
          late ? "border-[var(--border-color-danger-strong)] text-danger-primary" : "border-subtle text-primary"
        } ${draft ? "" : "text-placeholder"}`}
      />
      {draft && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          title="Clear this date"
          disabled={saving}
          onClick={() => {
            setDraft("");
            void commit("");
          }}
          className="grid size-6 place-items-center rounded text-tertiary hover:bg-[var(--e9-hover)] hover:text-primary"
        >
          ×
        </button>
      )}
      {late && <span className="text-body-2xs-semibold text-danger-primary">late</span>}
    </span>
  );
}
