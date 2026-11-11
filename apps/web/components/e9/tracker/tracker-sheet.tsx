/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ClipboardEvent, ReactNode } from "react";
import { AddOutline, ClockOutline, CloseOutline, SearchOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { useE9Boq, useE9Floors, useE9Items, useE9Photos, useE9Scopes } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { DateCell, NumberCell, SelectCell, TextCell } from "./cells";
import {
  BILL_NOW,
  BILL_WHEN,
  CLIENT_SIGN_OFF,
  DISPATCH_STATUS,
  E9_TRACKER_STAGES,
  HOLD_REASONS,
  HOLD_STATUS,
  INSTALLATION_STATUS,
  ISSUE_RESOLVED,
  MATERIAL_STATUS,
  PRE_PRESS,
  PRODUCTION_STATUS,
  QUALITY_CHECK,
  SITE_AUDIT_STATUS,
  SITE_ISSUES,
} from "./constants";
import type { TE9ScopeKey, TE9StageKey } from "./constants";
import type { TE9Attachment, TE9ProjectScope, TE9ScopeItem } from "./logic";
import {
  formatMeasure,
  isFilled,
  isStageOverdue,
  itemArea,
  itemMeasure,
  joinDcs,
  parsePastedDate,
  splitDcs,
} from "./logic";
import { E9ItemHistoryModal, E9PhotoCell, E9PhotosModal } from "./photos-history";
import { mailSearchUrl } from "../commercial/shared";
import { e9Confirm } from "../confirm";
import { E9ReprintQuickModal } from "./reprint-quick";
import { E9ColumnsModal, E9FloorsModal, E9ImportModal, E9ScopesModal } from "./setup-panels";

const stageColor = (key: TE9StageKey) => E9_TRACKER_STAGES.find((stage) => stage.key === key)?.color ?? "#888";
const GREY = "#6B7280";

const siteIssuesFor = (scope: string) => SITE_ISSUES[scope as TE9ScopeKey] ?? SITE_ISSUES.internal_signages;

type TRowContext = {
  item: TE9ScopeItem;
  scope: TE9ProjectScope | undefined;
  disabled: boolean;
  empty: boolean;
  overdue: (stage: TE9StageKey) => boolean;
  save: (patch: Partial<TE9ScopeItem>) => void;
  photos: TE9Attachment[];
  openPhotos: () => void;
  /** photos of the finished installation */
  installPhotos: TE9Attachment[];
  openInstallPhotos: () => void;
  floorListId: string;
  boqListId: string;
  /** BOQ numbers on this project's BOQ (upper case); null while there is no BOQ */
  boqNos: Set<string> | null;
  /** BOQ No. -> scope of that line; scope -> first BOQ No. of that scope */
  boqLineScope: Map<string, string> | null;
  boqLineForScope: Map<string, string> | null;
  scopeLabel: (key: string) => string;
  openReprint: () => void;
  workspaceSlug: string;
  projectId: string;
};

type TColumn = {
  key: string;
  /** which "Columns" switch hides it (several columns can share one) */
  hideKey: string;
  label: string;
  width: number;
  band: string;
  render: (ctx: TRowContext) => ReactNode;
  className?: string;
  /** worked out by the sheet: nothing to type here */
  auto?: boolean;
};

const BAND_COLORS: Record<string, string> = {
  "Item details": GREY,
  "1 · Site audit": stageColor("site_audit"),
  "Site issues": "#F06A25",
  "Production size (what we send)": "#0E7490",
  "2 · Pre-press": stageColor("pre_press"),
  "3 · Production & material": stageColor("material"),
  "4 · Quality & dispatch": stageColor("delivered"),
  "5 · Installation": stageColor("installation"),
  "6 · Certify & hand over": stageColor("sign_off"),
  Notes: GREY,
  "On hold / cancel / billing": "#B45309",
};

const text = (field: keyof TE9ScopeItem, label: string, placeholder?: string) => (ctx: TRowContext) => (
  <TextCell
    label={label}
    value={(ctx.item[field] as string) ?? ""}
    disabled={ctx.disabled}
    placeholder={placeholder}
    onSave={(value) => ctx.save({ [field]: value })}
  />
);

/** A calculated value (blue-grey in the template): number + unit, never typed. */
function AutoCell({
  value,
  unit,
  hint,
  tone,
}: {
  value: string | null | undefined;
  unit: "sqft" | "nos";
  hint?: string;
  tone?: "warn" | "ok";
}) {
  const number = value === null || value === undefined ? null : Number(value);
  return (
    <div className="flex flex-col px-2 text-right leading-tight" title={hint}>
      <span
        className={cn(
          "text-body-xs-semibold tabular-nums",
          tone === "warn" ? "text-warning-primary" : tone === "ok" ? "text-success-primary" : "text-primary"
        )}
      >
        {number === null ? "—" : number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
      </span>
      {number !== null && (
        <span className="text-body-2xs-regular text-tertiary">{unit === "sqft" ? "sq ft" : "Nos"}</span>
      )}
    </div>
  );
}

const numberColumn = (
  key: string,
  hideKey: string,
  label: string,
  band: string,
  field: keyof TE9ScopeItem,
  ariaLabel: string
): TColumn => ({
  key,
  hideKey,
  label,
  width: 80,
  band,
  render: (ctx) => (
    <NumberCell
      label={ariaLabel}
      value={(ctx.item[field] as string | null) ?? null}
      disabled={ctx.disabled}
      onSave={(v) => ctx.save({ [field]: v })}
    />
  ),
});

/** How a pasted Excel cell lands in each typed column (calculated columns are skipped). */
type TPasteSpec = {
  field: keyof TE9ScopeItem;
  kind: "text" | "upper" | "number" | "date" | "select" | "dcs";
  options?: (item: TE9ScopeItem) => string[];
};
const PASTE: Record<string, TPasteSpec> = {
  boq: { field: "boq_item_no", kind: "upper" },
  floor: { field: "floor_area", kind: "text" },
  plan: { field: "floor_plan_ref", kind: "text" },
  desc: { field: "description", kind: "text" },
  audit: { field: "site_audit_status", kind: "select", options: () => SITE_AUDIT_STATUS },
  h: { field: "height_in", kind: "number" },
  w: { field: "width_in", kind: "number" },
  qty: { field: "qty", kind: "number" },
  issue: { field: "site_issue", kind: "select", options: (item) => siteIssuesFor(item.scope) },
  resolved: { field: "issue_resolved", kind: "select", options: () => ISSUE_RESOLVED },
  prodh: { field: "production_height_in", kind: "number" },
  prodw: { field: "production_width_in", kind: "number" },
  prodqty: { field: "production_qty", kind: "number" },
  prepress: { field: "pre_press", kind: "select", options: () => PRE_PRESS },
  jc: { field: "jc_no", kind: "text" },
  production: { field: "production_status", kind: "select", options: () => PRODUCTION_STATUS },
  material: { field: "material_status", kind: "select", options: () => MATERIAL_STATUS },
  qc: { field: "quality_check", kind: "select", options: () => QUALITY_CHECK },
  qcby: { field: "qc_done_by", kind: "text" },
  dcs: { field: "dc_nos", kind: "dcs" },
  dispatch: { field: "dispatch_status", kind: "select", options: () => DISPATCH_STATUS },
  install: { field: "installation_status", kind: "select", options: () => INSTALLATION_STATUS },
  installdate: { field: "installation_date", kind: "date" },
  installedby: { field: "installed_by", kind: "text" },
  certh: { field: "certified_height_in", kind: "number" },
  certw: { field: "certified_width_in", kind: "number" },
  certqty: { field: "certified_qty", kind: "number" },
  signoff: { field: "client_sign_off", kind: "select", options: () => CLIENT_SIGN_OFF },
  remarks: { field: "remarks", kind: "text" },
  holdstatus: { field: "hold_status", kind: "select", options: () => HOLD_STATUS },
  holdreason: { field: "hold_reason", kind: "select", options: () => HOLD_REASONS },
  holdsince: { field: "hold_since", kind: "date" },
  replacedby: { field: "replaced_by", kind: "text" },
  billnow: { field: "bill_now", kind: "select", options: () => BILL_NOW },
  billwhen: { field: "bill_when", kind: "select", options: () => BILL_WHEN },
};

/** One pasted text -> the value to save, or undefined when it does not fit the column. */
export const pastedValue = (spec: TPasteSpec, raw: string, item: TE9ScopeItem): string | null | undefined => {
  const value = raw.trim();
  if (spec.kind === "text" || spec.kind === "dcs") return value;
  if (spec.kind === "upper") return value.toUpperCase();
  if (spec.kind === "number") {
    const clean = value.replace(/,/g, "");
    if (clean === "") return null;
    return Number.isFinite(Number(clean)) && Number(clean) >= 0 ? clean : undefined;
  }
  if (spec.kind === "date") return value === "" ? null : (parsePastedDate(value) ?? undefined);
  const options = spec.options?.(item) ?? [];
  return options.find((option) => option.toLowerCase() === value.toLowerCase());
};

const COLUMNS: TColumn[] = [
  {
    key: "boq",
    hideKey: "boq_item_no",
    label: "BOQ No.",
    width: 84,
    band: "Item details",
    render: (ctx) => {
      const value = ctx.item.boq_item_no ?? "";
      const key = value.trim().toUpperCase();
      const notOnBoq = !!ctx.boqNos && !ctx.empty && !ctx.boqNos.has(key);
      // BOQ line of another scope (e.g. Glass Film row on a Wall Graphics line) -> amber + one-click fix
      const lineScope = ctx.boqLineScope?.get(key);
      const wrongScope = !notOnBoq && !ctx.empty && !!lineScope && lineScope !== ctx.item.scope;
      const suggestion = wrongScope ? ctx.boqLineForScope?.get(ctx.item.scope) : undefined;
      return (
        <span
          className={cn("relative block", wrongScope && "rounded-md ring-1 ring-[#F59E0B]")}
          title={
            notOnBoq
              ? value
                ? `${value} is not on the BOQ`
                : "Pick the BOQ line for this row"
              : wrongScope
                ? `${value} is a ${ctx.scopeLabel(lineScope ?? "")} line, but this row is ${ctx.scopeLabel(ctx.item.scope)}`
                : undefined
          }
        >
          <TextCell
            label="BOQ item no."
            value={value}
            listId={ctx.boqListId}
            overdue={notOnBoq}
            disabled={ctx.disabled}
            placeholder="BO1"
            onSave={(next) => ctx.save({ boq_item_no: next.toUpperCase() })}
          />
          {wrongScope && suggestion && !ctx.disabled && (
            <button
              type="button"
              onClick={() => ctx.save({ boq_item_no: suggestion })}
              className="absolute -top-2 -right-1 rounded bg-[#F59E0B] px-1 text-[10px] leading-4 font-semibold text-black"
              title={`Change to ${suggestion} (the ${ctx.scopeLabel(ctx.item.scope)} line)`}
            >
              →{suggestion}
            </button>
          )}
        </span>
      );
    },
  },
  {
    key: "stage",
    auto: true,
    hideKey: "current_stage",
    label: "Current stage",
    width: 128,
    band: "Item details",
    className: "px-2",
    render: ({ item, empty }) => (
      <span className="block truncate text-body-xs-medium text-secondary" title={item.current_stage}>
        {empty ? "" : item.current_stage}
      </span>
    ),
  },
  {
    key: "floor",
    hideKey: "floor_area",
    label: "Floor / Area",
    width: 150,
    band: "Item details",
    render: (ctx) => (
      <TextCell
        label="Floor / area"
        value={ctx.item.floor_area}
        disabled={ctx.disabled}
        placeholder="Pick or type a floor"
        listId={ctx.floorListId}
        onSave={(value) => ctx.save({ floor_area: value })}
      />
    ),
  },
  {
    key: "plan",
    hideKey: "floor_plan_ref",
    label: "Floor plan",
    width: 96,
    band: "Item details",
    render: text("floor_plan_ref", "Floor plan"),
  },
  {
    key: "desc",
    hideKey: "description",
    label: "Description",
    width: 200,
    band: "Item details",
    render: text("description", "Description", "e.g. Wall 01"),
  },
  {
    key: "audit",
    hideKey: "site_audit_status",
    label: "Site audit",
    width: 150,
    band: "1 · Site audit",
    render: (ctx) => (
      <SelectCell
        label="Site audit status"
        value={ctx.item.site_audit_status}
        options={SITE_AUDIT_STATUS}
        disabled={ctx.disabled}
        overdue={ctx.overdue("site_audit")}
        onSave={(value) => ctx.save({ site_audit_status: value })}
      />
    ),
  },
  {
    key: "h",
    hideKey: "size",
    label: "H (in)",
    width: 76,
    band: "1 · Site audit",
    render: (ctx) => (
      <NumberCell
        label="Height in inches"
        value={ctx.item.height_in}
        disabled={ctx.disabled}
        onSave={(v) => ctx.save({ height_in: v })}
      />
    ),
  },
  {
    key: "w",
    hideKey: "size",
    label: "W (in)",
    width: 76,
    band: "1 · Site audit",
    render: (ctx) => (
      <NumberCell
        label="Width in inches"
        value={ctx.item.width_in}
        disabled={ctx.disabled}
        onSave={(v) => ctx.save({ width_in: v })}
      />
    ),
  },
  {
    key: "qty",
    hideKey: "size",
    label: "Qty",
    width: 64,
    band: "1 · Site audit",
    render: (ctx) => (
      <NumberCell label="Quantity" value={ctx.item.qty} disabled={ctx.disabled} onSave={(v) => ctx.save({ qty: v })} />
    ),
  },
  {
    key: "area",
    hideKey: "size",
    label: "Area / unit",
    width: 110,
    band: "1 · Site audit",
    className: "px-2",
    render: ({ item, scope, empty, disabled, save }) => (
      <div className="flex flex-col leading-tight">
        <span className="text-right text-body-xs-semibold text-primary tabular-nums">
          {item.unit === "sqft"
            ? item.area_sqft
              ? Number(item.area_sqft).toLocaleString("en-IN", { minimumFractionDigits: 2 })
              : "—"
            : `${Number(item.qty || (empty ? 0 : 1))}`}
        </span>
        {scope?.unit_mode === "either" && !disabled ? (
          <select
            aria-label="Count in"
            className="mt-0.5 cursor-pointer bg-transparent text-right text-body-2xs-regular text-tertiary outline-none"
            value={item.unit_override}
            onChange={(event) => save({ unit_override: event.target.value as TE9ScopeItem["unit_override"] })}
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
    ),
  },
  {
    key: "photos",
    hideKey: "photos",
    label: "Photos",
    width: 110,
    band: "1 · Site audit",
    render: (ctx) => (
      <E9PhotoCell
        workspaceSlug={ctx.workspaceSlug}
        projectId={ctx.projectId}
        item={ctx.item}
        photos={ctx.photos}
        disabled={ctx.disabled}
        onOpen={ctx.openPhotos}
      />
    ),
  },
  {
    key: "issue",
    hideKey: "site_issue",
    label: "Site issue",
    width: 200,
    band: "Site issues",
    render: ({ item, disabled, save }) => (
      <SelectCell
        label="Site issue"
        value={item.site_issue}
        options={siteIssuesFor(item.scope)}
        disabled={disabled}
        onSave={(value) =>
          save({
            site_issue: value,
            issue_resolved: value === "No issues" ? "N/A" : item.issue_resolved === "N/A" ? "No" : item.issue_resolved,
          })
        }
      />
    ),
  },
  {
    key: "resolved",
    hideKey: "site_issue",
    label: "Resolved?",
    width: 92,
    band: "Site issues",
    render: ({ item, disabled, save }) => (
      <SelectCell
        label="Issue resolved"
        value={item.issue_resolved}
        options={ISSUE_RESOLVED}
        disabled={disabled}
        onSave={(v) => save({ issue_resolved: v })}
      />
    ),
  },
  numberColumn(
    "prodh",
    "production_size",
    "Prod. H (in)",
    "Production size (what we send)",
    "production_height_in",
    "Production height in inches"
  ),
  numberColumn(
    "prodw",
    "production_size",
    "Prod. W (in)",
    "Production size (what we send)",
    "production_width_in",
    "Production width in inches"
  ),
  numberColumn(
    "prodqty",
    "production_size",
    "Prod. Qty",
    "Production size (what we send)",
    "production_qty",
    "Production quantity"
  ),
  {
    key: "prodmeasure",
    auto: true,
    hideKey: "production_size",
    label: "Production qty",
    width: 104,
    band: "Production size (what we send)",
    render: ({ item, empty }) =>
      empty ? null : (
        <AutoCell
          value={item.production_measure}
          unit={item.unit}
          hint={
            item.wastage
              ? `Wastage ${Number(item.wastage).toLocaleString("en-IN")} sq ft vs measured`
              : "Blank production size = same as measured"
          }
          tone={item.wastage && Number(item.wastage) > 0 ? "warn" : undefined}
        />
      ),
  },
  {
    key: "prepress",
    hideKey: "pre_press",
    label: "Pre-press",
    width: 200,
    band: "2 · Pre-press",
    render: (ctx) => (
      <SelectCell
        label="Pre-press"
        value={ctx.item.pre_press}
        options={PRE_PRESS}
        disabled={ctx.disabled}
        overdue={ctx.overdue("pre_press")}
        onSave={(v) => ctx.save({ pre_press: v })}
      />
    ),
  },
  {
    key: "jc",
    hideKey: "jc_no",
    label: "JC No.",
    width: 110,
    band: "2 · Pre-press",
    render: (ctx) => (
      <TextCell
        label="JC number"
        value={ctx.item.jc_no}
        disabled={ctx.disabled}
        onSave={(v) => ctx.save({ jc_no: v })}
      />
    ),
  },
  {
    key: "eproof",
    hideKey: "jc_no",
    label: "E-Proof mail",
    width: 120,
    band: "2 · Pre-press",
    render: (ctx) =>
      ctx.item.jc_no ? (
        <a
          href={mailSearchUrl(ctx.item.jc_no)}
          target="_blank"
          rel="noopener noreferrer"
          title="Opens Gmail and searches every folder for this JC number"
          className="block truncate px-2 text-body-xs-semibold text-accent-primary hover:underline"
        >
          ✉ {ctx.item.jc_no} · open mail
        </a>
      ) : (
        <span className="px-2 text-placeholder">—</span>
      ),
  },
  {
    key: "production",
    hideKey: "production_status",
    label: "Production",
    width: 140,
    band: "3 · Production & material",
    render: ({ item, disabled, save }) => (
      <SelectCell
        label="Production status"
        value={item.production_status}
        options={PRODUCTION_STATUS}
        disabled={disabled}
        onSave={(v) => save({ production_status: v })}
      />
    ),
  },
  {
    key: "material",
    hideKey: "material_status",
    label: "Material",
    width: 150,
    band: "3 · Production & material",
    render: (ctx) => (
      <SelectCell
        label="Material status"
        value={ctx.item.material_status}
        options={MATERIAL_STATUS}
        blankLabel="— (no JC yet)"
        disabled={ctx.disabled}
        overdue={ctx.overdue("material")}
        onSave={(v) => ctx.save({ material_status: v })}
      />
    ),
  },
  {
    key: "qc",
    hideKey: "quality_check",
    label: "Quality check",
    width: 136,
    band: "4 · Quality & dispatch",
    render: ({ item, disabled, save }) => (
      <SelectCell
        label="Quality check"
        value={item.quality_check}
        options={QUALITY_CHECK}
        disabled={disabled}
        onSave={(v) => save({ quality_check: v })}
      />
    ),
  },
  {
    key: "qcby",
    hideKey: "qc_done_by",
    label: "QC by",
    width: 110,
    band: "4 · Quality & dispatch",
    render: text("qc_done_by", "QC done by"),
  },
  {
    key: "dcs",
    hideKey: "dc_nos",
    label: "DC No. = Qty",
    width: 190,
    band: "4 · Quality & dispatch",
    render: (ctx) => (
      <TextCell
        label="DC numbers with quantity, e.g. 3500=190, 3501=60"
        value={joinDcs(ctx.item.dc_nos ?? "", ctx.item.dc_qty ?? "")}
        disabled={ctx.disabled}
        placeholder="3500=190, 3501=60"
        onSave={(value) => ctx.save(splitDcs(value))}
      />
    ),
  },
  {
    key: "dispatch",
    hideKey: "dispatch_status",
    label: "Dispatch",
    width: 168,
    band: "4 · Quality & dispatch",
    render: (ctx) => (
      <SelectCell
        label="Dispatch status"
        value={ctx.item.dispatch_status}
        options={DISPATCH_STATUS}
        disabled={ctx.disabled}
        overdue={ctx.overdue("delivered")}
        onSave={(v) => ctx.save({ dispatch_status: v })}
      />
    ),
  },
  {
    key: "dispatched",
    auto: true,
    hideKey: "dc_qty",
    label: "Dispatched",
    width: 96,
    band: "4 · Quality & dispatch",
    render: ({ item, empty }) =>
      empty || !item.dc_nos ? null : (
        <AutoCell
          value={item.dispatched}
          unit={item.unit}
          hint={item.dc_list.map((row) => `DC ${row.dc}: ${row.qty ?? "qty not typed"}`).join("\n")}
        />
      ),
  },
  {
    key: "balance",
    auto: true,
    hideKey: "dc_qty",
    label: "Balance to send",
    width: 104,
    band: "4 · Quality & dispatch",
    render: ({ item, empty }) =>
      empty || !item.dc_nos ? null : (
        <AutoCell
          value={item.balance}
          unit={item.unit}
          tone={item.balance && Number(item.balance) > 0 ? "warn" : "ok"}
        />
      ),
  },
  {
    key: "install",
    hideKey: "installation_status",
    label: "Installation",
    width: 156,
    band: "5 · Installation",
    render: (ctx) => (
      <SelectCell
        label="Installation status"
        value={ctx.item.installation_status}
        options={INSTALLATION_STATUS}
        disabled={ctx.disabled}
        overdue={ctx.overdue("installation")}
        onSave={(v) => ctx.save({ installation_status: v })}
      />
    ),
  },
  {
    key: "installdate",
    hideKey: "installation_date",
    label: "Install date",
    width: 136,
    band: "5 · Installation",
    render: ({ item, disabled, save }) => (
      <DateCell
        label="Installation date"
        value={item.installation_date}
        disabled={disabled}
        onSave={(v) => save({ installation_date: v })}
      />
    ),
  },
  {
    key: "installedby",
    hideKey: "installed_by",
    label: "Installed by",
    width: 130,
    band: "5 · Installation",
    render: text("installed_by", "Installed by", "Team"),
  },
  {
    key: "installphoto",
    hideKey: "installed_photo",
    label: "Installed photo",
    width: 120,
    band: "5 · Installation",
    render: (ctx) => (
      <E9PhotoCell
        workspaceSlug={ctx.workspaceSlug}
        projectId={ctx.projectId}
        item={ctx.item}
        photos={ctx.installPhotos}
        disabled={ctx.disabled}
        onOpen={ctx.openInstallPhotos}
      />
    ),
  },
  numberColumn(
    "certh",
    "certified",
    "Cert. H (in)",
    "6 · Certify & hand over",
    "certified_height_in",
    "Certified height in inches"
  ),
  numberColumn(
    "certw",
    "certified",
    "Cert. W (in)",
    "6 · Certify & hand over",
    "certified_width_in",
    "Certified width in inches"
  ),
  numberColumn("certqty", "certified", "Cert. Qty", "6 · Certify & hand over", "certified_qty", "Certified quantity"),
  {
    key: "certmeasure",
    auto: true,
    hideKey: "certified",
    label: "Certifiable",
    width: 100,
    band: "6 · Certify & hand over",
    render: ({ item, empty }) =>
      empty ? null : <AutoCell value={item.certified_measure} unit={item.unit} hint="Used for billing" />,
  },
  {
    key: "signoff",
    hideKey: "client_sign_off",
    label: "Client sign-off",
    width: 152,
    band: "6 · Certify & hand over",
    render: (ctx) => (
      <SelectCell
        label="Client sign-off"
        value={ctx.item.client_sign_off}
        options={CLIENT_SIGN_OFF}
        disabled={ctx.disabled}
        overdue={ctx.overdue("sign_off")}
        onSave={(v) => ctx.save({ client_sign_off: v })}
      />
    ),
  },
  {
    key: "remarks",
    hideKey: "remarks",
    label: "Remarks",
    width: 200,
    band: "Notes",
    render: text("remarks", "Remarks"),
  },
  {
    key: "resent",
    hideKey: "resent",
    label: "Re-sent",
    width: 110,
    band: "Notes",
    className: "px-2",
    render: ({ item, openReprint, empty }) =>
      item.resent ? (
        <button
          type="button"
          onClick={openReprint}
          title="See and add reprints for this item"
          className="rounded bg-danger-subtle px-1.5 py-0.5 text-body-2xs-semibold text-danger-primary hover:underline"
        >
          {item.resent}
        </button>
      ) : empty ? null : (
        <button
          type="button"
          onClick={openReprint}
          className="px-1 text-body-2xs-medium text-placeholder hover:text-accent-primary"
        >
          + reprint
        </button>
      ),
  },
  {
    key: "holdstatus",
    hideKey: "hold_cancel",
    label: "On hold / cancelled?",
    width: 150,
    band: "On hold / cancel / billing",
    render: (ctx) => (
      <SelectCell
        label="On hold or cancelled"
        value={ctx.item.hold_status}
        options={HOLD_STATUS}
        blankLabel="—"
        disabled={ctx.disabled}
        onSave={(v) =>
          // stamp today's date when an item goes on hold / is cancelled and nobody typed one
          ctx.save({
            hold_status: v as TE9ScopeItem["hold_status"],
            ...(v && !ctx.item.hold_since ? { hold_since: new Date().toLocaleDateString("en-CA") } : {}),
          })
        }
      />
    ),
  },
  {
    key: "holdreason",
    hideKey: "hold_cancel",
    label: "Reason",
    width: 200,
    band: "On hold / cancel / billing",
    render: (ctx) => (
      <SelectCell
        label="Hold or cancel reason"
        value={ctx.item.hold_reason}
        options={[
          "",
          ...HOLD_REASONS,
          ...(HOLD_REASONS.includes(ctx.item.hold_reason) ? [] : [ctx.item.hold_reason]),
        ].filter((option, index, all) => all.indexOf(option) === index)}
        blankLabel="—"
        disabled={ctx.disabled}
        onSave={(v) => ctx.save({ hold_reason: v })}
      />
    ),
  },
  {
    key: "holdsince",
    hideKey: "hold_cancel",
    label: "Since (date)",
    width: 136,
    band: "On hold / cancel / billing",
    render: ({ item, disabled, save }) => (
      <DateCell
        label="On hold since"
        value={item.hold_since}
        disabled={disabled}
        onSave={(v) => save({ hold_since: v })}
      />
    ),
  },
  {
    key: "replacedby",
    hideKey: "hold_cancel",
    label: "Replaced by (item code) / note",
    width: 190,
    band: "On hold / cancel / billing",
    render: text("replaced_by", "Replaced by", "Item code"),
  },
  {
    key: "billnow",
    hideKey: "hold_cancel",
    label: "Bill now? (hold)",
    width: 120,
    band: "On hold / cancel / billing",
    render: (ctx) => (
      <SelectCell
        label="Bill now (held items)"
        value={ctx.item.bill_now}
        options={BILL_NOW}
        blankLabel="—"
        disabled={ctx.disabled}
        onSave={(v) => ctx.save({ bill_now: v as TE9ScopeItem["bill_now"] })}
      />
    ),
  },
  {
    key: "billwhen",
    hideKey: "hold_cancel",
    label: "Bill when? (blank = scope)",
    width: 150,
    band: "On hold / cancel / billing",
    render: (ctx) => (
      <SelectCell
        label="Bill when"
        value={ctx.item.bill_when}
        options={BILL_WHEN}
        blankLabel="scope setting"
        disabled={ctx.disabled}
        onSave={(v) => ctx.save({ bill_when: v as TE9ScopeItem["bill_when"] })}
      />
    ),
  },
];

type THistoryStep =
  | {
      kind: "patch";
      label: string;
      changes: { id: string; before: Partial<TE9ScopeItem>; after: Partial<TE9ScopeItem> }[];
    }
  | { kind: "add" | "delete"; label: string; ids: string[] }
  | { kind: "batch"; label: string; steps: THistoryStep[] };
const HISTORY_LIMIT = 50;

const CODE_WIDTH = 64;
const ACTIONS_WIDTH = 96;
/** width of a folded stage group */
const DOOR_WIDTH = 34;
const ALWAYS_OPEN_BAND = "Item details";
const DEFAULT_OPEN_BANDS = ["1 · Site audit"];
const shortBand = (label: string) => label.replace(/^\d+\s·\s/, "").replace(/\s*\(.*\)$/, "");

type TOpenPanel = "scopes" | "floors" | "columns" | "import" | null;
type Props = { workspaceSlug: string; project: TE9Project };

export function E9TrackerSheet({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Items(workspaceSlug, project.id);
  const { data: scopes } = useE9Scopes(workspaceSlug, project.id);
  const { data: floors } = useE9Floors(workspaceSlug, project.id);
  const { data: photos } = useE9Photos(workspaceSlug, project.id);
  const { data: installPhotos } = useE9Photos(workspaceSlug, project.id, "install_photo");
  const floorListId = useId();
  const boqListId = useId();
  const { data: boq } = useE9Boq(workspaceSlug, project.id);

  const enabledScopes = useMemo(() => (scopes ?? []).filter((scope) => scope.enabled), [scopes]);
  // links from the BOQ, JC & DC pages open the tracker on a scope with a search (?scope=...&q=...)
  const searchParams = useSearchParams();
  const linkScope = searchParams.get("scope");
  const linkQuery = searchParams.get("q");
  const [scopeKey, setScopeKey] = useState<string | null>(linkScope);
  const [floorFilter, setFloorFilter] = useState("all");
  const [search, setSearch] = useState(linkQuery ?? "");
  useEffect(() => {
    if (linkScope) setScopeKey(linkScope);
    if (linkQuery !== null) {
      setSearch(linkQuery);
      setFloorFilter("all");
    }
  }, [linkScope, linkQuery]);
  const [adding, setAdding] = useState(false);
  const [panel, setPanel] = useState<TOpenPanel>(null);
  const [photoItem, setPhotoItem] = useState<TE9ScopeItem | null>(null);
  const [installPhotoItem, setInstallPhotoItem] = useState<TE9ScopeItem | null>(null);
  const [historyItem, setHistoryItem] = useState<TE9ScopeItem | null>(null);

  // stay on a scope that is switched on
  useEffect(() => {
    if (enabledScopes.length && !enabledScopes.some((scope) => scope.key === scopeKey))
      setScopeKey(enabledScopes[0].key);
  }, [enabledScopes, scopeKey]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const canEdit = data?.can_edit ?? false;
  const canSetUp = project.can_edit;
  const scope = enabledScopes.find((entry) => entry.key === scopeKey);
  const hidden = new Set(project.e9.hidden_columns ?? []);
  const columns = COLUMNS.filter((column) => !hidden.has(column.hideKey));

  const photosByItem = useMemo(() => {
    const map = new Map<string, TE9Attachment[]>();
    for (const photo of photos ?? []) if (photo.item) map.set(photo.item, [...(map.get(photo.item) ?? []), photo]);
    return map;
  }, [photos]);
  const installPhotosByItem = useMemo(() => {
    const map = new Map<string, TE9Attachment[]>();
    for (const photo of installPhotos ?? [])
      if (photo.item) map.set(photo.item, [...(map.get(photo.item) ?? []), photo]);
    return map;
  }, [installPhotos]);

  const floorNames = useMemo(
    () => [
      ...new Set([
        ...(floors ?? []).map((floor) => floor.name),
        ...items.map((item) => item.floor_area).filter(Boolean),
      ]),
    ],
    [floors, items]
  );

  const boqLineScope = useMemo(
    () =>
      boq && boq.lines.length > 0
        ? new Map(boq.lines.filter((line) => line.scope).map((line) => [line.line_no.toUpperCase(), line.scope]))
        : null,
    [boq]
  );
  const boqLineForScope = useMemo(() => {
    if (!boq) return null;
    const map = new Map<string, string>();
    for (const line of boq.lines) if (line.scope && !map.has(line.scope)) map.set(line.scope, line.line_no);
    return map;
  }, [boq]);
  const scopeLabel = useCallback((key: string) => scopes?.find((entry) => entry.key === key)?.label ?? key, [scopes]);
  const [reprintItem, setReprintItem] = useState<TE9ScopeItem | null>(null);

  // ---- stage groups that slide open / shut like a door (remembered per project) ----
  const bandStoreKey = `e9-open-bands-${project.id}`;
  const [openBands, setOpenBands] = useState<Set<string>>(() => new Set(DEFAULT_OPEN_BANDS));
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(bandStoreKey);
      if (saved) setOpenBands(new Set(JSON.parse(saved) as string[]));
    } catch {
      // storage blocked: defaults
    }
  }, [bandStoreKey]);
  const tween = useRef(new Map<string, number>());
  const colRefs = useRef(new Map<string, HTMLTableColElement>());
  const tableRef = useRef<HTMLTableElement>(null);
  const [, redraw] = useState(0);
  const remember = (next: Set<string>) => {
    try {
      window.localStorage.setItem(bandStoreKey, JSON.stringify([...next]));
    } catch {
      // storage blocked: this visit only
    }
  };

  const boqNos = useMemo(
    () => (boq && boq.lines.length > 0 ? new Set(boq.lines.map((line) => line.line_no.toUpperCase())) : null),
    [boq]
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    // a search that is exactly an item code (W1) opens just that row, not W10, W11…
    if (query && items.some((item) => item.scope === scopeKey && item.item_code.toLowerCase() === query))
      return items.filter((item) => item.scope === scopeKey && item.item_code.toLowerCase() === query);
    return items
      .filter((item) => item.scope === scopeKey)
      .filter(
        (item) => floorFilter === "all" || (floorFilter === "" ? !item.floor_area : item.floor_area === floorFilter)
      )
      .filter((item) =>
        !query
          ? true
          : [item.item_code, item.floor_area, item.description, item.boq_item_no, item.jc_no, item.dc_nos]
              .join(" ")
              .toLowerCase()
              .includes(query)
      );
  }, [items, scopeKey, floorFilter, search]);

  const filledByScope = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) if (isFilled(item)) counts[item.scope] = (counts[item.scope] ?? 0) + 1;
    return counts;
  }, [items]);

  // ---- Undo / redo (Ctrl + Z / Ctrl + Y), last 50 changes, like Excel ----
  const undoStack = useRef<THistoryStep[]>([]);
  const redoStack = useRef<THistoryStep[]>([]);
  const [, historyTick] = useState(0);
  const pushHistory = (step: THistoryStep) => {
    undoStack.current = [...undoStack.current.slice(-(HISTORY_LIMIT - 1)), step];
    redoStack.current = [];
    historyTick((value) => value + 1);
  };
  const historyBusy = useRef(false);
  const runStep = async (step: THistoryStep, direction: "undo" | "redo"): Promise<void> => {
    const undoing = direction === "undo";
    if (step.kind === "batch") {
      const steps = undoing ? [...step.steps].reverse() : step.steps;
      for (const inner of steps) await runStep(inner, direction);
      return;
    }
    if (step.kind === "patch") {
      await Promise.all(
        step.changes.map((change) =>
          e9ProjectService.updateItem(workspaceSlug, project.id, change.id, undoing ? change.before : change.after)
        )
      );
      return;
    }
    // add (undo = put rows aside) / delete (undo = bring them back)
    const bringBack = (step.kind === "delete") === undoing;
    for (const id of step.ids) {
      if (bringBack) await e9ProjectService.restoreItem(workspaceSlug, project.id, id);
      else await e9ProjectService.deleteItem(workspaceSlug, project.id, id);
    }
  };
  const travel = async (direction: "undo" | "redo") => {
    if (historyBusy.current) return;
    const from = direction === "undo" ? undoStack : redoStack;
    const to = direction === "undo" ? redoStack : undoStack;
    const step = from.current[from.current.length - 1];
    if (!step) {
      setToast({ type: "info", title: direction === "undo" ? "Nothing to undo" : "Nothing to redo" });
      return;
    }
    historyBusy.current = true;
    from.current = from.current.slice(0, -1);
    try {
      await runStep(step, direction);
      to.current = [...to.current, step];
      setToast({ type: "success", title: `${direction === "undo" ? "Undone" : "Redone"}: ${step.label}` });
    } catch {
      setToast({ type: "error", title: `Couldn't ${direction}`, message: "Please try again." });
    } finally {
      historyBusy.current = false;
      historyTick((value) => value + 1);
      await mutate();
    }
  };
  const travelRef = useRef(travel);
  travelRef.current = travel;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = key === "y" || (key === "z" && event.shiftKey);
      if (!isUndo && !isRedo) return;
      const active = document.activeElement as HTMLElement | null;
      // typing still in progress inside a cell, or another text box / dialog: leave it to the browser
      if (active?.closest("[role=dialog]")) return;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        if (!active.hasAttribute("data-e9-nav") || active.getAttribute("data-dirty") === "1") return;
      }
      event.preventDefault();
      void travelRef.current(isUndo ? "undo" : "redo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = async (item: TE9ScopeItem, patch: Partial<TE9ScopeItem>) => {
    const before = Object.fromEntries(
      Object.keys(patch).map((key) => [key, item[key as keyof TE9ScopeItem] ?? null])
    ) as Partial<TE9ScopeItem>;
    pushHistory({ kind: "patch", label: `${item.item_code} edit`, changes: [{ id: item.id, before, after: patch }] });
    await mutate(
      (current) =>
        current && { ...current, items: current.items.map((row) => (row.id === item.id ? { ...row, ...patch } : row)) },
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
    if (!scopeKey) return;
    setAdding(true);
    try {
      const created = await e9ProjectService.addItems(workspaceSlug, project.id, scopeKey, count);
      // new rows start on the floor being viewed
      if (floorFilter && floorFilter !== "all") {
        await Promise.all(
          created.map((row) =>
            e9ProjectService.updateItem(workspaceSlug, project.id, row.id, { floor_area: floorFilter })
          )
        );
        created.forEach((row) => (row.floor_area = floorFilter));
      }
      await mutate((current) => current && { ...current, items: [...current.items, ...created] }, {
        revalidate: false,
      });
      pushHistory({ kind: "add", label: `${created.length} new row(s)`, ids: created.map((row) => row.id) });
    } catch {
      setToast({ type: "error", title: "Couldn't add rows", message: "Please try again." });
    } finally {
      setAdding(false);
    }
  };

  /** Paste a block copied from Excel: fills across and down from the cell you are in, adding rows if needed. */
  const pasteBlock = async (event: ClipboardEvent<HTMLTableElement>) => {
    if (!canEdit || !scopeKey) return;
    const raw = event.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n$/, "");
    if (!raw.includes("\t") && !raw.includes("\n")) return; // one value: normal paste into the cell
    const cell = (event.target as HTMLElement).closest<HTMLElement>("td[data-col]");
    const rowId = cell?.closest<HTMLElement>("tr[data-item]")?.dataset.item;
    if (!cell || !rowId) return;
    event.preventDefault();
    const matrix = raw.split("\n").map((line) => line.split("\t"));
    const startRow = rows.findIndex((row) => row.id === rowId);
    // paste runs across the columns you can see (folded stage groups are skipped, like hidden Excel columns)
    const pasteColumns = columns.filter((column) => column.band === ALWAYS_OPEN_BAND || openBands.has(column.band));
    const startCol = pasteColumns.findIndex((column) => column.key === cell.dataset.col);
    if (startRow < 0 || startCol < 0) return;
    let targets = rows.slice(startRow);
    let added = 0;
    const steps: THistoryStep[] = [];
    const changes: { id: string; before: Partial<TE9ScopeItem>; after: Partial<TE9ScopeItem> }[] = [];
    try {
      if (matrix.length > targets.length) {
        const created = await e9ProjectService.addItems(
          workspaceSlug,
          project.id,
          scopeKey,
          matrix.length - targets.length
        );
        added = created.length;
        targets = [...targets, ...created];
        steps.push({ kind: "add", label: "pasted rows", ids: created.map((row) => row.id) });
      }
      let filled = 0;
      let skipped = 0;
      const jobs: Promise<unknown>[] = [];
      matrix.forEach((line, r) => {
        const item = targets[r];
        if (!item) return;
        const patch: Partial<Record<keyof TE9ScopeItem, string | null>> = {};
        line.forEach((text, c) => {
          const column = pasteColumns[startCol + c];
          const spec = column ? PASTE[column.key] : undefined;
          if (!spec) {
            if (text.trim()) skipped += 1;
            return;
          }
          const value = pastedValue(spec, text, item);
          if (value === undefined) skipped += 1;
          else if (spec.kind === "dcs") {
            Object.assign(patch, splitDcs(value ?? ""));
            filled += 1;
          } else {
            patch[spec.field] = value;
            filled += 1;
          }
        });
        if (added && r >= targets.length - added && floorFilter && floorFilter !== "all" && !patch.floor_area)
          patch.floor_area = floorFilter;
        if (Object.keys(patch).length) {
          const before = Object.fromEntries(
            Object.keys(patch).map((key) => [key, item[key as keyof TE9ScopeItem] ?? null])
          ) as Partial<TE9ScopeItem>;
          changes.push({ id: item.id, before, after: patch as Partial<TE9ScopeItem> });
          jobs.push(e9ProjectService.updateItem(workspaceSlug, project.id, item.id, patch as Partial<TE9ScopeItem>));
        }
      });
      await Promise.all(jobs);
      if (changes.length) steps.push({ kind: "patch", label: "paste", changes });
      if (steps.length) pushHistory({ kind: "batch", label: "paste", steps });
      await mutate();
      setToast({
        type: skipped ? "warning" : "success",
        title: `Pasted ${filled} cell${filled === 1 ? "" : "s"}${added ? `, added ${added} row${added === 1 ? "" : "s"}` : ""}`,
        message: skipped
          ? `${skipped} cell(s) skipped: calculated columns, or text that is not one of the column's options / not a number.`
          : undefined,
      });
    } catch {
      await mutate();
      setToast({
        type: "error",
        title: "Couldn't paste everything",
        message: "Some cells may not be saved. Please check.",
      });
    }
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // forget ticks when switching scope / floor / search
  useEffect(() => setSelected(new Set()), [scopeKey, floorFilter, search]);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Delete several rows after one confirmation. */
  const removeMany = async (ids: string[], what: string) => {
    if (ids.length === 0) return;
    if (
      !(await e9Confirm(
        `Delete ${what}?\nThe rows below move up to close the gap (W3 becomes W2…).\nChanged your mind? Press Ctrl + Z to bring them back.`
      ))
    )
      return;
    const done: string[] = [];
    for (const id of ids) {
      try {
        await e9ProjectService.deleteItem(workspaceSlug, project.id, id);
        done.push(id);
      } catch {
        setToast({ type: "error", title: "Some rows could not be deleted", message: "Please try again." });
        break;
      }
    }
    // codes close the gap after a delete, so load them again
    await mutate();
    setSelected(new Set());
    if (done.length) {
      pushHistory({ kind: "delete", label: `delete of ${done.length} row(s)`, ids: [...done].reverse() });
      setToast({ type: "success", title: `Deleted ${done.length} row(s)`, message: "Press Ctrl + Z to undo." });
    }
  };

  const removeRow = async (item: TE9ScopeItem) => {
    const label = [item.item_code, item.description || item.floor_area].filter(Boolean).join(" – ");
    if (
      !(await e9Confirm(
        `Delete ${label}?\nThe rows below it move up to close the gap (W3 becomes W2…).\nChanged your mind? Press Ctrl + Z.`
      ))
    )
      return;
    try {
      await e9ProjectService.deleteItem(workspaceSlug, project.id, item.id);
      pushHistory({ kind: "delete", label: `delete of ${item.item_code}`, ids: [item.id] });
      await mutate();
      setToast({ type: "success", title: `Deleted ${item.item_code}`, message: "Press Ctrl + Z to undo." });
    } catch {
      setToast({ type: "error", title: `Couldn't delete ${item.item_code}`, message: "Please try again." });
    }
  };

  // ---- speed: rows are memoised (one edit redraws one row) and long sheets draw only what is on screen ----
  const rowActionsRef = useRef<TRowHandlers | null>(null);
  const rowActions = useMemo<TRowActions>(
    () => ({
      save: (item, patch) => void rowActionsRef.current?.save(item, patch),
      toggle: (id) => rowActionsRef.current?.toggle(id),
      remove: (item) => void rowActionsRef.current?.remove(item),
      openBand: (band) => rowActionsRef.current?.openBand(band),
      openPhotos: (item) => setPhotoItem(item),
      openInstallPhotos: (item) => setInstallPhotoItem(item),
      openReprint: (item) => setReprintItem(item),
      openHistory: (item) => setHistoryItem(item),
    }),
    []
  );
  const rowShared = useMemo<TRowShared>(
    () => ({
      floorListId,
      boqListId,
      boqNos,
      boqLineScope,
      boqLineForScope,
      scopeLabel,
      workspaceSlug,
      projectId: project.id,
    }),
    [floorListId, boqListId, boqNos, boqLineScope, boqLineForScope, scopeLabel, workspaceSlug, project.id]
  );
  const layoutRef = useRef<{ sig: string; groups: TOpenGroup[] }>({ sig: "", groups: [] });
  const sheetRef = useRef<HTMLDivElement>(null);
  const rowHeight = useRef(DEFAULT_ROW_HEIGHT);
  const scrollFrame = useRef(0);
  const [view, setView] = useState({ first: 0, count: 40 });
  const syncWindow = useCallback(() => {
    const el = sheetRef.current;
    if (!el) return;
    const first = Math.floor(el.scrollTop / rowHeight.current / WINDOW_STEP) * WINDOW_STEP;
    const count = Math.ceil(el.clientHeight / rowHeight.current) + 1;
    setView((prev) => (prev.first === first && prev.count === count ? prev : { first, count }));
  }, []);
  const onSheetScroll = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      syncWindow();
    });
  }, [syncWindow]);
  useEffect(() => {
    const first = sheetRef.current?.querySelector<HTMLElement>("tbody tr[data-item]");
    if (first && first.offsetHeight > 20) rowHeight.current = first.offsetHeight;
    syncWindow();
  }, [rows.length, isLoading, scopeKey, syncWindow]);

  if ((isLoading && !data) || !scopes) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const filledRows = rows.filter(isFilled);
  const blankRows = rows.filter((row) => !isFilled(row));
  const totalNos = filledRows.filter((item) => item.unit === "nos").reduce((t, item) => t + itemMeasure(item), 0);
  const totalArea = filledRows.reduce((t, item) => t + itemArea(item), 0);
  const bandOpenness = (band: string) =>
    band === ALWAYS_OPEN_BAND ? 1 : (tween.current.get(band) ?? (openBands.has(band) ? 1 : 0));
  const shownColumns = columns.filter((column) => bandOpenness(column.band) > 0);
  const columnWidth = (column: TColumn) => Math.round(column.width * bandOpenness(column.band));
  const bandGroups = columns.reduce<{ label: string; columns: TColumn[] }[]>((acc, column) => {
    const last = acc[acc.length - 1];
    if (last?.label === column.band) last.columns.push(column);
    else acc.push({ label: column.band, columns: [column] });
    return acc;
  }, []);
  const doorWidth = (band: string) => Math.round(DOOR_WIDTH * (1 - bandOpenness(band)));
  const tableWidth =
    CODE_WIDTH +
    ACTIONS_WIDTH +
    shownColumns.reduce((t, column) => t + columnWidth(column), 0) +
    bandGroups.reduce((t, group) => t + (group.label === ALWAYS_OPEN_BAND ? 0 : doorWidth(group.label)), 0);

  const openGroups: TOpenGroup[] = bandGroups.map((group) => ({
    label: group.label,
    door: group.label !== ALWAYS_OPEN_BAND,
    columns: group.columns.filter((column) => bandOpenness(column.band) > 0),
  }));
  const layoutSig = openGroups
    .map((group) => `${group.label}:${group.columns.map((column) => column.key).join(",")}`)
    .join("|");
  if (layoutRef.current.sig !== layoutSig) layoutRef.current = { sig: layoutSig, groups: openGroups };
  const layout = layoutRef.current.groups;
  const windowed = rows.length > WINDOW_MIN;
  const winStart = windowed ? Math.max(0, view.first - WINDOW_BUFFER) : 0;
  const winEnd = windowed ? Math.min(rows.length, view.first + view.count + WINDOW_BUFFER) : rows.length;
  const spanCols = layout.reduce((t, group) => t + (group.door ? 1 : 0) + group.columns.length, 2);
  const spacer = (key: string, count: number) =>
    count > 0 ? (
      <tr key={key} aria-hidden="true" style={{ height: count * rowHeight.current }}>
        <td colSpan={spanCols} className="p-0" />
      </tr>
    ) : null;

  /** Slide a stage group open or shut (columns grow while the folded "door" shrinks). */
  const toggleBand = (band: string) => {
    const opening = !openBands.has(band);
    const next = new Set(openBands);
    if (opening) next.add(band);
    else next.delete(band);
    remember(next);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setOpenBands(next);
      return;
    }
    tween.current.set(band, opening ? 0 : 1);
    setOpenBands(next);
    const bandColumns = columns.filter((column) => column.band === band);
    const start = performance.now();
    const duration = 320;
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const t = opening ? eased : 1 - eased;
      tween.current.set(band, t);
      for (const column of bandColumns) {
        const col = colRefs.current.get(column.key);
        if (col) col.style.width = `${Math.round(column.width * t)}px`;
      }
      const door = colRefs.current.get(`door-${band}`);
      if (door) door.style.width = `${Math.round(DOOR_WIDTH * (1 - t))}px`;
      if (tableRef.current) {
        let total = 0;
        tableRef.current.querySelectorAll("col").forEach((col) => (total += parseFloat(col.style.width) || 0));
        tableRef.current.style.width = `${total}px`;
      }
      if (progress < 1) requestAnimationFrame(frame);
      else {
        tween.current.delete(band);
        redraw((value) => value + 1);
      }
    };
    requestAnimationFrame(frame);
  };
  rowActionsRef.current = { save, toggle, remove: removeRow, openBand: toggleBand };
  const setAllBands = (open: boolean) => {
    const next = new Set(
      open ? bandGroups.map((group) => group.label).filter((label) => label !== ALWAYS_OPEN_BAND) : []
    );
    remember(next);
    setOpenBands(next);
  };
  const panelProps = { workspaceSlug, project, onClose: () => setPanel(null) };

  return (
    <div className="flex flex-col gap-3">
      <datalist id={boqListId}>
        {[...(boq?.lines ?? [])]
          // oxlint-disable-next-line unicorn/no-array-sort -- copied array
          .sort((a, b) => Number(b.scope === scopeKey) - Number(a.scope === scopeKey))
          .map((line) => (
            <option key={line.id} value={line.line_no}>
              {[line.description, line.po_label].filter(Boolean).join(" · ")}
            </option>
          ))}
      </datalist>
      <datalist id={floorListId}>
        {floorNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {enabledScopes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-strong px-6 py-12 text-center text-body-sm-regular text-tertiary">
          No scopes are switched on for this project yet.
          {canSetUp && (
            <span className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                stretch="auto"
                label="Choose scopes"
                onClick={() => setPanel("scopes")}
              />
              <Button
                variant="secondary"
                size="md"
                stretch="auto"
                label="Import from Excel"
                onClick={() => setPanel("import")}
              />
            </span>
          )}
        </div>
      ) : (
        <>
          {/* One toolbar line: scope sheets on the left, tools on the right */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-0.5"
              role="tablist"
              aria-label="Scope sheets"
            >
              {enabledScopes.map((entry) => {
                const active = entry.key === scopeKey;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setScopeKey(entry.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-body-xs-semibold whitespace-nowrap transition-all duration-200",
                      active
                        ? "bg-[#0B0B0B] text-white shadow-raised-100 ring-1 ring-[var(--brand-default)]"
                        : "text-secondary hover:bg-layer-1-hover hover:text-primary"
                    )}
                  >
                    {entry.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-body-2xs-semibold tabular-nums",
                        active ? "bg-[var(--brand-default)] text-white" : "bg-layer-2 text-tertiary"
                      )}
                    >
                      {filledByScope[entry.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Floor"
                value={floorFilter}
                onChange={(event) => setFloorFilter(event.target.value)}
                className="h-8 max-w-44 rounded-lg border border-subtle bg-surface-1 px-2 text-body-xs-medium text-primary outline-none focus-visible:border-accent-strong"
              >
                <option value="all">All floors</option>
                {floorNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="">No floor set</option>
              </select>
              <label className="relative flex items-center">
                <span className="sr-only">Search items</span>
                <SearchOutline className="pointer-events-none absolute left-2.5 size-3.5 text-placeholder" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search code, floor, JC, DC"
                  className="h-8 w-48 rounded-lg border border-subtle bg-surface-1 pr-2 pl-8 text-body-xs-regular text-primary outline-none placeholder:text-placeholder focus-visible:border-accent-strong"
                />
              </label>
              {canEdit && selected.size > 0 && (
                <Button
                  variant="danger"
                  size="md"
                  stretch="auto"
                  label={`Delete ${selected.size}`}
                  onClick={() => removeMany([...selected], `${selected.size} selected row(s)`)}
                />
              )}
              {canEdit && (
                <span className="flex overflow-hidden rounded-lg border border-subtle bg-surface-1">
                  <button
                    type="button"
                    aria-label="Undo (Ctrl + Z)"
                    title={
                      undoStack.current.length
                        ? `Undo ${undoStack.current[undoStack.current.length - 1].label} (Ctrl + Z)`
                        : "Nothing to undo"
                    }
                    disabled={!undoStack.current.length}
                    onClick={() => void travel("undo")}
                    className="grid h-8 w-8 place-items-center text-body-sm-semibold text-secondary hover:bg-layer-1-hover disabled:opacity-35"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    aria-label="Redo (Ctrl + Y)"
                    title={
                      redoStack.current.length
                        ? `Redo ${redoStack.current[redoStack.current.length - 1].label} (Ctrl + Y)`
                        : "Nothing to redo"
                    }
                    disabled={!redoStack.current.length}
                    onClick={() => void travel("redo")}
                    className="grid h-8 w-8 place-items-center border-l border-subtle text-body-sm-semibold text-secondary hover:bg-layer-1-hover disabled:opacity-35"
                  >
                    ↷
                  </button>
                </span>
              )}
              {canEdit && (
                <Button
                  variant="primary"
                  size="md"
                  stretch="auto"
                  icon={<AddOutline className="size-3.5" />}
                  label="Add row"
                  loading={adding}
                  onClick={() => addRows(1)}
                />
              )}
              <MoreMenu
                items={[
                  canEdit && { label: "Add 10 rows", onClick: () => addRows(10) },
                  canEdit &&
                    blankRows.length > 0 && {
                      label: `Delete ${blankRows.length} blank row(s)`,
                      onClick: () =>
                        removeMany(
                          blankRows.map((row) => row.id),
                          `${blankRows.length} blank row(s) (${blankRows.map((row) => row.item_code).join(", ")})`
                        ),
                    },
                  { label: "Open all stage groups", onClick: () => setAllBands(true) },
                  { label: "Close all stage groups", onClick: () => setAllBands(false) },
                  canSetUp && { label: "Import from Excel", onClick: () => setPanel("import") },
                  canSetUp && { label: `Scopes (${enabledScopes.length} on)`, onClick: () => setPanel("scopes") },
                  canSetUp && { label: `Floors (${floors?.length ?? 0})`, onClick: () => setPanel("floors") },
                  canSetUp && {
                    label: hidden.size ? `Columns (${hidden.size} hidden)` : "Columns",
                    onClick: () => setPanel("columns"),
                  },
                ]}
              />
            </div>
          </div>

          {/* Sheet */}
          <div className="overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-raised-100">
            <div
              ref={sheetRef}
              onScroll={onSheetScroll}
              className="max-h-[calc(100vh-13rem)] min-h-[18rem] overflow-auto"
            >
              <table
                ref={tableRef}
                className="table-fixed border-separate border-spacing-0 text-left"
                style={{ width: tableWidth }}
                onPaste={pasteBlock}
              >
                <colgroup>
                  <col style={{ width: CODE_WIDTH }} />
                  {bandGroups.map((group) => (
                    <BandCols
                      key={group.label}
                      group={group}
                      door={group.label !== ALWAYS_OPEN_BAND}
                      doorWidth={doorWidth(group.label)}
                      columns={group.columns.filter((column) => bandOpenness(column.band) > 0)}
                      width={columnWidth}
                      colRefs={colRefs}
                    />
                  ))}
                  <col style={{ width: ACTIONS_WIDTH }} />
                </colgroup>
                <thead className="sticky top-0 z-[3]">
                  <tr>
                    <th
                      className="sticky left-0 z-[4] border-b border-subtle px-2 py-1.5"
                      style={{ backgroundColor: GREY }}
                    />
                    {bandGroups.map((group) => {
                      const open = group.label === ALWAYS_OPEN_BAND || bandOpenness(group.label) > 0;
                      const span =
                        group.columns.filter((column) => bandOpenness(column.band) > 0).length +
                        (group.label === ALWAYS_OPEN_BAND ? 0 : 1);
                      const color = BAND_COLORS[group.label] ?? GREY;
                      return (
                        <th
                          key={group.label}
                          colSpan={span}
                          className="overflow-hidden border-b border-l border-black/20 p-0 text-body-2xs-semibold tracking-wide whitespace-nowrap text-white uppercase"
                          style={{ backgroundColor: color }}
                        >
                          {group.label === ALWAYS_OPEN_BAND ? (
                            <span className="block px-2 py-1.5">{group.label}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleBand(group.label)}
                              aria-expanded={open}
                              aria-label={`${open ? "Fold" : "Open"} ${shortBand(group.label)}`}
                              title={open ? `Fold ${shortBand(group.label)}` : `Open ${shortBand(group.label)}`}
                              className={cn(
                                "group/door flex w-full items-center gap-2 py-1 transition-colors outline-none hover:bg-white/10 focus-visible:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-inset",
                                open ? "px-2 text-left" : "justify-center px-0"
                              )}
                            >
                              {open && <span className="min-w-0 flex-1 truncate">{group.label}</span>}
                              <DoorChevron open={open} />
                            </button>
                          )}
                        </th>
                      );
                    })}
                    <th className="border-b border-subtle" style={{ backgroundColor: GREY }} />
                  </tr>
                  <tr>
                    <th className="sticky left-0 z-[4] border-b border-subtle bg-layer-1 px-2 py-2 text-body-2xs-semibold text-tertiary">
                      <span className="flex items-center gap-1.5">
                        {canEdit && rows.length > 0 && (
                          <input
                            type="checkbox"
                            aria-label="Select all rows"
                            className="size-3.5 accent-[var(--brand-default)]"
                            checked={rows.every((row) => selected.has(row.id))}
                            onChange={(event) =>
                              setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())
                            }
                          />
                        )}
                        Code
                      </span>
                    </th>
                    {bandGroups.map((group) => (
                      <BandHeads
                        key={group.label}
                        group={group}
                        door={group.label !== ALWAYS_OPEN_BAND}
                        doorOpen={bandOpenness(group.label) >= 1}
                        columns={group.columns.filter((column) => bandOpenness(column.band) > 0)}
                        onOpen={() => toggleBand(group.label)}
                      />
                    ))}
                    <th className="border-b border-subtle bg-layer-1" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={999} className="px-4 py-14 text-center text-body-sm-regular text-tertiary">
                        {search || floorFilter !== "all"
                          ? "No items match this floor or search."
                          : canEdit
                            ? `No ${scope?.label.toLowerCase()} yet. Click “Add row” to start, or paste rows from Excel.`
                            : `No ${scope?.label.toLowerCase()} yet.`}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {spacer("top", winStart)}
                      {rows.slice(winStart, winEnd).map((item, offset) => (
                        <TrackerRow
                          key={item.id}
                          item={item}
                          odd={(winStart + offset) % 2 === 1}
                          isSelected={selected.has(item.id)}
                          canEdit={canEdit}
                          scope={scope}
                          e9={project.e9}
                          photos={photosByItem.get(item.id) ?? NO_PHOTOS}
                          installPhotos={installPhotosByItem.get(item.id) ?? NO_PHOTOS}
                          layout={layout}
                          shared={rowShared}
                          actions={rowActions}
                        />
                      ))}
                      {spacer("bottom", rows.length - winEnd)}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body-2xs-regular text-tertiary">
              {filledRows.length} item{filledRows.length === 1 ? "" : "s"}
              {totalArea > 0 ? ` · ${formatMeasure(Math.round(totalArea * 100) / 100, "sqft")}` : ""}
              {totalNos > 0 ? ` · ${formatMeasure(totalNos, "nos")}` : ""}
              {canEdit ? " · saves by itself · Enter = next row · paste from Excel" : " · view only"}
            </span>
            <Legend />
          </div>
        </>
      )}

      <E9ScopesModal open={panel === "scopes"} {...panelProps} />
      <E9FloorsModal open={panel === "floors"} {...panelProps} />
      <E9ColumnsModal open={panel === "columns"} {...panelProps} />
      <E9ImportModal open={panel === "import"} {...panelProps} />
      <E9PhotosModal
        open={!!photoItem}
        onClose={() => setPhotoItem(null)}
        workspaceSlug={workspaceSlug}
        projectId={project.id}
        item={photoItem}
        disabled={!canEdit}
      />
      <E9PhotosModal
        open={!!installPhotoItem}
        onClose={() => setInstallPhotoItem(null)}
        workspaceSlug={workspaceSlug}
        projectId={project.id}
        item={installPhotoItem}
        disabled={!canEdit}
        kind="install_photo"
      />
      {reprintItem && (
        <E9ReprintQuickModal
          workspaceSlug={workspaceSlug}
          projectId={project.id}
          item={reprintItem}
          onClose={() => setReprintItem(null)}
        />
      )}
      <E9ItemHistoryModal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        workspaceSlug={workspaceSlug}
        projectId={project.id}
        item={historyItem}
      />
    </div>
  );
}

type TBandGroup = { label: string; columns: TColumn[] };

/** <col> elements of one stage group: the folded "door" plus its columns (widths animate). */
/** Round chip with a thin chevron: points right when the group is folded, turns to point left (fold) when open. */
function DoorChevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/35 transition-[background-color,transform] duration-300 group-hover/door:bg-white/30"
    >
      <svg
        viewBox="0 0 12 12"
        className={cn(
          "size-3 transition-transform duration-300 ease-out",
          open ? "rotate-180 group-hover/door:-translate-x-px" : "group-hover/door:translate-x-px"
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.5 2.5 8 6l-3.5 3.5" />
      </svg>
    </span>
  );
}

function BandCols({
  group,
  door,
  doorWidth,
  columns,
  width,
  colRefs,
}: {
  group: TBandGroup;
  door: boolean;
  doorWidth: number;
  columns: TColumn[];
  width: (column: TColumn) => number;
  colRefs: { current: Map<string, HTMLTableColElement> };
}) {
  const keep = (key: string) => (node: HTMLTableColElement | null) => {
    if (node) colRefs.current.set(key, node);
    else colRefs.current.delete(key);
  };
  return (
    <>
      {door && <col ref={keep(`door-${group.label}`)} style={{ width: doorWidth }} />}
      {columns.map((column) => (
        <col key={column.key} ref={keep(column.key)} style={{ width: width(column) }} />
      ))}
    </>
  );
}

function BandHeads({
  group,
  door,
  doorOpen,
  columns,
  onOpen,
}: {
  group: TBandGroup;
  door: boolean;
  doorOpen: boolean;
  columns: TColumn[];
  onOpen: () => void;
}) {
  const color = BAND_COLORS[group.label] ?? GREY;
  return (
    <>
      {door && (
        <th className="overflow-hidden border-b border-subtle p-0" style={{ backgroundColor: `${color}22` }}>
          {!doorOpen && (
            <button
              type="button"
              onClick={onOpen}
              aria-label={`Open ${shortBand(group.label)}`}
              title={`Open ${shortBand(group.label)}`}
              className="grid h-full w-full place-items-center py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{ color, ["--tw-ring-color" as string]: color }}
            ></button>
          )}
        </th>
      )}
      {columns.map((column) => (
        <th
          key={column.key}
          title={column.auto ? `${column.label}: worked out for you, nothing to type here` : undefined}
          className={cn(
            "overflow-hidden border-b border-subtle bg-layer-1 px-2 py-2 text-body-2xs-semibold whitespace-nowrap text-tertiary",
            column.auto && "italic"
          )}
        >
          {column.label}
        </th>
      ))}
    </>
  );
}

function BandCells({
  group,
  door,
  columns,
  ctx,
  onOpen,
}: {
  group: TBandGroup;
  door: boolean;
  columns: TColumn[];
  ctx: TRowContext;
  onOpen: () => void;
}) {
  const color = BAND_COLORS[group.label] ?? GREY;
  return (
    <>
      {door && (
        <td
          onClick={onOpen}
          title={`Open ${shortBand(group.label)}`}
          className="cursor-pointer overflow-hidden border-b border-subtle p-0 transition-[filter] hover:brightness-95 dark:hover:brightness-125"
          style={{ backgroundColor: `${color}0D`, boxShadow: `inset 1px 0 0 ${color}40` }}
        />
      )}
      {columns.map((column) => (
        <td
          key={column.key}
          data-col={column.key}
          className={cn("overflow-hidden border-b border-subtle px-1 py-1 align-middle", column.className)}
        >
          {column.render(ctx)}
        </td>
      ))}
    </>
  );
}

/** "⋯" menu with the less-used sheet tools. */
const WINDOW_MIN = 60; // sheets longer than this draw only the rows on screen
const WINDOW_BUFFER = 12; // plus this many rows above and below
const WINDOW_STEP = 4; // redraw the window every 4 rows of scrolling, not every pixel
const DEFAULT_ROW_HEIGHT = 48;
const NO_PHOTOS: TE9Attachment[] = [];

type TOpenGroup = { label: string; door: boolean; columns: TColumn[] };
type TRowShared = Pick<
  TRowContext,
  | "floorListId"
  | "boqListId"
  | "boqNos"
  | "boqLineScope"
  | "boqLineForScope"
  | "scopeLabel"
  | "workspaceSlug"
  | "projectId"
>;
type TRowHandlers = {
  save: (item: TE9ScopeItem, patch: Partial<TE9ScopeItem>) => unknown;
  toggle: (id: string) => void;
  remove: (item: TE9ScopeItem) => unknown;
  openBand: (band: string) => void;
};
type TRowActions = TRowHandlers & {
  openPhotos: (item: TE9ScopeItem) => void;
  openInstallPhotos: (item: TE9ScopeItem) => void;
  openReprint: (item: TE9ScopeItem) => void;
  openHistory: (item: TE9ScopeItem) => void;
};

/** One tracker row. Memoised: it redraws only when its own item (or the layout) changes. */
const TrackerRow = memo(function TrackerRow({
  item,
  odd,
  isSelected,
  canEdit,
  scope,
  e9,
  photos,
  installPhotos,
  layout,
  shared,
  actions,
}: {
  item: TE9ScopeItem;
  odd: boolean;
  isSelected: boolean;
  canEdit: boolean;
  scope: TE9ProjectScope | undefined;
  e9: Parameters<typeof isStageOverdue>[2];
  photos: TE9Attachment[];
  installPhotos: TE9Attachment[];
  layout: TOpenGroup[];
  shared: TRowShared;
  actions: TRowActions;
}) {
  const ctx: TRowContext = {
    ...shared,
    item,
    scope,
    disabled: !canEdit,
    empty: !isFilled(item),
    overdue: (stage) => isStageOverdue(item, stage, e9),
    save: (patch) => actions.save(item, patch),
    photos,
    openPhotos: () => actions.openPhotos(item),
    installPhotos,
    openInstallPhotos: () => actions.openInstallPhotos(item),
    openReprint: () => actions.openReprint(item),
  };
  return (
    <tr
      data-item={item.id}
      className={cn(
        "group",
        odd && "bg-layer-1/40",
        ctx.empty && "opacity-70",
        item.hold_status === "On Hold" && "bg-[#F59E0B]/[0.08]",
        item.hold_status === "Cancelled" && "opacity-50"
      )}
    >
      <td
        className={cn(
          "sticky left-0 z-[2] border-b border-subtle bg-surface-1 px-2 py-1 align-middle text-body-xs-semibold text-primary group-hover:bg-layer-1",
          isSelected && "bg-accent-subtle"
        )}
      >
        <label className="flex cursor-pointer items-center gap-1.5">
          {canEdit && (
            <input
              type="checkbox"
              aria-label={`Select ${item.item_code}`}
              className="size-3.5 accent-[var(--brand-default)] opacity-40 transition-opacity group-hover:opacity-100 checked:opacity-100 focus-visible:opacity-100"
              checked={isSelected}
              onChange={() => actions.toggle(item.id)}
            />
          )}
          {item.item_code}
          {item.hold_status && (
            <span
              role="img"
              aria-label={item.hold_status}
              title={item.hold_status}
              className={cn(
                "size-2 shrink-0 rounded-full",
                item.hold_status === "On Hold" ? "bg-[#F59E0B]" : "bg-tertiary"
              )}
            />
          )}
        </label>
      </td>
      {layout.map((group) => (
        <BandCells
          key={group.label}
          group={group}
          door={group.door}
          columns={group.columns}
          ctx={ctx}
          onOpen={() => actions.openBand(group.label)}
        />
      ))}
      <td className="border-b border-subtle px-1 py-1 align-middle">
        <div className="flex items-center justify-end gap-0.5">
          {canEdit && !ctx.empty && (
            <button
              type="button"
              onClick={() => actions.openReprint(item)}
              aria-label={`Reprint ${item.item_code}`}
              title="Reprint / extra for this item"
              className="grid size-7 place-items-center rounded-md text-body-xs-semibold text-tertiary hover:bg-layer-1-hover hover:text-accent-primary"
            >
              ↻
            </button>
          )}
          <button
            type="button"
            onClick={() => actions.openHistory(item)}
            aria-label={`History of ${item.item_code}`}
            title="Who changed what"
            className="grid size-7 place-items-center rounded-md text-placeholder hover:bg-layer-1-hover hover:text-primary"
          >
            <ClockOutline className="size-3.5" />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => actions.remove(item)}
              aria-label={`Delete ${item.item_code}`}
              title={`Delete ${item.item_code}`}
              className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-danger-subtle hover:text-danger-primary"
            >
              <CloseOutline className="size-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

function MoreMenu({ items }: { items: (false | undefined | { label: string; onClick: () => void })[] }) {
  const [open, setOpen] = useState(false);
  const entries = items.filter((entry): entry is { label: string; onClick: () => void } => !!entry);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More sheet tools"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid h-8 w-9 place-items-center rounded-lg border border-subtle bg-surface-1 text-body-sm-semibold text-secondary hover:bg-layer-1-hover"
      >
        ⋯
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul className="e9-pop absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-subtle bg-surface-1 py-1 shadow-raised-200">
            {entries.map((entry) => (
              <li key={entry.label}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    entry.onClick();
                  }}
                  className="w-full px-3.5 py-2 text-left text-body-xs-medium text-primary hover:bg-layer-1-hover"
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Legend() {
  const [open, setOpen] = useState(false);
  const swatch = (className: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", className)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-2xs-medium text-tertiary">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md px-1.5 py-0.5 text-body-2xs-semibold text-secondary hover:bg-layer-1-hover"
      >
        Colour key {open ? "▴" : "▾"}
      </button>
      {open && (
        <>
          {swatch("bg-success-subtle", "Done / approved")}
          {swatch("bg-warning-subtle", "Under way")}
          {swatch("bg-info-subtle", "Sent / in the pipeline")}
          {swatch("bg-[#F06A25]/15", "Open site issue")}
          {swatch(
            "bg-danger-subtle ring-1 ring-[var(--border-color-danger-strong)]",
            "Overdue against the stage target / rework"
          )}
          <span>
            Tick rows to delete several at once, or use ✕ at the end of a row. The clock shows who changed it.
          </span>
        </>
      )}
    </div>
  );
}
