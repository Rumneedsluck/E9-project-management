/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Certification & Billing tab.
 *   1. Print the JMC sheet from the tracker, take it to site.
 *   2. Type the certified sizes / quantities into the tracker.
 *   3. Upload the signed JMC (photo or PDF) and mark it signed  ->  billing opens below.
 * Big jobs can certify floor by floor or scope by scope. Admins can allow part billing early.
 */

import { useState } from "react";
import { AddOutline, DocumentationOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { cn, renderFormattedDate } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { refreshE9Commercial, useE9Certifications, useE9Items, useE9Scopes } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import { E9Modal } from "../tracker/modal";
import type { TE9Project } from "../types";
import { E9Panel, E9ProgressBar } from "../ui";
import { E9BillingPage } from "./billing-page";
import { printJmcSheet } from "./jmc-sheet";
import { E9RefFiles, FormField, SmallButton, inputClass, showError } from "./shared";
import type { TE9Certification, TE9Certifications, TE9Readiness } from "./types";

type Props = { workspaceSlug: string; project: TE9Project };

const STATE_TONE: Record<TE9Certifications["state"], string> = {
  in_progress: "text-tertiary",
  jmc_pending: "text-warning-primary",
  part_certified: "text-accent-primary",
  certified: "text-success-primary",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function Readiness({ value, compact = false }: { value: TE9Readiness; compact?: boolean }) {
  const percent = value.rows ? Math.round((value.certified / value.rows) * 100) : 0;
  return (
    <span className={cn("flex flex-col gap-1", compact ? "w-60" : "w-full max-w-sm")}>
      <span className="flex items-center justify-between text-body-2xs-medium text-tertiary">
        <span>
          Certified qty typed in tracker:{" "}
          <span className="font-semibold text-primary">
            {value.certified}/{value.rows}
          </span>{" "}
          rows
        </span>
        <span className="tabular-nums">{percent}%</span>
      </span>
      <E9ProgressBar value={percent} className="h-1" />
    </span>
  );
}

export function E9CertificationPage({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Certifications(workspaceSlug, project.id);
  const { data: itemData } = useE9Items(workspaceSlug, project.id);
  const { data: scopes } = useE9Scopes(workspaceSlug, project.id);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TE9Certification | null>(null);

  const send = async (title: string, request: () => Promise<TE9Certifications>) => {
    try {
      await mutate(await request(), { revalidate: false });
      await refreshE9Commercial(workspaceSlug, project.id);
      return true;
    } catch (problem) {
      showError(title, problem);
      return false;
    }
  };

  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const scopeLabel = (key: string) => data.scopes.find((scope) => scope.key === key)?.label ?? key;
  const partLabel = (part: { floor: string; scope: string }) =>
    [part.floor, part.scope ? scopeLabel(part.scope) : ""].filter(Boolean).join(" · ") || "Whole project";
  const print = (part: { floor: string; scope: string; jmc_number?: string }, filled: boolean) =>
    printJmcSheet({
      project,
      items: itemData?.items ?? [],
      scopes: scopes ?? [],
      part: { ...part, label: partLabel(part) },
      filled,
    });

  return (
    <div className="flex flex-col gap-5">
      {/* status */}
      <section className="flex flex-col gap-5 rounded-xl border border-subtle bg-surface-1 p-5 shadow-raised-100 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-body-xs-semibold tracking-[0.14em] text-tertiary uppercase">Certification</span>
            <span className={cn("text-h4-semibold", STATE_TONE[data.state])}>{data.state_text}</span>
            <span className="text-body-xs-regular text-tertiary">
              {data.billing_open ? "Billing is open for this project." : "Billing opens once a JMC is marked signed."}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              stretch="auto"
              variant="secondary"
              size="md"
              icon={<DocumentationOutline className="size-4" />}
              label="Print blank JMC sheet"
              onClick={() => print({ floor: "", scope: "" }, false)}
            />
            {data.can_edit && (
              <Button
                stretch="auto"
                variant="primary"
                size="md"
                icon={<AddOutline className="size-4" />}
                label="Add JMC"
                onClick={() => setAdding(true)}
              />
            )}
          </div>
        </div>

        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            ["Print & measure", "Print the JMC sheet, measure on site with the client."],
            ["Type certified qty", "Fill the Certified columns in the Tracker tab."],
            ["Upload signed JMC", "Attach the signed sheet and mark it signed. Billing opens."],
          ].map(([title, text], index) => (
            <li key={title} className="rounded-lg bg-layer-1 px-3 py-2">
              <span className="text-body-xs-semibold text-primary">
                {index + 1} · {title}
              </span>
              <p className="text-body-2xs-regular text-tertiary">{text}</p>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <Readiness value={data.overall} />
          {data.can_edit && (
            <label className="flex items-center gap-2 text-body-xs-medium text-secondary">
              <input
                type="checkbox"
                checked={data.allow_part_billing}
                onChange={(event) => {
                  const allow = event.target.checked;
                  const question = allow
                    ? "Allow billing before the JMC is signed (running / part bills)?"
                    : "Stop part billing? Bills already raised stay.";
                  if (!window.confirm(question)) return;
                  void send("Couldn't change part billing", () =>
                    e9ProjectService.setPartBilling(workspaceSlug, project.id, allow)
                  );
                }}
              />
              Allow part billing before JMC <span className="text-tertiary">(admins)</span>
            </label>
          )}
        </div>
      </section>

      {/* JMC list */}
      <E9Panel title={`JMCs · ${data.certifications.length}`}>
        {data.certifications.length === 0 ? (
          <p className="px-5 py-10 text-center text-body-sm-regular text-tertiary">
            No JMC yet. {data.can_edit ? "Click “Add JMC” for the whole project, or one per floor / scope." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-subtle">
            {data.certifications.map((cert) => (
              <li key={cert.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm-semibold text-primary">{partLabel(cert)}</span>
                      {cert.done_on ? (
                        <span className="rounded-full bg-success-subtle px-2 py-0.5 text-body-2xs-semibold text-success-primary">
                          Signed {renderFormattedDate(cert.done_on)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-body-2xs-semibold text-warning-primary">
                          Not signed yet
                        </span>
                      )}
                      {cert.done_on && cert.files === 0 && !cert.link && (
                        <span className="text-body-2xs-semibold text-warning-primary">Signed copy missing</span>
                      )}
                    </span>
                    <span className="text-body-xs-regular text-tertiary">
                      {[
                        cert.jmc_number && `JMC ${cert.jmc_number}`,
                        cert.jmc_date && `measured ${renderFormattedDate(cert.jmc_date)}`,
                        cert.client_signatory && `signed by ${cert.client_signatory}`,
                        cert.bills > 0 && `${cert.bills} bill${cert.bills === 1 ? "" : "s"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No details yet"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <SmallButton tone="neutral" onClick={() => print(cert, false)}>
                      Print blank
                    </SmallButton>
                    <SmallButton tone="neutral" onClick={() => print(cert, true)}>
                      Print with certified qty
                    </SmallButton>
                    {data.can_edit && !cert.done_on && (
                      <SmallButton
                        onClick={() =>
                          void send("Couldn't mark it signed", () =>
                            e9ProjectService.updateCertification(workspaceSlug, project.id, cert.id, {
                              done_on: todayIso(),
                            })
                          )
                        }
                      >
                        Mark signed today
                      </SmallButton>
                    )}
                    {data.can_edit && (
                      <SmallButton tone="neutral" onClick={() => setEditing(cert)}>
                        Edit
                      </SmallButton>
                    )}
                    {data.can_edit && cert.bills === 0 && (
                      <SmallButton
                        tone="danger"
                        onClick={() => {
                          if (!window.confirm(`Delete the JMC for ${partLabel(cert)}?`)) return;
                          void send("Couldn't delete", () =>
                            e9ProjectService.deleteCertification(workspaceSlug, project.id, cert.id)
                          );
                        }}
                      >
                        Delete
                      </SmallButton>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <span className="flex flex-wrap items-center gap-2 text-body-xs-medium text-tertiary">
                    Signed JMC:
                    <E9RefFiles
                      slug={workspaceSlug}
                      projectId={project.id}
                      kind="jmc"
                      refId={cert.id}
                      canUpload={data.can_edit}
                      addText="Upload signed JMC"
                    />
                    {cert.link && (
                      <a
                        href={cert.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-body-2xs-semibold text-accent-primary hover:underline"
                      >
                        Open link
                      </a>
                    )}
                  </span>
                  <Readiness value={cert.readiness} compact />
                </div>
              </li>
            ))}
          </ul>
        )}
      </E9Panel>

      {/* billing, below the JMCs */}
      <E9BillingPage workspaceSlug={workspaceSlug} project={project} />

      {(adding || editing) && (
        <JmcModal
          data={data}
          cert={editing ?? undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSave={(body) =>
            send("Couldn't save the JMC", () =>
              editing
                ? e9ProjectService.updateCertification(workspaceSlug, project.id, editing.id, body)
                : e9ProjectService.createCertification(workspaceSlug, project.id, body)
            )
          }
        />
      )}
    </div>
  );
}

type TCovers = "whole" | "floor" | "scope" | "both";

function JmcModal({
  data,
  cert,
  onClose,
  onSave,
}: {
  data: TE9Certifications;
  cert?: TE9Certification;
  onClose: () => void;
  onSave: (body: object) => Promise<boolean>;
}) {
  const initialCovers: TCovers = cert
    ? cert.floor && cert.scope
      ? "both"
      : cert.floor
        ? "floor"
        : cert.scope
          ? "scope"
          : "whole"
    : "whole";
  const [covers, setCovers] = useState<TCovers>(initialCovers);
  const [floor, setFloor] = useState(cert?.floor ?? data.floors[0] ?? "");
  const [scope, setScope] = useState(cert?.scope ?? data.scopes[0]?.key ?? "");
  const [form, setForm] = useState({
    jmc_number: cert?.jmc_number ?? "",
    jmc_date: cert?.jmc_date ?? "",
    client_signatory: cert?.client_signatory ?? "",
    done_on: cert?.done_on ?? "",
    link: cert?.link ?? "",
    notes: cert?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const save = async () => {
    setBusy(true);
    const ok = await onSave({
      ...form,
      floor: covers === "floor" || covers === "both" ? floor : "",
      scope: covers === "scope" || covers === "both" ? scope : "",
    });
    setBusy(false);
    if (ok) onClose();
  };

  const coverOptions: { key: TCovers; label: string }[] = [
    { key: "whole", label: "Whole project" },
    { key: "floor", label: "One floor" },
    { key: "scope", label: "One scope" },
    { key: "both", label: "Floor + scope" },
  ];

  return (
    <E9Modal
      open
      onClose={onClose}
      size="lg"
      title={cert ? "Edit JMC" : "Add JMC"}
      description="One JMC for the whole project, or one per floor / scope for running bills."
      footer={
        <>
          <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
          <Button variant="primary" size="md" stretch="auto" label="Save" loading={busy} onClick={save} />
        </>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <FormField label="This JMC covers">
          <div className="flex flex-wrap gap-1.5">
            {coverOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setCovers(option.key)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-body-xs-semibold",
                  covers === option.key
                    ? "border-transparent bg-[#0B0B0B] text-white"
                    : "border-subtle text-secondary hover:bg-layer-1-hover"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(covers === "floor" || covers === "both") && (
            <FormField label="Floor">
              <input
                className={inputClass}
                list="e9-jmc-floors"
                value={floor}
                onChange={(event) => setFloor(event.target.value)}
              />
              <datalist id="e9-jmc-floors">
                {data.floors.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </FormField>
          )}
          {(covers === "scope" || covers === "both") && (
            <FormField label="Scope">
              <select className={inputClass} value={scope} onChange={(event) => setScope(event.target.value)}>
                {data.scopes.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="JMC no. (optional)">
            <input className={inputClass} value={form.jmc_number} onChange={set("jmc_number")} />
          </FormField>
          <FormField label="Measured on site on">
            <input type="date" className={inputClass} value={form.jmc_date} onChange={set("jmc_date")} />
          </FormField>
          <FormField label="Client signatory">
            <input
              className={inputClass}
              placeholder="Name & designation"
              value={form.client_signatory}
              onChange={set("client_signatory")}
            />
          </FormField>
          <FormField label="JMC signed on" hint="Leave empty until the client signs. Setting it opens billing.">
            <input type="date" className={inputClass} value={form.done_on} onChange={set("done_on")} />
          </FormField>
          <FormField label="Link to signed copy (optional)" hint="Drive / mail link. You can also upload the file.">
            <input className={inputClass} placeholder="https://…" value={form.link} onChange={set("link")} />
          </FormField>
          <FormField label="Notes">
            <input className={inputClass} value={form.notes} onChange={set("notes")} />
          </FormField>
        </div>
      </div>
    </E9Modal>
  );
}
