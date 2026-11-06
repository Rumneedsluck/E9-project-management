/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { cn } from "@plane/utils";
import { e9ProjectService } from "@/services/e9/project.service";
import { useE9Logs } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import type { TE9Project } from "../types";
import { E9Panel } from "../ui";
import { DateCell, SelectCell, TextCell } from "../tracker/cells";
import { Button } from "@makeplane/propel/components/button";
import { E9Modal } from "../tracker/modal";
import {
  E9RefFiles,
  FormField,
  ItemLink,
  fmt,
  inputClass,
  isPositive,
  mailSearchUrl,
  readMailSettings,
  saveMailSettings,
  showError,
} from "./shared";
import { E9ProductionSent } from "./production-sent";
import type { TE9Challan, TE9JobCard, TE9LogItem, TE9Logs } from "./types";

type Props = { workspaceSlug: string; project: TE9Project };

function Items({
  slug,
  projectId,
  items,
  showQty = false,
}: {
  slug: string;
  projectId: string;
  items: TE9LogItem[];
  showQty?: boolean;
}) {
  if (items.length === 0) return <span className="text-placeholder">No tracker rows</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.id}
          className="inline-flex items-center gap-1"
          title={[item.floor, item.description].filter(Boolean).join(" · ")}
        >
          <ItemLink slug={slug} projectId={projectId} scope={item.scope} code={item.code} />
          {showQty && (
            <span
              className={cn(
                "text-body-2xs-semibold tabular-nums",
                item.sent ? "text-secondary" : "text-warning-primary"
              )}
            >
              ({item.sent ? `${fmt(item.sent)}${item.unit === "sqft" ? " sq ft" : ""}` : "qty?"})
              {item.partial && <span className="ml-0.5 rounded bg-warning-subtle px-1 text-warning-primary">part</span>}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

export function E9LogsPage({ workspaceSlug, project }: Props) {
  const { data, error, isLoading, mutate } = useE9Logs(workspaceSlug, project.id);
  const [tab, setTab] = useState<"jc" | "dc" | "sent">("jc");
  const [mailOpen, setMailOpen] = useState(false);
  const [, setMailVersion] = useState(0);

  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const save = async (kind: "jc" | "dc", number: string, field: string, value: string | null) => {
    try {
      const next: TE9Logs = await e9ProjectService.saveLog(workspaceSlug, project.id, kind, { number, [field]: value });
      await mutate(next, { revalidate: false });
    } catch (problem) {
      showError(`Couldn't save ${kind === "jc" ? "JC" : "DC"} ${number}`, problem);
    }
  };
  const disabled = !data.can_update;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Logs">
          {(
            [
              ["jc", `JC Log · ${data.job_cards.length}`],
              ["dc", `DC Log · ${data.challans.length}`],
              ["sent", "Production sent"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-body-xs-semibold",
                tab === key
                  ? "border-accent-strong bg-accent-subtle text-primary"
                  : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1-hover"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-2xs-regular text-tertiary">
            Numbers and items fill themselves from the JC No. / DC No. typed on tracker rows.
          </p>
          <button
            type="button"
            onClick={() => setMailOpen(true)}
            className="rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-body-xs-semibold text-primary hover:bg-layer-1-hover"
          >
            ✉ Mail settings
          </button>
        </div>
      </div>
      {mailOpen && (
        <MailSettingsModal
          onClose={() => {
            setMailOpen(false);
            setMailVersion((value) => value + 1);
          }}
        />
      )}

      {tab === "sent" ? (
        <E9ProductionSent slug={workspaceSlug} projectId={project.id} logs={data} />
      ) : tab === "jc" ? (
        <E9Panel>
          {data.job_cards.length === 0 ? (
            <p className="px-5 py-10 text-center text-body-sm-regular text-tertiary">
              No job cards yet. Type a JC No. on tracker rows (Pre-press › JC No.) and it shows up here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] text-left text-body-xs-regular">
                <thead>
                  <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                    {[
                      "JC No.",
                      "Items on this JC",
                      "No.",
                      "JC date",
                      "Vendor",
                      "Expected",
                      "Received?",
                      "Received date",
                      "E-proof sent on",
                      "JC copy (PDF / photo)",
                      "Mail",
                    ].map((heading) => (
                      <th key={heading} className="px-3 py-2.5 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle text-primary">
                  {data.job_cards.map((jc: TE9JobCard) => {
                    const late =
                      jc.expected_date &&
                      jc.received !== "Yes" &&
                      jc.expected_date < new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={jc.number} className={cn(late && "bg-danger-subtle/50")}>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{jc.number}</td>
                        <td className="max-w-[300px] min-w-[180px] px-3 py-2">
                          <Items slug={workspaceSlug} projectId={project.id} items={jc.items} />
                        </td>
                        <td className="px-3 py-2 tabular-nums">{jc.count}</td>
                        <td className="w-36 px-1 py-1">
                          <DateCell
                            label="JC date"
                            value={jc.jc_date || null}
                            disabled={disabled}
                            onSave={(v) => save("jc", jc.number, "jc_date", v)}
                          />
                        </td>
                        <td className="w-40 px-1 py-1">
                          <TextCell
                            label="Vendor"
                            value={jc.vendor}
                            placeholder="Vendor"
                            disabled={disabled}
                            onSave={(v) => save("jc", jc.number, "vendor", v)}
                          />
                        </td>
                        <td className="w-36 px-1 py-1">
                          <DateCell
                            label="Expected date"
                            value={jc.expected_date || null}
                            disabled={disabled}
                            onSave={(v) => save("jc", jc.number, "expected_date", v)}
                          />
                        </td>
                        <td className="w-28 px-1 py-1">
                          <SelectCell
                            label="Received?"
                            value={jc.received}
                            options={["Pending", "Partly", "Yes", "No"]}
                            overdue={!!late}
                            disabled={disabled}
                            onSave={(v) => save("jc", jc.number, "received", v)}
                          />
                        </td>
                        <td className="w-36 px-1 py-1">
                          <DateCell
                            label="Received date"
                            value={jc.received_date || null}
                            disabled={disabled}
                            onSave={(v) => save("jc", jc.number, "received_date", v)}
                          />
                        </td>
                        <td className="w-36 px-1 py-1">
                          <DateCell
                            label="E-proof sent on"
                            value={jc.eproof_sent_on || null}
                            disabled={disabled}
                            onSave={(v) => save("jc", jc.number, "eproof_sent_on", v)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <E9RefFiles
                            slug={workspaceSlug}
                            projectId={project.id}
                            kind="document"
                            label={`JC ${jc.number}`}
                            canUpload={!disabled}
                            addText="Attach JC"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <a
                            title="Searches your Gmail for this JC number (you must be signed in to Gmail in this browser)"
                            href={mailSearchUrl(jc.number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-accent-primary hover:underline"
                          >
                            ✉ Open mail
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </E9Panel>
      ) : (
        <E9Panel>
          {data.challans.length === 0 ? (
            <p className="px-5 py-10 text-center text-body-sm-regular text-tertiary">
              No delivery challans yet. Type the DC No. on tracker rows (Dispatch › DC No.) and it shows up here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1900px] text-left text-body-xs-regular">
                <thead>
                  <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                    {[
                      "DC No.",
                      "Items sent",
                      "Lines",
                      "Sq ft",
                      "Nos",
                      "DC date",
                      "Dispatched from",
                      "Sent by",
                      "Vehicle",
                      "Invoice no.",
                      "Invoice date",
                      "E9 sign-off",
                      "Client sign-off",
                      "Client signatory",
                      "Status",
                      "Signed DC scan",
                      "Mail",
                    ].map((heading) => (
                      <th key={heading} className="px-3 py-2.5 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle text-primary">
                  {data.challans.map((dc: TE9Challan) => (
                    <tr key={dc.number}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{dc.number}</td>
                      <td className="max-w-[280px] min-w-[180px] px-3 py-2">
                        <Items slug={workspaceSlug} projectId={project.id} items={dc.items} showQty />
                        {dc.unknown_qty > 0 && (
                          <span className="mt-1 block text-body-2xs-regular text-warning-primary">
                            Type the DC Qty on the tracker for rows marked “qty?”.
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{dc.count}</td>
                      <td className="px-3 py-2 tabular-nums">{isPositive(dc.sqft) ? fmt(dc.sqft) : "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{isPositive(dc.nos) ? fmt(dc.nos) : "—"}</td>
                      <td className="w-36 px-1 py-1">
                        <DateCell
                          label="DC date"
                          value={dc.dc_date || null}
                          disabled={disabled}
                          onSave={(v) => save("dc", dc.number, "dc_date", v)}
                        />
                      </td>
                      {(["dispatched_from", "sent_by", "vehicle", "invoice_no"] as const).map((field) => (
                        <td key={field} className="w-36 px-1 py-1">
                          <TextCell
                            label={field.replace("_", " ")}
                            value={dc[field]}
                            disabled={disabled}
                            onSave={(v) => save("dc", dc.number, field, v)}
                          />
                        </td>
                      ))}
                      <td className="w-36 px-1 py-1">
                        <DateCell
                          label="Invoice date"
                          value={dc.invoice_date || null}
                          disabled={disabled}
                          onSave={(v) => save("dc", dc.number, "invoice_date", v)}
                        />
                      </td>
                      <td className="w-28 px-1 py-1">
                        <SelectCell
                          label="E9 sign-off"
                          value={dc.e9_signoff}
                          options={["Pending", "Signed"]}
                          disabled={disabled}
                          onSave={(v) => save("dc", dc.number, "e9_signoff", v)}
                        />
                      </td>
                      <td className="w-28 px-1 py-1">
                        <SelectCell
                          label="Client sign-off"
                          value={dc.client_signoff}
                          options={["Pending", "Signed", "Returned"]}
                          disabled={disabled}
                          onSave={(v) => save("dc", dc.number, "client_signoff", v)}
                        />
                      </td>
                      <td className="w-36 px-1 py-1">
                        <TextCell
                          label="Client signatory"
                          value={dc.client_signatory}
                          placeholder="Name"
                          disabled={disabled}
                          onSave={(v) => save("dc", dc.number, "client_signatory", v)}
                        />
                      </td>
                      <td className="w-36 px-1 py-1">
                        <SelectCell
                          label="DC status"
                          value={dc.status}
                          options={["Dispatched", "Delivered at Site", "Returned"]}
                          disabled={disabled}
                          onSave={(v) => save("dc", dc.number, "status", v)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <E9RefFiles
                          slug={workspaceSlug}
                          projectId={project.id}
                          kind="dc_scan"
                          label={dc.number}
                          canUpload={!disabled}
                          addText="Scan"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <a
                          href={mailSearchUrl(dc.number)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-accent-primary hover:underline"
                        >
                          ✉ Open mail
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </E9Panel>
      )}
    </div>
  );
}

function MailSettingsModal({ onClose }: { onClose: () => void }) {
  const saved = readMailSettings();
  const [account, setAccount] = useState(saved.account);
  const [words, setWords] = useState(saved.words);
  return (
    <E9Modal
      open
      onClose={onClose}
      title="Open JC / DC mails"
      description="“Open mail” opens Gmail and searches for the JC or DC number. Tell it which mail account to use."
      footer={
        <>
          <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            label="Save"
            onClick={() => {
              saveMailSettings({ account: account.trim(), words: words.trim() });
              onClose();
            }}
          />
        </>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <FormField
          label="Your work Gmail / Google Workspace address"
          hint="The account where job cards and DCs are mailed. Leave empty to use the first account signed in to Chrome."
        >
          <input
            className={inputClass}
            type="email"
            value={account}
            placeholder="you@yourcompany.com"
            onChange={(event) => setAccount(event.target.value)}
          />
        </FormField>
        <FormField
          label="Extra search words (optional)"
          hint="Added before the number, e.g. “Job Card” or “from:vendor@imedia.com”. Leave empty to search just the number."
        >
          <input className={inputClass} value={words} onChange={(event) => setWords(event.target.value)} />
        </FormField>
        <p className="rounded-lg bg-layer-1 px-3 py-2 text-body-2xs-regular text-tertiary">
          You must be signed in to that Gmail in this browser. The website does not read your mailbox – it only opens
          the search. This setting is saved on this computer.
        </p>
      </div>
    </E9Modal>
  );
}
