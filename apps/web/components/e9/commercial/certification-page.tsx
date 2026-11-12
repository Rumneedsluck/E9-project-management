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
 * Step 2 (billing) stays locked until a JMC is signed. Big jobs can sign a JMC per floor or scope
 * and bill that part.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { AddOutline, DocumentationOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { cn, renderFormattedDate } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { refreshE9Commercial, useE9Certifications, useE9Items, useE9Scopes } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import { E9Modal } from "../tracker/modal";
import type { TE9Project } from "../types";
import { E9ProgressBar } from "../ui";
import { E9BillingPage } from "./billing-page";
import { printJmcSheet } from "./jmc-sheet";
import { E9RefFiles, FormField, SmallButton, inputClass, safeHref, showError } from "./shared";
import type { TE9Certification, TE9Certifications, TE9Readiness } from "./types";
import { e9Confirm } from "../confirm";

type Props = { workspaceSlug: string; project: TE9Project };

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
  const [completing, setCompleting] = useState<TE9Certification | null>(null);
  const [showSteps, setShowSteps] = useState(false);

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
  if (!data) return error ? <E9ErrorState onRetry={() => mutate()} /> : <E9LoadingState />;

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

  const certs = data.certifications;
  const signed = certs.filter((cert) => cert.done_on);
  const measured = certs.some((cert) => cert.jmc_date) || signed.length > 0;
  const typedAll = data.overall.rows > 0 && data.overall.certified >= data.overall.rows;
  const step1Done = data.state === "certified" || data.state === "part_certified";
  const trackerHref = `/${workspaceSlug}/e9/projects/${project.id}?view=tracker`;

  const startWhole = () =>
    void send("Couldn't start the JMC", () =>
      e9ProjectService.createCertification(workspaceSlug, project.id, { floor: "", scope: "" })
    );

  return (
    <div className="flex flex-col gap-5">
      {/* the two steps at a glance */}
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StepHeader
          number={1}
          title="Certification"
          state={step1Done ? "done" : "current"}
          text={step1Done ? `Done · ${signed.map((cert) => partLabel(cert)).join(", ")}` : data.state_text}
        />
        <StepHeader
          number={2}
          title="Billing"
          state={data.billing_open ? "current" : "locked"}
          text={data.billing_open ? "Open – start a bill below" : "Starts after certification is done"}
        />
      </ol>

      {/* STEP 1 */}
      <section className="flex flex-col gap-5 rounded-xl border border-subtle bg-surface-1 p-5 shadow-raised-100 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-body-xs-semibold tracking-[0.14em] text-tertiary uppercase">Step 1</span>
            <h2 className="text-h5-semibold text-primary">Certification (JMC)</h2>
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
            <Button
              stretch="auto"
              variant="secondary"
              size="md"
              label="Print with certified qty"
              onClick={() => print({ floor: "", scope: "" }, true)}
            />
          </div>
        </div>

        {step1Done && !showSteps ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm-regular text-secondary">
            <span className="text-success-primary">✓ Measured and signed by the client</span>
            {!typedAll && (
              <span className="text-warning-primary">
                · only {data.overall.certified} of {data.overall.rows} rows have a certified qty
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowSteps(true)}
              className="text-body-xs-semibold text-accent-primary hover:underline"
            >
              Show the steps
            </button>
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-subtle rounded-lg border border-subtle">
            <CheckRow
              number={1}
              state={measured ? "done" : "current"}
              title="Measure on site with the client"
              text="Take the printed JMC sheet to site."
            />
            <CheckRow
              number={2}
              state={typedAll ? "done" : step1Done ? "warn" : measured ? "current" : "todo"}
              title="Type the certified qty in the Tracker"
              text={
                step1Done && !typedAll
                  ? `Billing is open, but only ${data.overall.certified} of ${data.overall.rows} rows have a certified qty.`
                  : `${data.overall.certified} of ${data.overall.rows} rows filled (Certified columns).`
              }
              action={
                <a href={trackerHref} className="text-body-xs-semibold text-accent-primary hover:underline">
                  Open Tracker →
                </a>
              }
            />
            <CheckRow
              number={3}
              state={step1Done ? "done" : measured && typedAll ? "current" : "todo"}
              title="Client signs the JMC → Certification done"
              text="Upload the signed sheet and press “Certification done”. Billing opens."
            />
          </ol>
        )}

        {certs.length === 0 ? (
          data.can_edit ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                stretch="auto"
                variant="primary"
                size="lg"
                icon={<AddOutline className="size-4" />}
                label="Start JMC for the whole project"
                onClick={startWhole}
              />
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-body-sm-semibold text-accent-primary hover:underline"
              >
                or one floor / scope (part bill)
              </button>
            </div>
          ) : (
            <p className="text-body-sm-regular text-tertiary">No JMC started yet.</p>
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {certs.map((cert) => (
              <li
                key={cert.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-4",
                  cert.done_on ? "border-subtle bg-layer-1" : "border-strong"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body-md-semibold text-primary">JMC · {partLabel(cert)}</span>
                      {cert.done_on ? (
                        <span className="rounded-full bg-success-subtle px-2 py-0.5 text-body-2xs-semibold text-success-primary">
                          ✓ Certification done {renderFormattedDate(cert.done_on)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-body-2xs-semibold text-warning-primary">
                          Waiting for client signature
                        </span>
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
                        .join(" · ") || "Fill in the details with Edit"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {data.can_edit && !cert.done_on && (
                      <Button
                        stretch="auto"
                        variant="primary"
                        size="md"
                        label="Certification done"
                        onClick={() => setCompleting(cert)}
                      />
                    )}
                    <SmallButton tone="neutral" onClick={() => print(cert, false)}>
                      Print blank
                    </SmallButton>
                    <SmallButton tone="neutral" onClick={() => print(cert, true)}>
                      Print filled
                    </SmallButton>
                    {data.can_edit && (
                      <SmallButton tone="neutral" onClick={() => setEditing(cert)}>
                        Edit
                      </SmallButton>
                    )}
                    {data.can_edit && cert.bills === 0 && (
                      <SmallButton
                        tone="danger"
                        onClick={async () => {
                          if (!(await e9Confirm(`Delete the JMC for ${partLabel(cert)}?`))) return;
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
                        href={safeHref(cert.link)}
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
            {data.can_edit && (
              <li>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="text-body-xs-semibold text-accent-primary hover:underline"
                >
                  + Another JMC (a floor or scope for a part bill)
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* STEP 2 */}
      <section
        className={cn(
          "flex flex-col gap-4 rounded-xl border p-5 sm:p-6",
          data.billing_open ? "border-subtle bg-surface-1 shadow-raised-100" : "border-dashed border-strong"
        )}
      >
        <div className="flex flex-col gap-1">
          <span className="text-body-xs-semibold tracking-[0.14em] text-tertiary uppercase">Step 2</span>
          <h2 className={cn("text-h5-semibold", data.billing_open ? "text-primary" : "text-placeholder")}>Billing</h2>
        </div>
        {data.billing_open ? (
          <E9BillingPage workspaceSlug={workspaceSlug} project={project} />
        ) : (
          <p className="flex items-center gap-2 text-body-sm-regular text-tertiary">
            <span aria-hidden>🔒</span>
            Billing starts after certification is done. Finish Step 1 first.
          </p>
        )}
      </section>

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
      {completing && (
        <DoneModal
          cert={completing}
          label={partLabel(completing)}
          slug={workspaceSlug}
          projectId={project.id}
          onClose={() => setCompleting(null)}
          onSave={(body) =>
            send("Couldn't mark certification done", () =>
              e9ProjectService.updateCertification(workspaceSlug, project.id, completing.id, body)
            )
          }
        />
      )}
    </div>
  );
}

function StepHeader({
  number,
  title,
  state,
  text,
}: {
  number: number;
  title: string;
  state: "done" | "current" | "locked";
  text: string;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        state === "done" && "border-transparent bg-success-subtle",
        state === "current" && "border-strong bg-surface-1",
        state === "locked" && "border-dashed border-strong opacity-70"
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-body-sm-semibold",
          state === "done"
            ? "bg-success-primary text-white"
            : state === "current"
              ? "bg-[#0B0B0B] text-white"
              : "bg-layer-3 text-tertiary"
        )}
      >
        {state === "done" ? "✓" : state === "locked" ? "🔒" : number}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body-sm-semibold text-primary">
          Step {number} · {title}
        </span>
        <span className="truncate text-body-xs-regular text-tertiary">{text}</span>
      </span>
    </li>
  );
}

type TCheckState = "done" | "current" | "warn" | "todo";

function CheckRow({
  number,
  state,
  title,
  text,
  action,
}: {
  number: number;
  state: TCheckState;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  const mark = { done: "✓", warn: "!", current: String(number), todo: String(number) }[state];
  const label = { done: "done", warn: "needs attention", current: "next step", todo: "not yet" }[state];
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", state === "current" && "bg-[#F59E0B]/10")}>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full text-body-2xs-semibold",
          state === "done" && "bg-success-primary text-white",
          state === "warn" && "bg-[#F59E0B] text-black",
          state === "current" && "bg-[#F59E0B] text-black",
          state === "todo" && "border border-strong text-placeholder"
        )}
      >
        {mark}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("text-body-sm-semibold", state === "todo" ? "text-secondary" : "text-primary")}>
          {title}
          <span className="sr-only"> ({label})</span>
        </span>
        <span className="text-body-xs-regular text-tertiary">{text}</span>
      </span>
      {action}
    </li>
  );
}

/** "Certification done": the signed date, who signed, and the signed copy. */
function DoneModal({
  cert,
  label,
  slug,
  projectId,
  onClose,
  onSave,
}: {
  cert: TE9Certification;
  label: string;
  slug: string;
  projectId: string;
  onClose: () => void;
  onSave: (body: object) => Promise<boolean>;
}) {
  const [doneOn, setDoneOn] = useState(todayIso());
  const [signatory, setSignatory] = useState(cert.client_signatory);
  const [jmcNumber, setJmcNumber] = useState(cert.jmc_number);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await onSave({ done_on: doneOn, client_signatory: signatory, jmc_number: jmcNumber });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <E9Modal
      open
      onClose={onClose}
      title={`Certification done · ${label}`}
      description="The client has signed the JMC. Billing opens as soon as you save."
      footer={
        <>
          <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            label="Certification done"
            loading={busy}
            disabled={!doneOn}
            onClick={save}
          />
        </>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <FormField label="JMC signed on">
          <input
            type="date"
            className={inputClass}
            value={doneOn}
            max={todayIso()}
            onChange={(e) => setDoneOn(e.target.value)}
          />
        </FormField>
        <FormField label="Signed by (client)">
          <input
            className={inputClass}
            placeholder="Name & designation"
            value={signatory}
            onChange={(e) => setSignatory(e.target.value)}
          />
        </FormField>
        <FormField label="JMC no. (optional)">
          <input className={inputClass} value={jmcNumber} onChange={(e) => setJmcNumber(e.target.value)} />
        </FormField>
        <FormField label="Signed copy (photo or PDF)">
          <E9RefFiles
            slug={slug}
            projectId={projectId}
            kind="jmc"
            refId={cert.id}
            canUpload
            addText="Upload signed JMC"
          />
        </FormField>
      </div>
    </E9Modal>
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
