/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Reprint straight from a tracker row: shows what was already re-sent for this item and adds a new
 * reprint / extra in a few clicks. Everything also lands on the Reprints & Extras sheet.
 */

import { useState } from "react";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import { Button } from "@makeplane/propel/components/button";
import { renderFormattedDate } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { FormField, fmt, inputClass, showError, unitText } from "../commercial/shared";
import { e9BillsKey, e9ItemsKey, e9SummaryKey, useE9Boq } from "../hooks";
import type { TE9ScopeItem } from "./logic";
import { E9Modal } from "./modal";

const CAUSE = { e9: "E9", client: "Client", site: "Site" } as const;

export function E9ReprintQuickModal({
  workspaceSlug,
  projectId,
  item,
  onClose,
}: {
  workspaceSlug: string;
  projectId: string;
  item: TE9ScopeItem | null;
  onClose: () => void;
}) {
  const { data, mutate } = useE9Boq(workspaceSlug, projectId);
  const [form, setForm] = useState({
    kind: "reprint",
    cause: "e9",
    reason: "",
    pieces: "",
    reprint_height_in: "",
    reprint_width_in: "",
    reprint_date: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  if (!item) return null;

  const history = (data?.reprints ?? []).filter((row) => row.item === item.id);
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries({ ...form, item: item.id }).filter(([, value]) => value !== ""));
      await mutate(await e9ProjectService.boqCreate(workspaceSlug, projectId, "reprints", body), {
        revalidate: false,
      });
      await Promise.all([
        globalMutate(e9ItemsKey(workspaceSlug, projectId)),
        globalMutate(e9BillsKey(workspaceSlug, projectId)),
        globalMutate(e9SummaryKey(workspaceSlug)),
      ]);
      onClose();
    } catch (error) {
      showError("Couldn't add the reprint", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <E9Modal
      open
      onClose={onClose}
      size="lg"
      title={`Reprint · ${item.item_code}`}
      description={[item.floor_area, item.description].filter(Boolean).join(" · ") || undefined}
      footer={
        <>
          <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
          <Button variant="primary" size="md" stretch="auto" label="Add reprint" loading={busy} onClick={save} />
        </>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <section className="flex flex-col gap-2">
          <span className="text-body-xs-semibold text-tertiary">Already re-sent for {item.item_code}</span>
          {history.length === 0 ? (
            <p className="text-body-xs-regular text-placeholder">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-subtle rounded-lg border border-subtle">
              {history.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-body-xs-regular">
                  <span className="font-semibold text-primary">{row.kind === "extra" ? "Extra" : "Reprint"}</span>
                  <span className="text-tertiary">{renderFormattedDate(row.reprint_date) ?? "no date"}</span>
                  <span>
                    {fmt(row.qty)} {unitText(row.unit)}
                  </span>
                  <span className="text-tertiary">by {CAUSE[row.cause]}</span>
                  {row.reason && <span className="text-tertiary">· {row.reason}</span>}
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/${workspaceSlug}/e9/projects/${projectId}?view=issues&sub=reprints`}
            className="text-body-2xs-semibold text-accent-primary hover:underline"
          >
            Open the Reprints & Extras sheet →
          </Link>
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Type">
            <select className={inputClass} value={form.kind} onChange={set("kind")}>
              <option value="reprint">Reprint</option>
              <option value="extra">Extra (amended PO)</option>
            </select>
          </FormField>
          <FormField label="Caused by">
            <select className={inputClass} value={form.cause} onChange={set("cause")}>
              <option value="e9">E9</option>
              <option value="client">Client (billable)</option>
              <option value="site">Site</option>
            </select>
          </FormField>
          <FormField label="Reason">
            <select className={inputClass} value={form.reason} onChange={set("reason")}>
              <option value="">—</option>
              {(data?.reprint_reasons ?? []).map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Date">
            <input type="date" className={inputClass} value={form.reprint_date} onChange={set("reprint_date")} />
          </FormField>
          <FormField label="Tile H (in)" hint="Only part re-sent? Size of one tile.">
            <input
              inputMode="decimal"
              className={inputClass}
              value={form.reprint_height_in}
              onChange={set("reprint_height_in")}
            />
          </FormField>
          <FormField label="Tile W (in)">
            <input
              inputMode="decimal"
              className={inputClass}
              value={form.reprint_width_in}
              onChange={set("reprint_width_in")}
            />
          </FormField>
          <FormField label="Pieces" hint="Empty = the whole item again.">
            <input inputMode="decimal" className={inputClass} value={form.pieces} onChange={set("pieces")} />
          </FormField>
        </div>
      </div>
    </E9Modal>
  );
}
