/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { AddOutline, CloseOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { refreshE9Projects, refreshE9Tracker, useE9Floors, useE9Scopes } from "../hooks";
import type { TE9Project } from "../types";
import type { TE9Floor, TE9FloorStatus, TE9ProjectScope, TE9UnitMode } from "./logic";
import { E9Modal } from "./modal";

const inputClass =
  "h-9 w-full rounded-lg border border-subtle bg-surface-1 px-2.5 text-body-xs-regular text-primary outline-none placeholder:text-placeholder focus-visible:border-accent-strong disabled:bg-layer-1 disabled:text-tertiary";

const UNIT_OPTIONS: { value: TE9UnitMode; label: string }[] = [
  { value: "sqft", label: "Size: H × W → sq ft" },
  { value: "nos", label: "Numbers only (Nos)" },
  { value: "either", label: "Either: sq ft if a size is typed, else Nos" },
];

const errorText = (error: unknown) => {
  if (!error || typeof error !== "object") return "Please try again.";
  return Object.values(error as Record<string, unknown>)
    .flat()
    .join(" ");
};

type TProps = { open: boolean; onClose: () => void; workspaceSlug: string; project: TE9Project };

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

type TScopeDraft = Partial<TE9ProjectScope> & {
  label: string;
  prefix: string;
  unit_mode: TE9UnitMode;
  enabled: boolean;
};

export function E9ScopesModal({ open, onClose, workspaceSlug, project }: TProps) {
  const { data: scopes } = useE9Scopes(workspaceSlug, project.id);
  const [rows, setRows] = useState<TScopeDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && scopes) setRows(scopes.map((scope) => ({ ...scope })));
  }, [open, scopes]);

  const update = (index: number, patch: Partial<TScopeDraft>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    try {
      await e9ProjectService.saveScopes(
        workspaceSlug,
        project.id,
        rows.map(({ key, label, prefix, unit_mode, enabled }) => ({ key, label, prefix, unit_mode, enabled }))
      );
      await refreshE9Tracker(workspaceSlug, project.id);
      setToast({ type: "success", title: "Scopes saved", message: "The tracker and dashboard now follow them." });
      onClose();
    } catch (error) {
      setToast({ type: "error", title: "Couldn't save scopes", message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <E9Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Scopes on this project"
      description="Tick what this site has. Unticked scopes disappear from the Tracker and Dashboard (their data is kept)."
      footer={
        <>
          <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
          <Button variant="primary" size="md" stretch="auto" label="Save scopes" loading={saving} onClick={save} />
        </>
      }
    >
      <div className="overflow-x-auto px-5 py-4">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="text-body-2xs-semibold text-tertiary">
              <th className="w-12 pb-2">On</th>
              <th className="pb-2">Scope name</th>
              <th className="w-24 pb-2">Code</th>
              <th className="w-72 pb-2">Measured as</th>
              <th className="w-20 pb-2 text-right">Items</th>
              <th className="w-10 pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const hasItems = (row.item_count ?? 0) > 0;
              return (
                <tr key={row.key ?? `new-${index}`} className={cn(!row.enabled && "opacity-60")}>
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`${row.label} on this project`}
                      checked={row.enabled}
                      onChange={(event) => update(index, { enabled: event.target.checked })}
                      className="size-4 cursor-pointer accent-[var(--brand-default)]"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={inputClass}
                      value={row.label}
                      aria-label="Scope name"
                      onChange={(event) => update(index, { label: event.target.value })}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={cn(inputClass, "uppercase")}
                      value={row.prefix}
                      aria-label="Code prefix"
                      maxLength={6}
                      disabled={hasItems}
                      title={
                        hasItems ? "Codes cannot change once a scope has items" : "Item codes start with this, e.g. AL1"
                      }
                      onChange={(event) =>
                        update(index, { prefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className={inputClass}
                      value={row.unit_mode}
                      aria-label="Measured as"
                      onChange={(event) => update(index, { unit_mode: event.target.value as TE9UnitMode })}
                    >
                      {UNIT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 text-right text-body-xs-medium text-tertiary tabular-nums">
                    {row.item_count ?? 0}
                  </td>
                  <td className="py-1.5 text-right">
                    {!row.is_standard && !hasItems && (
                      <button
                        type="button"
                        aria-label={`Remove ${row.label}`}
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                        className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-danger-subtle hover:text-danger-primary"
                      >
                        <CloseOutline className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, { label: "", prefix: "", unit_mode: "sqft", enabled: true, item_count: 0 }])
          }
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-strong px-3 py-2 text-body-xs-semibold text-accent-primary hover:bg-accent-subtle"
        >
          <AddOutline className="size-3.5" />
          Add your own scope
        </button>
        <p className="mt-3 text-body-2xs-regular text-placeholder">
          Size scopes add up sq ft; Numbers-only scopes add up quantity (Nos). Scopes that already have items can be
          switched off but not removed.
        </p>
      </div>
    </E9Modal>
  );
}

// ---------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------

export const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
};

export const FLOOR_STATUSES: TE9FloorStatus[] = ["Not Started", "In Progress", "Handed Over"];

export const floorStatusClass = (status: TE9FloorStatus) =>
  status === "Handed Over"
    ? "bg-success-subtle text-success-primary"
    : status === "In Progress"
      ? "bg-warning-subtle text-warning-primary"
      : "bg-layer-2 text-secondary";

export function E9FloorsModal({ open, onClose, workspaceSlug, project }: TProps) {
  const { data: floors, mutate } = useE9Floors(workspaceSlug, project.id);
  const [newNames, setNewNames] = useState("");
  const [upTo, setUpTo] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (names: string[]) => {
    const clean = names.map((name) => name.trim()).filter(Boolean);
    if (!clean.length) return;
    setBusy(true);
    try {
      await e9ProjectService.addFloors(workspaceSlug, project.id, clean);
      await mutate();
      setNewNames("");
      setUpTo("");
    } catch (error) {
      setToast({ type: "error", title: "Couldn't add floors", message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const change = async (floor: TE9Floor, patch: Partial<TE9Floor>) => {
    try {
      await e9ProjectService.updateFloor(workspaceSlug, project.id, floor.id, patch);
      await (patch.name ? refreshE9Tracker(workspaceSlug, project.id) : mutate());
    } catch (error) {
      setToast({ type: "error", title: `Couldn't update ${floor.name}`, message: errorText(error) });
      await mutate();
    }
  };

  const remove = async (floor: TE9Floor) => {
    try {
      await e9ProjectService.deleteFloor(workspaceSlug, project.id, floor.id);
      await mutate();
    } catch (error) {
      setToast({ type: "error", title: `Couldn't remove ${floor.name}`, message: errorText(error) });
    }
  };

  return (
    <E9Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Floors"
      description="Mark each floor separately. Items are grouped by floor on the Dashboard."
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid gap-3 rounded-xl border border-subtle bg-layer-1 p-3 md:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1 text-body-2xs-semibold text-secondary">
            Add floors (separate with commas)
            <input
              className={inputClass}
              value={newNames}
              placeholder="e.g. Basement, Ground Floor, Terrace"
              onChange={(event) => setNewNames(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && add(newNames.split(","))}
            />
          </label>
          <div className="flex items-end gap-2">
            <Button
              variant="secondary"
              size="md"
              stretch="auto"
              label="Add"
              loading={busy}
              onClick={() => add(newNames.split(","))}
            />
          </div>
          <label className="flex items-center gap-2 text-body-2xs-semibold text-secondary">
            Quick add: Ground Floor + 1st to
            <input
              className={cn(inputClass, "w-20")}
              inputMode="numeric"
              value={upTo}
              placeholder="17"
              onChange={(event) => setUpTo(event.target.value.replace(/\D/g, "").slice(0, 3))}
            />
            floor
          </label>
          <div className="flex items-center">
            <Button
              variant="secondary"
              size="md"
              stretch="auto"
              label="Add these"
              disabled={!upTo}
              onClick={() =>
                add(["Ground Floor", ...Array.from({ length: Number(upTo) }, (_, i) => `${ordinal(i + 1)} Floor`)])
              }
            />
          </div>
        </div>

        {!floors?.length ? (
          <p className="py-6 text-center text-body-sm-regular text-tertiary">No floors yet. Add them above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-body-2xs-semibold text-tertiary">
                  <th className="pb-2">Floor</th>
                  <th className="w-40 pb-2">Status</th>
                  <th className="w-40 pb-2">Target date</th>
                  <th className="pb-2">Notes</th>
                  <th className="w-10 pb-2" />
                </tr>
              </thead>
              <tbody>
                {floors.map((floor) => (
                  <tr key={floor.id}>
                    <td className="py-1.5 pr-2">
                      <input
                        className={inputClass}
                        defaultValue={floor.name}
                        aria-label="Floor name"
                        onBlur={(event) =>
                          event.target.value.trim() && event.target.value.trim() !== floor.name
                            ? change(floor, { name: event.target.value.trim() })
                            : undefined
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        className={cn(inputClass, "font-medium", floorStatusClass(floor.status))}
                        value={floor.status}
                        aria-label="Floor status"
                        onChange={(event) => change(floor, { status: event.target.value as TE9FloorStatus })}
                      >
                        {FLOOR_STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="date"
                        className={inputClass}
                        value={floor.target_date ?? ""}
                        aria-label="Target date"
                        onChange={(event) => change(floor, { target_date: event.target.value || null })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className={inputClass}
                        defaultValue={floor.notes}
                        aria-label="Notes"
                        placeholder="e.g. Client walk-through on 20th"
                        onBlur={(event) =>
                          event.target.value !== floor.notes ? change(floor, { notes: event.target.value }) : undefined
                        }
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${floor.name}`}
                        onClick={() => remove(floor)}
                        className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-danger-subtle hover:text-danger-primary"
                      >
                        <CloseOutline className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </E9Modal>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const HIDEABLE_COLUMNS: { key: string; label: string }[] = [
  { key: "boq_item_no", label: "BOQ No." },
  { key: "current_stage", label: "Current stage" },
  { key: "floor_area", label: "Floor / Area" },
  { key: "floor_plan_ref", label: "Floor plan" },
  { key: "description", label: "Description" },
  { key: "site_audit_status", label: "Site audit" },
  { key: "size", label: "H / W / Qty / Area" },
  { key: "photos", label: "Photos" },
  { key: "site_issue", label: "Site issue & resolved" },
  { key: "pre_press", label: "Pre-press" },
  { key: "jc_no", label: "JC No." },
  { key: "production_size", label: "Production size (what we send)" },
  { key: "production_status", label: "Production" },
  { key: "material_status", label: "Material" },
  { key: "quality_check", label: "Quality check" },
  { key: "qc_done_by", label: "QC by" },
  { key: "dc_nos", label: "DC No(s)." },
  { key: "dc_qty", label: "DC Qty, dispatched & balance" },
  { key: "dispatch_status", label: "Dispatch" },
  { key: "installation_status", label: "Installation" },
  { key: "installation_date", label: "Install date" },
  { key: "installed_by", label: "Installed by" },
  { key: "certified", label: "Certified (joint measurement)" },
  { key: "client_sign_off", label: "Client sign-off" },
  { key: "remarks", label: "Remarks" },
  { key: "resent", label: "Re-sent (reprints)" },
];

export function E9ColumnsModal({ open, onClose, workspaceSlug, project }: TProps) {
  const [hidden, setHidden] = useState<string[]>(project.e9.hidden_columns ?? []);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setHidden(project.e9.hidden_columns ?? []);
  }, [open, project.e9.hidden_columns]);

  const save = async () => {
    setSaving(true);
    try {
      await e9ProjectService.updateProfile(workspaceSlug, project.id, { hidden_columns: hidden });
      await refreshE9Projects(workspaceSlug, project.id);
      onClose();
    } catch (error) {
      setToast({ type: "error", title: "Couldn't save columns", message: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <E9Modal
      open={open}
      onClose={onClose}
      title="Columns on this project"
      description="Untick columns this project doesn't use. Hidden columns keep their data."
      footer={
        <>
          <Button variant="secondary" size="md" stretch="auto" label="Show all" onClick={() => setHidden([])} />
          <Button variant="primary" size="md" stretch="auto" label="Save" loading={saving} onClick={save} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-2">
        {HIDEABLE_COLUMNS.map((column) => (
          <label
            key={column.key}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-body-sm-regular text-primary hover:bg-layer-1-hover"
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--brand-default)]"
              checked={!hidden.includes(column.key)}
              onChange={(event) =>
                setHidden((prev) =>
                  event.target.checked ? prev.filter((key) => key !== column.key) : [...prev, column.key]
                )
              }
            />
            {column.label}
          </label>
        ))}
      </div>
    </E9Modal>
  );
}

// ---------------------------------------------------------------------------
// Excel import
// ---------------------------------------------------------------------------

type TImportReport = Awaited<ReturnType<typeof e9ProjectService.importTracker>>;

export function E9ImportModal({ open, onClose, workspaceSlug, project }: TProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<TImportReport | null>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setReport(null);
    }
  }, [open]);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await e9ProjectService.importTracker(workspaceSlug, project.id, file);
      setReport(result);
      await refreshE9Tracker(workspaceSlug, project.id);
      await refreshE9Projects(workspaceSlug, project.id);
    } catch (error) {
      setToast({ type: "error", title: "Couldn't import the file", message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const total = report ? Object.values(report.items).reduce((sum, count) => sum + count, 0) : 0;

  return (
    <E9Modal
      open={open}
      onClose={onClose}
      title="Import an Excel tracker"
      description="Choose an E9 tracker file (.xlsx). Its items, floors, project info and site visits are added to this project."
      footer={
        report ? (
          <Button variant="primary" size="md" stretch="auto" label="Done" onClick={onClose} />
        ) : (
          <>
            <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              label="Import"
              loading={busy}
              disabled={!file}
              onClick={run}
            />
          </>
        )
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {!report ? (
          <>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-strong bg-layer-1 px-4 py-8 text-center hover:bg-layer-1-hover">
              <span className="text-body-sm-semibold text-primary">
                {file ? file.name : "Click to choose the .xlsx file"}
              </span>
              <span className="text-body-xs-regular text-tertiary">
                {file ? `${(file.size / 1024).toFixed(0)} KB` : "The same tracker you use in Excel / Google Sheets"}
              </span>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-body-2xs-regular text-placeholder">
              Nothing already on this project is overwritten: only empty project details are filled in, and imported
              items get new codes if a code is already used.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3 text-body-sm-regular text-primary">
            <p className="text-body-md-semibold text-success-primary">Imported {total} item(s).</p>
            <ul className="flex flex-col gap-1">
              {Object.entries(report.items).map(([scope, count]) => (
                <li key={scope}>
                  {scope}: <span className="font-semibold">{count}</span>
                </li>
              ))}
              {report.floors.length > 0 && <li>New floors: {report.floors.join(", ")}</li>}
              {report.site_visits > 0 && <li>Site visits / audit reports: {report.site_visits}</li>}
              {report.project_fields.length > 0 && <li>Project details filled: {report.project_fields.length}</li>}
            </ul>
            {report.coordinator && (
              <p className="rounded-lg bg-layer-1 px-3 py-2 text-body-xs-regular text-secondary">
                The Excel names <b>{report.coordinator}</b> as coordinator. Pick them in Edit project once they have a
                login.
              </p>
            )}
            {report.warnings.length > 0 && (
              <details className="rounded-lg bg-warning-subtle px-3 py-2 text-body-xs-regular text-warning-primary">
                <summary className="cursor-pointer font-semibold">
                  {report.warnings.length} note(s) about the file
                </summary>
                <ul className="mt-1 list-disc pl-4">
                  {report.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </E9Modal>
  );
}
