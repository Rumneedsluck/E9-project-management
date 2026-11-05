/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
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
  CLIENT_SIGN_OFF,
  DISPATCH_STATUS,
  E9_TRACKER_STAGES,
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
import { formatMeasure, isFilled, isStageOverdue, itemArea, itemMeasure } from "./logic";
import { E9ItemHistoryModal, E9PhotoCell, E9PhotosModal } from "./photos-history";
import { mailSearchUrl } from "../commercial/shared";
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
  floorListId: string;
  boqListId: string;
  /** BOQ numbers on this project's BOQ (upper case); null while there is no BOQ */
  boqNos: Set<string> | null;
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
};

const BAND_COLORS: Record<string, string> = {
  "Item details": GREY,
  "1 · Site audit": stageColor("site_audit"),
  "2 · Pre-press": stageColor("pre_press"),
  "3 · Production & material": stageColor("material"),
  "4 · Quality & dispatch": stageColor("delivered"),
  "5 · Installation": stageColor("installation"),
  "6 · Handover": stageColor("sign_off"),
  Notes: GREY,
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

const COLUMNS: TColumn[] = [
  {
    key: "boq",
    hideKey: "boq_item_no",
    label: "BOQ No.",
    width: 84,
    band: "Item details",
    render: (ctx) => {
      const value = ctx.item.boq_item_no ?? "";
      const notOnBoq = !!ctx.boqNos && !ctx.empty && !ctx.boqNos.has(value.trim().toUpperCase());
      return (
        <span title={notOnBoq ? (value ? `${value} is not on the BOQ` : "Pick the BOQ line for this row") : undefined}>
          <TextCell
            label="BOQ item no."
            value={value}
            listId={ctx.boqListId}
            overdue={notOnBoq}
            disabled={ctx.disabled}
            placeholder="BO1"
            onSave={(next) => ctx.save({ boq_item_no: next.toUpperCase() })}
          />
        </span>
      );
    },
  },
  {
    key: "stage",
    hideKey: "current_stage",
    label: "Current stage",
    width: 140,
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
    width: 110,
    band: "Item details",
    render: text("floor_plan_ref", "Floor plan"),
  },
  {
    key: "desc",
    hideKey: "description",
    label: "Description",
    width: 220,
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
    band: "1 · Site audit",
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
    band: "1 · Site audit",
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
      <div className="flex items-center">
        <TextCell
          label="JC number"
          value={ctx.item.jc_no}
          disabled={ctx.disabled}
          onSave={(v) => ctx.save({ jc_no: v })}
        />
        {ctx.item.jc_no && (
          <a
            href={mailSearchUrl(ctx.item.jc_no)}
            target="_blank"
            rel="noopener noreferrer"
            title="Find the e-proof mail in Gmail"
            className="px-1 text-body-2xs-semibold text-accent-primary"
          >
            Mail
          </a>
        )}
      </div>
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
    key: "dc",
    hideKey: "dc_nos",
    label: "DC No(s).",
    width: 120,
    band: "4 · Quality & dispatch",
    render: text("dc_nos", "DC numbers", "e.g. 3500, 3501"),
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
    key: "signoff",
    hideKey: "client_sign_off",
    label: "Client sign-off",
    width: 152,
    band: "6 · Handover",
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
    width: 220,
    band: "Notes",
    render: text("remarks", "Remarks"),
  },
];

const CODE_WIDTH = 64;
const ACTIONS_WIDTH = 64;

type TOpenPanel = "scopes" | "floors" | "columns" | "import" | null;
type Props = { workspaceSlug: string; project: TE9Project };

export function E9TrackerSheet({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Items(workspaceSlug, project.id);
  const { data: scopes } = useE9Scopes(workspaceSlug, project.id);
  const { data: floors } = useE9Floors(workspaceSlug, project.id);
  const { data: photos } = useE9Photos(workspaceSlug, project.id);
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

  const floorNames = useMemo(
    () => [
      ...new Set([
        ...(floors ?? []).map((floor) => floor.name),
        ...items.map((item) => item.floor_area).filter(Boolean),
      ]),
    ],
    [floors, items]
  );

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

  const save = async (item: TE9ScopeItem, patch: Partial<TE9ScopeItem>) => {
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
    } catch {
      setToast({ type: "error", title: "Couldn't add rows", message: "Please try again." });
    } finally {
      setAdding(false);
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
    if (!window.confirm(`Delete ${what}? Their codes will not be reused. This cannot be undone.`)) return;
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
    await mutate((current) => current && { ...current, items: current.items.filter((row) => !done.includes(row.id)) }, {
      revalidate: false,
    });
    setSelected(new Set());
    if (done.length) setToast({ type: "success", title: `Deleted ${done.length} row(s)` });
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

  if ((isLoading && !data) || !scopes) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const filledRows = rows.filter(isFilled);
  const totalNos = filledRows.filter((item) => item.unit === "nos").reduce((t, item) => t + itemMeasure(item), 0);
  const totalArea = filledRows.reduce((t, item) => t + itemArea(item), 0);
  const tableWidth = CODE_WIDTH + ACTIONS_WIDTH + columns.reduce((t, column) => t + column.width, 0);
  const bands = columns.reduce<{ label: string; span: number }[]>((acc, column) => {
    const last = acc[acc.length - 1];
    if (last?.label === column.band) last.span += 1;
    else acc.push({ label: column.band, span: 1 });
    return acc;
  }, []);
  const panelProps = { workspaceSlug, project, onClose: () => setPanel(null) };

  return (
    <div className="flex flex-col gap-4">
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

      {/* Set-up buttons */}
      {canSetUp && (
        <div className="flex flex-wrap items-center gap-2">
          <SetupButton label="Scopes" hint={`${enabledScopes.length} on`} onClick={() => setPanel("scopes")} />
          <SetupButton label="Floors" hint={`${floors?.length ?? 0}`} onClick={() => setPanel("floors")} />
          <SetupButton
            label="Columns"
            hint={hidden.size ? `${hidden.size} hidden` : "all shown"}
            onClick={() => setPanel("columns")}
          />
          <SetupButton label="Import from Excel" onClick={() => setPanel("import")} />
        </div>
      )}

      {enabledScopes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-strong px-6 py-12 text-center text-body-sm-regular text-tertiary">
          No scopes are switched on for this project yet. {canSetUp ? "Click “Scopes” above to choose them." : ""}
        </div>
      ) : (
        <>
          {/* Scope tabs */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Scope sheets">
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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-body-sm-semibold text-primary">
                {scope?.label}
                <span className="ml-2 text-body-2xs-medium text-tertiary">
                  {scope?.unit_mode === "sqft"
                    ? "measured in sq ft"
                    : scope?.unit_mode === "nos"
                      ? "counted in Nos"
                      : "sq ft or Nos"}
                </span>
              </span>
              <span className="text-body-xs-regular text-tertiary">
                {filledRows.length} item{filledRows.length === 1 ? "" : "s"}
                {totalArea > 0 ? ` · ${formatMeasure(Math.round(totalArea * 100) / 100, "sqft")}` : ""}
                {totalNos > 0 ? ` · ${formatMeasure(totalNos, "nos")}` : ""}
                {floorFilter !== "all" ? ` on ${floorFilter || "no floor"}` : ""}
                {canEdit ? " · changes save automatically" : " · view only"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                <span className="sr-only">Floor</span>
                <select
                  value={floorFilter}
                  onChange={(event) => setFloorFilter(event.target.value)}
                  className="h-8 max-w-48 rounded-lg border border-subtle bg-surface-1 px-2 text-body-xs-medium text-primary outline-none focus-visible:border-accent-strong"
                >
                  <option value="all">All floors</option>
                  {floorNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="">No floor set</option>
                </select>
              </label>
              <label className="relative flex items-center">
                <span className="sr-only">Search items</span>
                <SearchOutline className="pointer-events-none absolute left-2.5 size-3.5 text-placeholder" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search code, floor, JC, DC"
                  className="h-8 w-52 rounded-lg border border-subtle bg-surface-1 pr-2 pl-8 text-body-xs-regular text-primary outline-none placeholder:text-placeholder focus-visible:border-accent-strong"
                />
              </label>
              {canEdit && selected.size > 0 && (
                <Button
                  variant="danger"
                  size="md"
                  stretch="auto"
                  label={`Delete ${selected.size} selected`}
                  onClick={() => removeMany([...selected], `${selected.size} selected row(s)`)}
                />
              )}
              {canEdit && selected.size === 0 && rows.some((row) => !isFilled(row)) && (
                <Button
                  variant="secondary"
                  size="md"
                  stretch="auto"
                  label={`Delete ${rows.filter((row) => !isFilled(row)).length} blank row(s)`}
                  onClick={() => {
                    const blank = rows.filter((row) => !isFilled(row));
                    void removeMany(
                      blank.map((row) => row.id),
                      `${blank.length} blank row(s) (${blank.map((row) => row.item_code).join(", ")})`
                    );
                  }}
                />
              )}
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
                  <Button
                    variant="secondary"
                    size="md"
                    stretch="auto"
                    label="Add 10 rows"
                    onClick={() => addRows(10)}
                  />
                </>
              )}
            </div>
          </div>

          {/* Sheet */}
          <div className="overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-raised-100">
            <div className="max-h-[70vh] overflow-auto">
              <table className="table-fixed border-separate border-spacing-0 text-left" style={{ width: tableWidth }}>
                <colgroup>
                  <col style={{ width: CODE_WIDTH }} />
                  {columns.map((column) => (
                    <col key={column.key} style={{ width: column.width }} />
                  ))}
                  <col style={{ width: ACTIONS_WIDTH }} />
                </colgroup>
                <thead className="sticky top-0 z-[3]">
                  <tr>
                    <th
                      className="sticky left-0 z-[4] border-b border-subtle px-2 py-1.5"
                      style={{ backgroundColor: GREY }}
                    />
                    {bands.map((band, index) => (
                      <th
                        // oxlint-disable-next-line react/no-array-index-key -- band names can repeat after hiding columns
                        key={`${band.label}-${index}`}
                        colSpan={band.span}
                        className="border-b border-subtle px-2 py-1.5 text-body-2xs-semibold tracking-wide whitespace-nowrap text-white uppercase"
                        style={{ backgroundColor: BAND_COLORS[band.label] ?? GREY }}
                      >
                        {band.label}
                      </th>
                    ))}
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
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className="border-b border-subtle bg-layer-1 px-2 py-2 text-body-2xs-semibold whitespace-nowrap text-tertiary"
                      >
                        {column.label}
                      </th>
                    ))}
                    <th className="border-b border-subtle bg-layer-1" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        className="px-4 py-14 text-center text-body-sm-regular text-tertiary"
                      >
                        {search || floorFilter !== "all"
                          ? "No items match this floor or search."
                          : canEdit
                            ? `No ${scope?.label.toLowerCase()} yet. Click “Add row” or “Add 10 rows” to start.`
                            : `No ${scope?.label.toLowerCase()} yet.`}
                      </td>
                    </tr>
                  ) : (
                    rows.map((item) => {
                      const ctx: TRowContext = {
                        item,
                        scope,
                        disabled: !canEdit,
                        empty: !isFilled(item),
                        overdue: (stage) => isStageOverdue(item, stage, project.e9),
                        save: (patch) => save(item, patch),
                        photos: photosByItem.get(item.id) ?? [],
                        openPhotos: () => setPhotoItem(item),
                        floorListId,
                        boqListId,
                        boqNos,
                        workspaceSlug,
                        projectId: project.id,
                      };
                      return (
                        <tr key={item.id} className={cn("group", ctx.empty && "opacity-70")}>
                          <td
                            className={cn(
                              "sticky left-0 z-[2] border-b border-subtle bg-surface-1 px-2 py-1 align-middle text-body-xs-semibold text-primary group-hover:bg-layer-1",
                              selected.has(item.id) && "bg-accent-subtle"
                            )}
                          >
                            <label className="flex cursor-pointer items-center gap-1.5">
                              {canEdit && (
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${item.item_code}`}
                                  className="size-3.5 accent-[var(--brand-default)]"
                                  checked={selected.has(item.id)}
                                  onChange={() => toggle(item.id)}
                                />
                              )}
                              {item.item_code}
                            </label>
                          </td>
                          {columns.map((column) => (
                            <td
                              key={column.key}
                              className={cn("border-b border-subtle px-1 py-1 align-middle", column.className)}
                            >
                              {column.render(ctx)}
                            </td>
                          ))}
                          <td className="border-b border-subtle px-1 py-1 align-middle">
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => setHistoryItem(item)}
                                aria-label={`History of ${item.item_code}`}
                                title="Who changed what"
                                className="grid size-7 place-items-center rounded-md text-placeholder hover:bg-layer-1-hover hover:text-primary"
                              >
                                <ClockOutline className="size-3.5" />
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => removeRow(item)}
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
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Legend />
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

function SetupButton({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-body-xs-semibold text-secondary shadow-raised-100 hover:bg-layer-1-hover hover:text-primary"
    >
      {label}
      {hint && <span className="text-body-2xs-medium text-placeholder">{hint}</span>}
    </button>
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
      <span>Tick rows to delete several at once, or use ✕ at the end of a row. The clock shows who changed it.</span>
    </div>
  );
}
