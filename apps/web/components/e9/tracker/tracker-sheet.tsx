/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AddOutline, CloseOutline, SearchOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
// local
import { useE9Items } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { e9ProjectService } from "@/services/e9/project.service";
import { DateCell, NumberCell, SelectCell, TextCell } from "./cells";
import {
  CLIENT_SIGN_OFF,
  DISPATCH_STATUS,
  E9_SCOPES,
  E9_TRACKER_STAGES,
  INSTALLATION_STATUS,
  ISSUE_RESOLVED,
  MATERIAL_STATUS,
  PRE_PRESS,
  PRODUCTION_STATUS,
  QUALITY_CHECK,
  SITE_AUDIT_STATUS,
  SITE_ISSUES,
  getScope,
} from "./constants";
import type { TE9ScopeKey, TE9StageKey } from "./constants";
import type { TE9ScopeItem } from "./logic";
import { formatMeasure, isFilled, isStageOverdue, itemArea, itemMeasure } from "./logic";

const stageColor = (key: TE9StageKey) => E9_TRACKER_STAGES.find((stage) => stage.key === key)?.color ?? "#888";

/** Column bands, coloured like the stage bands on the Excel scope sheets. */
const BANDS: { label: string; span: number; color: string }[] = [
  { label: "Item details", span: 6, color: "#6B7280" },
  { label: "1 · Site audit", span: 8, color: stageColor("site_audit") },
  { label: "2 · Pre-press", span: 2, color: stageColor("pre_press") },
  { label: "3 · Production & material", span: 2, color: stageColor("material") },
  { label: "4 · Quality & dispatch", span: 4, color: stageColor("delivered") },
  { label: "5 · Installation", span: 3, color: stageColor("installation") },
  { label: "6 · Handover", span: 1, color: stageColor("sign_off") },
  { label: "Notes", span: 1, color: "#6B7280" },
];

const COLUMNS: { label: string; width: number }[] = [
  { label: "Code", width: 64 },
  { label: "BOQ No.", width: 84 },
  { label: "Current stage", width: 140 },
  { label: "Floor / Area", width: 150 },
  { label: "Floor plan", width: 110 },
  { label: "Description", width: 220 },
  { label: "Site audit", width: 150 },
  { label: "H (in)", width: 76 },
  { label: "W (in)", width: 76 },
  { label: "Qty", width: 64 },
  { label: "Area / unit", width: 104 },
  { label: "Photo link", width: 120 },
  { label: "Site issue", width: 200 },
  { label: "Resolved?", width: 92 },
  { label: "Pre-press", width: 200 },
  { label: "JC No.", width: 104 },
  { label: "Production", width: 140 },
  { label: "Material", width: 150 },
  { label: "Quality check", width: 136 },
  { label: "QC by", width: 110 },
  { label: "DC No(s).", width: 120 },
  { label: "Dispatch", width: 168 },
  { label: "Installation", width: 156 },
  { label: "Install date", width: 136 },
  { label: "Installed by", width: 130 },
  { label: "Client sign-off", width: 152 },
  { label: "Remarks", width: 220 },
  { label: "", width: 44 },
];

const STICKY_CODE = "sticky left-0 z-[2] bg-surface-1";

type Props = { workspaceSlug: string; project: TE9Project };

export function E9TrackerSheet({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Items(workspaceSlug, project.id);
  const [scope, setScope] = useState<TE9ScopeKey>("wall_graphics");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data]);
  const canEdit = data?.can_edit ?? false;
  const targets = project.e9;
  const scopeMeta = getScope(scope);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => item.scope === scope)
      .filter((item) =>
        !query
          ? true
          : [item.item_code, item.floor_area, item.description, item.boq_item_no, item.jc_no, item.dc_nos]
              .join(" ")
              .toLowerCase()
              .includes(query)
      );
  }, [items, scope, search]);

  const filledByScope = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) if (isFilled(item)) counts[item.scope] = (counts[item.scope] ?? 0) + 1;
    return counts;
  }, [items]);

  const save = async (item: TE9ScopeItem, patch: Partial<TE9ScopeItem>) => {
    // show the change straight away, then replace with the server's version (area, stage)
    await mutate(
      (current) =>
        current && {
          ...current,
          items: current.items.map((row) => (row.id === item.id ? { ...row, ...patch } : row)),
        },
      { revalidate: false }
    );
    try {
      const updated = await e9ProjectService.updateItem(workspaceSlug, project.id, item.id, patch);
      await mutate(
        (current) => current && { ...current, items: current.items.map((row) => (row.id === item.id ? updated : row)) },
        { revalidate: false }
      );
    } catch (err) {
      const message = err && typeof err === "object" ? Object.values(err).flat().join(" ") : "";
      setToast({ type: "error", title: `Couldn't save ${item.item_code}`, message: message || "Please try again." });
      await mutate();
    }
  };

  const addRows = async (count: number) => {
    setAdding(true);
    try {
      const created = await e9ProjectService.addItems(workspaceSlug, project.id, scope, count);
      await mutate((current) => current && { ...current, items: [...current.items, ...created] }, {
        revalidate: false,
      });
    } catch {
      setToast({ type: "error", title: "Couldn't add rows", message: "Please try again." });
    } finally {
      setAdding(false);
    }
  };

  const removeRow = async (item: TE9ScopeItem) => {
    const label = [item.item_code, item.description || item.floor_area].filter(Boolean).join(" – ");
    if (!window.confirm(`Delete ${label}? The code ${item.item_code} will not be reused.`)) return;
    try {
      await e9ProjectService.deleteItem(workspaceSlug, project.id, item.id);
      await mutate((current) => current && { ...current, items: current.items.filter((row) => row.id !== item.id) }, {
        revalidate: false,
      });
    } catch {
      setToast({ type: "error", title: `Couldn't delete ${item.item_code}`, message: "Please try again." });
    }
  };

  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const filledRows = rows.filter(isFilled);
  const totalMeasure = filledRows.reduce((total, item) => total + itemMeasure(item), 0);
  const totalArea = filledRows.reduce((total, item) => total + itemArea(item), 0);
  const tableWidth = COLUMNS.reduce((total, column) => total + column.width, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Scope tabs */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Scope sheets">
        {E9_SCOPES.map((entry) => {
          const active = entry.key === scope;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setScope(entry.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-body-xs-semibold whitespace-nowrap transition-colors",
                active
                  ? "border-accent-strong bg-accent-subtle text-primary"
                  : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1-hover"
              )}
            >
              {entry.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-body-2xs-semibold tabular-nums",
                  active ? "bg-accent-primary text-on-color" : "bg-layer-2 text-tertiary"
                )}
              >
                {filledByScope[entry.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-body-sm-semibold text-primary">{scopeMeta.label}</span>
          <span className="text-body-xs-regular text-tertiary">
            {filledRows.length} item{filledRows.length === 1 ? "" : "s"}
            {scopeMeta.unit === "nos" ? ` · ${formatMeasure(totalMeasure, "nos")}` : ""}
            {totalArea > 0 ? ` · ${formatMeasure(Math.round(totalArea * 100) / 100, "sqft")}` : ""}
            {scopeMeta.unit === "nos" ? " · counted by quantity" : ""}
            {canEdit ? " · changes save automatically" : " · view only"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <span className="sr-only">Search items</span>
            <SearchOutline className="pointer-events-none absolute left-2.5 size-3.5 text-placeholder" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search code, floor, JC, DC"
              className="h-8 w-56 rounded-lg border border-subtle bg-surface-1 pr-2 pl-8 text-body-xs-regular text-primary outline-none placeholder:text-placeholder focus-visible:border-accent-strong"
            />
          </label>
          {canEdit && (
            <>
              <Button
                variant="secondary"
                size="md"
                stretch="auto"
                icon={<AddOutline className="size-3.5" />}
                label="Add row"
                loading={adding}
                onClick={() => addRows(1)}
              />
              <Button variant="secondary" size="md" stretch="auto" label="Add 10 rows" onClick={() => addRows(10)} />
            </>
          )}
        </div>
      </div>

      {/* Sheet */}
      <div className="overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-raised-100">
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-fixed border-separate border-spacing-0 text-left" style={{ width: tableWidth }}>
            <colgroup>
              {COLUMNS.map((column, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- fixed column list
                <col key={index} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-[3]">
              <tr>
                {BANDS.map((band, index) => (
                  <th
                    key={band.label}
                    colSpan={band.span + (index === BANDS.length - 1 ? 1 : 0)}
                    className="border-b border-subtle px-2 py-1.5 text-body-2xs-semibold tracking-wide whitespace-nowrap text-white uppercase"
                    style={{ backgroundColor: band.color }}
                  >
                    {band.label}
                  </th>
                ))}
              </tr>
              <tr>
                {COLUMNS.map((column, index) => (
                  <th
                    // oxlint-disable-next-line react/no-array-index-key -- fixed column list
                    key={index}
                    className={cn(
                      "border-b border-subtle bg-layer-1 px-2 py-2 text-body-2xs-semibold whitespace-nowrap text-tertiary",
                      index === 0 && "sticky left-0 z-[4]"
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-14 text-center text-body-sm-regular text-tertiary">
                    {search
                      ? "No items match your search."
                      : canEdit
                        ? `No ${scopeMeta.label.toLowerCase()} yet. Click “Add row” or “Add 10 rows” to start.`
                        : `No ${scopeMeta.label.toLowerCase()} yet.`}
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <TrackerRow
                    key={item.id}
                    item={item}
                    disabled={!canEdit}
                    overdue={(stage) => isStageOverdue(item, stage, targets)}
                    onSave={(patch) => save(item, patch)}
                    onDelete={() => removeRow(item)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Legend />
    </div>
  );
}

function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-b border-subtle px-1 py-1 align-middle", className)}>{children}</td>;
}

type TRowProps = {
  item: TE9ScopeItem;
  disabled: boolean;
  overdue: (stage: TE9StageKey) => boolean;
  onSave: (patch: Partial<TE9ScopeItem>) => void;
  onDelete: () => void;
};

function TrackerRow({ item, disabled, overdue, onSave, onDelete }: TRowProps) {
  const scopeRule = getScope(item.scope).unit;
  const empty = !isFilled(item);
  const jcLink = item.jc_no ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(item.jc_no)}` : null;
  return (
    <tr className={cn("group hover:bg-layer-1-hover/40", empty && "opacity-70")}>
      <Cell className={cn(STICKY_CODE, "px-2 text-body-xs-semibold text-primary group-hover:bg-layer-1")}>
        {item.item_code}
      </Cell>
      <Cell>
        <TextCell
          label="BOQ item no."
          value={item.boq_item_no}
          disabled={disabled}
          onSave={(v) => onSave({ boq_item_no: v })}
        />
      </Cell>
      <Cell className="px-2">
        <span className="block truncate text-body-xs-medium text-secondary" title={item.current_stage}>
          {empty ? "" : item.current_stage}
        </span>
      </Cell>
      <Cell>
        <TextCell
          label="Floor / area"
          value={item.floor_area}
          disabled={disabled}
          placeholder="e.g. 4th Floor"
          onSave={(v) => onSave({ floor_area: v })}
        />
      </Cell>
      <Cell>
        <TextCell
          label="Floor plan"
          value={item.floor_plan_ref}
          disabled={disabled}
          onSave={(v) => onSave({ floor_plan_ref: v })}
        />
      </Cell>
      <Cell>
        <TextCell
          label="Description"
          value={item.description}
          disabled={disabled}
          placeholder="e.g. Wall 01"
          onSave={(v) => onSave({ description: v })}
        />
      </Cell>
      {/* 1 · Site audit */}
      <Cell>
        <SelectCell
          label="Site audit status"
          value={item.site_audit_status}
          options={SITE_AUDIT_STATUS}
          disabled={disabled}
          overdue={overdue("site_audit")}
          onSave={(v) => onSave({ site_audit_status: v })}
        />
      </Cell>
      <Cell>
        <NumberCell
          label="Height in inches"
          value={item.height_in}
          disabled={disabled}
          onSave={(v) => onSave({ height_in: v })}
        />
      </Cell>
      <Cell>
        <NumberCell
          label="Width in inches"
          value={item.width_in}
          disabled={disabled}
          onSave={(v) => onSave({ width_in: v })}
        />
      </Cell>
      <Cell>
        <NumberCell label="Quantity" value={item.qty} disabled={disabled} onSave={(v) => onSave({ qty: v })} />
      </Cell>
      <Cell className="px-2">
        <div className="flex flex-col leading-tight">
          <span className="text-right text-body-xs-semibold text-primary tabular-nums">
            {item.unit === "sqft"
              ? item.area_sqft
                ? `${Number(item.area_sqft).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                : "—"
              : `${Number(item.qty || (empty ? 0 : 1))}`}
          </span>
          {scopeRule === "either" && !disabled ? (
            <select
              aria-label="Count in"
              className="mt-0.5 cursor-pointer bg-transparent text-right text-body-2xs-regular text-tertiary outline-none"
              value={item.unit_override}
              onChange={(event) => onSave({ unit_override: event.target.value as TE9ScopeItem["unit_override"] })}
            >
              <option value="">{item.unit === "sqft" ? "sq ft (auto)" : "Nos (auto)"}</option>
              <option value="sqft">sq ft</option>
              <option value="nos">Nos</option>
            </select>
          ) : (
            <span className="text-right text-body-2xs-regular text-tertiary">
              {item.unit === "sqft" ? "sq ft" : "Nos"}
            </span>
          )}
        </div>
      </Cell>
      <Cell>
        <div className="flex items-center">
          <TextCell
            label="Photo link"
            value={item.photo_link}
            disabled={disabled}
            placeholder="Drive link"
            onSave={(v) => onSave({ photo_link: v })}
          />
          {item.photo_link.startsWith("http") && (
            <a
              href={item.photo_link}
              target="_blank"
              rel="noopener noreferrer"
              className="px-1 text-body-2xs-semibold text-accent-primary"
            >
              Open
            </a>
          )}
        </div>
      </Cell>
      <Cell>
        <SelectCell
          label="Site issue"
          value={item.site_issue}
          options={SITE_ISSUES[item.scope]}
          disabled={disabled}
          onSave={(v) =>
            onSave({
              site_issue: v,
              issue_resolved: v === "No issues" ? "N/A" : item.issue_resolved === "N/A" ? "No" : item.issue_resolved,
            })
          }
        />
      </Cell>
      <Cell>
        <SelectCell
          label="Issue resolved"
          value={item.issue_resolved}
          options={ISSUE_RESOLVED}
          disabled={disabled}
          onSave={(v) => onSave({ issue_resolved: v })}
        />
      </Cell>
      {/* 2 · Pre-press */}
      <Cell>
        <SelectCell
          label="Pre-press"
          value={item.pre_press}
          options={PRE_PRESS}
          disabled={disabled}
          overdue={overdue("pre_press")}
          onSave={(v) => onSave({ pre_press: v })}
        />
      </Cell>
      <Cell>
        <div className="flex items-center">
          <TextCell label="JC number" value={item.jc_no} disabled={disabled} onSave={(v) => onSave({ jc_no: v })} />
          {jcLink && (
            <a
              href={jcLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Find the e-proof mail in Gmail"
              className="px-1 text-body-2xs-semibold text-accent-primary"
            >
              Mail
            </a>
          )}
        </div>
      </Cell>
      {/* 3 · Production & material */}
      <Cell>
        <SelectCell
          label="Production status"
          value={item.production_status}
          options={PRODUCTION_STATUS}
          disabled={disabled}
          onSave={(v) => onSave({ production_status: v })}
        />
      </Cell>
      <Cell>
        <SelectCell
          label="Material status"
          value={item.material_status}
          options={MATERIAL_STATUS}
          blankLabel="— (no JC yet)"
          disabled={disabled}
          overdue={overdue("material")}
          onSave={(v) => onSave({ material_status: v })}
        />
      </Cell>
      {/* 4 · Quality & dispatch */}
      <Cell>
        <SelectCell
          label="Quality check"
          value={item.quality_check}
          options={QUALITY_CHECK}
          disabled={disabled}
          onSave={(v) => onSave({ quality_check: v })}
        />
      </Cell>
      <Cell>
        <TextCell
          label="QC done by"
          value={item.qc_done_by}
          disabled={disabled}
          onSave={(v) => onSave({ qc_done_by: v })}
        />
      </Cell>
      <Cell>
        <TextCell
          label="DC numbers"
          value={item.dc_nos}
          disabled={disabled}
          placeholder="e.g. 3500, 3501"
          onSave={(v) => onSave({ dc_nos: v })}
        />
      </Cell>
      <Cell>
        <SelectCell
          label="Dispatch status"
          value={item.dispatch_status}
          options={DISPATCH_STATUS}
          disabled={disabled}
          overdue={overdue("delivered")}
          onSave={(v) => onSave({ dispatch_status: v })}
        />
      </Cell>
      {/* 5 · Installation */}
      <Cell>
        <SelectCell
          label="Installation status"
          value={item.installation_status}
          options={INSTALLATION_STATUS}
          disabled={disabled}
          overdue={overdue("installation")}
          onSave={(v) => onSave({ installation_status: v })}
        />
      </Cell>
      <Cell>
        <DateCell
          label="Installation date"
          value={item.installation_date}
          disabled={disabled}
          onSave={(v) => onSave({ installation_date: v })}
        />
      </Cell>
      <Cell>
        <TextCell
          label="Installed by"
          value={item.installed_by}
          disabled={disabled}
          placeholder="Team"
          onSave={(v) => onSave({ installed_by: v })}
        />
      </Cell>
      {/* 6 · Handover */}
      <Cell>
        <SelectCell
          label="Client sign-off"
          value={item.client_sign_off}
          options={CLIENT_SIGN_OFF}
          disabled={disabled}
          overdue={overdue("sign_off")}
          onSave={(v) => onSave({ client_sign_off: v })}
        />
      </Cell>
      <Cell>
        <TextCell label="Remarks" value={item.remarks} disabled={disabled} onSave={(v) => onSave({ remarks: v })} />
      </Cell>
      <Cell className="text-center">
        {!disabled && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${item.item_code}`}
            className="grid size-7 place-items-center rounded-md text-placeholder opacity-0 group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger-primary focus-visible:opacity-100"
          >
            <CloseOutline className="size-3.5" />
          </button>
        )}
      </Cell>
    </tr>
  );
}

function Legend() {
  const swatch = (className: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", className)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-2xs-medium text-tertiary">
      {swatch("bg-success-subtle", "Done / approved")}
      {swatch("bg-warning-subtle", "Under way")}
      {swatch("bg-info-subtle", "Sent / in the pipeline")}
      {swatch("bg-[#F06A25]/15", "Open site issue")}
      {swatch(
        "bg-danger-subtle ring-1 ring-[var(--border-color-danger-strong)]",
        "Overdue against the stage target / rework"
      )}
    </div>
  );
}
