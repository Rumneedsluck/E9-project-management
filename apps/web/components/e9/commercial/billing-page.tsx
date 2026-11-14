/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { mutate as globalMutate } from "swr";
import { AddOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { cn, renderFormattedDate } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { e9BoqKey, e9SummaryKey, useE9Bills } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import { E9Modal } from "../tracker/modal";
import { E9RefFiles, FormField, SmallButton, fmt, inputClass, money, showError, unitText } from "./shared";
import type { TE9Bill, TE9Bills } from "./types";
import { e9Confirm } from "../confirm";

type Props = { workspaceSlug: string; project: TE9Project };

/** A bill only exists once its JMC is signed, so step 1 is always done. Backend stage: 0 = with us … 4 = WCC done. */
export const BILL_STEPS = [
  { title: "Certification done", text: "JMC signed by the client (Step 1)" },
  { title: "Given to Accounts", text: "Certified quantities handed to Accounts" },
  { title: "Proforma invoice", text: "Accounts make the PI" },
  { title: "PI signed & submitted", text: "The client signs the PI; we submit it" },
  { title: "Work completion", text: "WCC created and acknowledged by the client" },
];

/** 5 bars: done / current / later */
export function BillStepper({ stage, compact = false }: { stage: number; compact?: boolean }) {
  return (
    <ol
      aria-label={stage >= 4 ? "Bill finished" : `Bill step ${stage + 1} of 5: ${BILL_STEPS[stage + 1]?.title ?? ""}`}
      className={cn("flex w-full items-start", compact ? "gap-1" : "gap-2")}
    >
      {BILL_STEPS.map((step, index) => {
        const done = index === 0 || stage >= index;
        const current = !done && stage + 1 === index;
        return (
          <li key={step.title} className="flex min-w-0 flex-1 flex-col gap-1.5" title={step.title}>
            <span
              className={cn(
                "h-1.5 rounded-full",
                done ? "bg-success-primary" : current ? "bg-[#F59E0B]" : "bg-layer-3"
              )}
            />
            {!compact && (
              <span
                className={cn(
                  "text-body-2xs-semibold",
                  done ? "text-success-primary" : current ? "text-primary" : "text-placeholder"
                )}
              >
                {done ? "✓ " : current ? "● " : `${index + 1} · `}
                {step.title}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function E9BillingPage({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Bills(workspaceSlug, project.id);
  const [creating, setCreating] = useState<TE9Bill | "new" | null>(null);

  const send = async (title: string, request: () => Promise<TE9Bills>) => {
    try {
      const next = await request();
      await mutate(next, { revalidate: false });
      void globalMutate(e9BoqKey(workspaceSlug, project.id));
      void globalMutate(e9SummaryKey(workspaceSlug));
      return true;
    } catch (problem) {
      showError(title, problem);
      return false;
    }
  };

  if (isLoading && !data) return <E9LoadingState />;
  if (!data) return error ? <E9ErrorState onRetry={() => mutate()} /> : <E9LoadingState />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-body-xs-regular text-tertiary">
          Each bill belongs to a signed JMC and moves: certification done → given to Accounts → proforma invoice → PI
          signed &amp; submitted → WCC. Only approved quantity (BOQ, amended BOQ, confirmed amendments) and
          client-change reprints can be billed.
        </p>
        {data.can_edit && data.pos.length > 0 && (
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            icon={<AddOutline className="size-4" />}
            label="Start a bill"
            onClick={() => setCreating("new")}
          />
        )}
      </div>

      {data.pos.length === 0 && (
        <p className="rounded-xl border border-dashed border-strong px-6 py-10 text-center text-body-sm-regular text-tertiary">
          Add the BOQ / PO on the BOQ tab first. Bills are made against a PO.
        </p>
      )}
      {data.pos.length > 0 && data.bills.length === 0 && (
        <p className="rounded-xl border border-dashed border-strong px-6 py-10 text-center text-body-sm-regular text-tertiary">
          No bills yet. {data.can_edit ? "Click “Start a bill” to raise the first one." : ""}
        </p>
      )}

      {data.bills.map((bill) => (
        <BillCard
          key={bill.id}
          bill={bill}
          canEdit={data.can_edit}
          slug={workspaceSlug}
          projectId={project.id}
          onPatch={(body) =>
            send("Couldn't save", () => e9ProjectService.updateBill(workspaceSlug, project.id, bill.id, body))
          }
          onEditLines={() => setCreating(bill)}
          onDelete={async () => {
            if (!(await e9Confirm(`Delete ${bill.title}?`))) return;
            void send("Couldn't delete", () => e9ProjectService.deleteBill(workspaceSlug, project.id, bill.id));
          }}
        />
      ))}

      {creating && (
        <CertifyModal
          bills={data}
          bill={creating === "new" ? undefined : creating}
          onClose={() => setCreating(null)}
          onSave={(body) =>
            send("Couldn't save the certification", () =>
              creating === "new"
                ? e9ProjectService.createBill(workspaceSlug, project.id, body)
                : e9ProjectService.updateBill(workspaceSlug, project.id, creating.id, body)
            )
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DateField({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onSave: (value: string | null) => void;
}) {
  return (
    <FormField label={label}>
      <input
        type="date"
        className={inputClass}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onSave(e.target.value || null)}
      />
    </FormField>
  );
}

function TextField({
  label,
  value,
  disabled,
  onSave,
  type = "text",
}: {
  label: string;
  value: string;
  disabled: boolean;
  onSave: (value: string) => void;
  type?: "text" | "number";
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <FormField label={label}>
      <input
        type={type}
        className={inputClass}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== value && onSave(draft.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </FormField>
  );
}

function BillCard({
  bill,
  canEdit,
  slug,
  projectId,
  onPatch,
  onEditLines,
  onDelete,
}: {
  bill: TE9Bill;
  canEdit: boolean;
  slug: string;
  projectId: string;
  onPatch: (body: object) => Promise<boolean>;
  onEditLines: () => void;
  onDelete: () => void;
}) {
  const open = (stage: number) => canEdit && bill.stage >= stage;
  const save = (field: string) => (value: string | null) => void onPatch({ [field]: value });
  const locked = !!bill.cert_to_accounts_on;
  const hasRates = bill.lines.some((line) => line.rate);

  const blocks = [
    {
      title: "1 · Certification done → Accounts",
      done: bill.stage > 0,
      body: (
        <>
          <p className="rounded-lg bg-success-subtle px-3 py-2 text-body-xs-semibold text-success-primary">
            ✓ Certification done
            {bill.certification_label ? ` · ${bill.certification_label}` : ""}
            {bill.cert_signed_on ? ` · JMC signed ${renderFormattedDate(bill.cert_signed_on)}` : ""}
            {bill.cert_number ? ` · ${bill.cert_number}` : ""}
          </p>
          <DateField
            label="Given to Accounts on"
            value={bill.cert_to_accounts_on}
            disabled={!open(0)}
            onSave={save("cert_to_accounts_on")}
          />
        </>
      ),
    },
    {
      title: "2 · Proforma invoice (Accounts)",
      done: bill.stage > 1,
      body: (
        <>
          <TextField label="PI no." value={bill.pi_number} disabled={!open(1)} onSave={save("pi_number")} />
          <DateField label="PI date" value={bill.pi_date} disabled={!open(1)} onSave={save("pi_date")} />
          <TextField
            label="PI amount ₹ (with GST)"
            type="number"
            value={bill.pi_amount ? String(Number(bill.pi_amount)) : ""}
            disabled={!open(1)}
            onSave={(value) => void onPatch({ pi_amount: value || null })}
          />
          <FileRow label="Proforma invoice" kind="pi" {...{ slug, projectId, bill, canEdit }} />
        </>
      ),
    },
    {
      title: "3 · PI signed & submitted",
      done: bill.stage > 2,
      body: (
        <>
          <DateField label="PI signed on" value={bill.pi_signed_on} disabled={!open(2)} onSave={save("pi_signed_on")} />
          <DateField
            label="PI submitted on"
            value={bill.pi_submitted_on}
            disabled={!open(2) || !bill.pi_signed_on}
            onSave={save("pi_submitted_on")}
          />
        </>
      ),
    },
    {
      title: "4 · Work completion certificate",
      done: bill.stage > 3,
      body: (
        <>
          <TextField label="WCC no." value={bill.wcc_number} disabled={!open(3)} onSave={save("wcc_number")} />
          <DateField label="WCC date" value={bill.wcc_date} disabled={!open(3)} onSave={save("wcc_date")} />
          <DateField
            label="Acknowledged by the client on"
            value={bill.wcc_acknowledged_on}
            disabled={!open(3) || !bill.wcc_date}
            onSave={save("wcc_acknowledged_on")}
          />
          <FileRow label="Acknowledged WCC" kind="wcc" {...{ slug, projectId, bill, canEdit }} />
        </>
      ),
    },
  ];

  return (
    <E9Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {bill.title}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-body-2xs-semibold",
              bill.stage === 4 ? "bg-success-subtle text-success-primary" : "bg-accent-subtle text-accent-primary"
            )}
          >
            {bill.stage_text}
          </span>
        </span>
      }
      action={
        canEdit ? (
          <span className="flex gap-1">
            {!locked && <SmallButton onClick={onEditLines}>Edit quantities</SmallButton>}
            {bill.stage < 2 && (
              <SmallButton tone="danger" onClick={onDelete}>
                Delete
              </SmallButton>
            )}
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <BillStepper stage={bill.stage} />

        <div className="overflow-x-auto rounded-lg border border-subtle">
          <table className="w-full min-w-[560px] text-left text-body-xs-regular">
            <thead>
              <tr className="border-b border-subtle bg-layer-1 text-body-2xs-semibold text-tertiary">
                <th className="px-3 py-2">BOQ No.</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Certified</th>
                {hasRates && <th className="px-3 py-2 text-right">Rate</th>}
                {hasRates && <th className="px-3 py-2 text-right">Amount</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle text-primary">
              {bill.lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-tertiary">
                    No certified quantities yet – click “Edit quantities”.
                  </td>
                </tr>
              )}
              {bill.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-2 font-semibold">{line.line_no}</td>
                  <td className="px-3 py-2">{line.description || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(line.certified_qty)} {unitText(line.unit)}
                  </td>
                  {hasRates && (
                    <td className="px-3 py-2 text-right tabular-nums">{line.rate ? money(line.rate) : "—"}</td>
                  )}
                  {hasRates && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.rate ? money(Number(line.rate) * Number(line.certified_qty)) : "—"}
                    </td>
                  )}
                </tr>
              ))}
              {hasRates && (
                <tr className="bg-layer-1 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>
                    Certified value (before GST)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(bill.certified_amount)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {blocks.map((block, index) => (
            <section
              key={block.title}
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-3",
                block.done
                  ? "border-[var(--border-color-success-strong,#16a34a)] bg-success-subtle/30"
                  : bill.stage === index
                    ? "border-accent-strong"
                    : "border-subtle opacity-70"
              )}
            >
              <h3 className="text-body-xs-semibold text-primary">
                {block.done ? "✓ " : ""}
                {block.title}
              </h3>
              {bill.stage < index && (
                <p className="text-body-2xs-regular text-tertiary">Opens after step {index} is done.</p>
              )}
              {block.body}
            </section>
          ))}
        </div>
        {bill.stage === 4 && bill.wcc_acknowledged_on && (
          <p className="text-body-xs-semibold text-success-primary">
            Billing complete · WCC acknowledged on {renderFormattedDate(bill.wcc_acknowledged_on)}
          </p>
        )}
      </div>
    </E9Panel>
  );
}

function FileRow({
  label,
  kind,
  slug,
  projectId,
  bill,
  canEdit,
}: {
  label: string;
  kind: "certificate" | "pi" | "wcc";
  slug: string;
  projectId: string;
  bill: TE9Bill;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-xs-medium text-tertiary">{label}</span>
      <E9RefFiles
        slug={slug}
        projectId={projectId}
        kind={kind}
        refId={bill.id}
        canUpload={canEdit}
        addText="Attach PDF"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Certified quantities
// ---------------------------------------------------------------------------

function CertifyModal({
  bills,
  bill,
  onClose,
  onSave,
}: {
  bills: TE9Bills;
  bill?: TE9Bill;
  onClose: () => void;
  onSave: (body: object) => Promise<boolean>;
}) {
  const [poId, setPoId] = useState(bill?.po ?? bills.pos[0]?.id ?? "");
  const [certId, setCertId] = useState(bills.certifications[0]?.id ?? "");
  const lines = useMemo(() => bills.lines.filter((line) => line.po === poId), [bills.lines, poId]);
  // what other bills already certified
  const certifiedElsewhere = (lineId: string) =>
    Number(bills.lines.find((line) => line.id === lineId)?.certified ?? 0) -
    Number(bill?.lines.find((line) => line.boq_line === lineId)?.certified_qty ?? 0);
  const [qty, setQty] = useState<Record<string, string>>({});
  useEffect(() => {
    const start: Record<string, string> = {};
    for (const line of lines) {
      const existing = bill?.lines.find((entry) => entry.boq_line === line.id);
      const ready = Math.max(0, Number(line.billable_now) - certifiedElsewhere(line.id));
      start[line.id] = existing ? String(Number(existing.certified_qty)) : ready ? String(ready) : "";
    }
    setQty(start);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- fill once per PO
  }, [poId]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const body = {
      ...(bill ? {} : { po: poId, certification: certId || null }),
      lines: lines
        .filter((line) => qty[line.id] && Number(qty[line.id]) > 0)
        .map((line) => ({ boq_line: line.id, certified_qty: qty[line.id] })),
    };
    const ok = await onSave(body);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <E9Modal
      open
      onClose={onClose}
      size="xl"
      title={bill ? `Certified quantities · ${bill.title}` : "Start a bill"}
      description="Type what the client is certifying. Suggested: installed quantity (up to what is approved) plus client-change reprints."
      footer={
        <>
          <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
          <Button variant="primary" size="md" stretch="auto" label="Save" loading={busy} onClick={save} />
        </>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        {!bill && bills.certifications.length > 0 && (
          <FormField
            label="Signed JMC this bill is for"
            hint="The JMC number and signed date are copied onto the bill."
          >
            <select className={inputClass} value={certId} onChange={(e) => setCertId(e.target.value)}>
              {bills.certifications.map((cert) => (
                <option key={cert.id} value={cert.id}>
                  {cert.label}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {!bill && (
          <FormField label="PO being billed">
            <select className={inputClass} value={poId} onChange={(e) => setPoId(e.target.value)}>
              {bills.pos.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.label}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <div className="overflow-x-auto rounded-lg border border-subtle">
          <table className="w-full min-w-[820px] text-left text-body-xs-regular">
            <thead>
              <tr className="border-b border-subtle bg-layer-1 text-body-2xs-semibold text-tertiary">
                {[
                  "BOQ No.",
                  "Description",
                  "Approved",
                  "Installed",
                  "Client reprints",
                  "Already certified",
                  "Can still certify",
                  "Certify now",
                ].map((heading, index) => (
                  <th key={heading} className={cn("px-3 py-2", index >= 2 && "text-right")}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle text-primary">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-tertiary">
                    This PO has no BOQ lines.
                  </td>
                </tr>
              )}
              {lines.map((line) => {
                const elsewhere = certifiedElsewhere(line.id);
                const remaining = Math.max(0, Number(line.max_billable) - elsewhere);
                const over = Number(qty[line.id] || 0) > remaining;
                return (
                  <tr key={line.id}>
                    <td className="px-3 py-2 font-semibold">{line.line_no}</td>
                    <td className="max-w-[220px] px-3 py-2">{line.description || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(line.allowed)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(line.installed)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(line.client_reprints)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(elsewhere)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {fmt(remaining)} {unitText(line.unit)}
                    </td>
                    <td className="w-32 px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        aria-label={`Certify ${line.line_no}`}
                        className={cn(inputClass, "text-right", over && "border-danger-strong text-danger-primary")}
                        value={qty[line.id] ?? ""}
                        onChange={(e) => setQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-body-2xs-regular text-tertiary">
          Quantity over the BOQ that the client has not confirmed cannot be certified. Add an amendment on the BOQ tab
          and mark it confirmed first.
        </p>
      </div>
    </E9Modal>
  );
}
