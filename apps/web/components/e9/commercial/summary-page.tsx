/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Billing (company-wide). Only sites whose billing is open: a JMC signed for the whole project, or for a
 * floor / scope (part bill). Extra-over-BOQ lives inside each project's BOQ tab.
 */

import Link from "next/link";
import { cn } from "@plane/utils";
import { useE9Summary } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import { E9CodeTile, E9PageHeader, E9Panel } from "../ui";
import { BillStepper } from "./billing-page";
import { money } from "./shared";
import type { TE9SummaryProject } from "./types";

const CERT_TEXT: Record<TE9SummaryProject["cert_state"], string> = {
  in_progress: "Part certified",
  jmc_pending: "Part certified",
  part_certified: "Part certified",
  certified: "Certified",
};

export function E9SummaryPage({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, error, isLoading, mutate } = useE9Summary(workspaceSlug);
  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const projects = data.projects;
  const bills = projects.flatMap((project) => project.bills.map((bill) => ({ project, bill })));
  const open = bills.filter(({ bill }) => bill.stage < 4);
  const done = bills.filter(({ bill }) => bill.stage === 4);
  const sum = (rows: typeof bills) => rows.reduce((total, { bill }) => total + Number(bill.amount ?? 0), 0);
  const notStarted = projects.filter((project) => project.bills.length === 0);

  return (
    <div className="flex flex-col gap-5">
      <E9PageHeader
        eyebrow="Billing"
        title="Billing"
        description="Sites appear here once their JMC is signed. Each bill moves: certification → proforma invoice → PI signed & submitted → WCC."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sites ready to bill" value={String(projects.length)} />
        <Tile
          label="Bills not started"
          value={String(notStarted.length)}
          tone={notStarted.length ? "warning" : undefined}
        />
        <Tile label={`In progress · ${open.length}`} value={money(sum(open))} />
        <Tile label={`Done (WCC) · ${done.length}`} value={money(sum(done))} tone="ok" />
      </div>

      {data.waiting_for_jmc.length > 0 && (
        <p className="rounded-xl border border-subtle bg-surface-1 px-4 py-3 text-body-xs-regular text-secondary">
          <span className="font-semibold text-primary">Not open yet · waiting for JMC:</span>{" "}
          {data.waiting_for_jmc.map((project, index) => (
            <span key={project.id}>
              {index > 0 && ", "}
              <Link
                href={`/${workspaceSlug}/e9/projects/${project.id}?view=certification`}
                className="font-semibold text-accent-primary hover:underline"
              >
                {project.name}
              </Link>
            </span>
          ))}
        </p>
      )}

      {projects.length === 0 ? (
        <E9Panel>
          <p className="px-5 py-12 text-center text-body-sm-regular text-tertiary">
            No site is ready to bill yet. Open a project →{" "}
            <span className="font-semibold">Certification &amp; Billing</span> and mark its JMC as signed.
          </p>
        </E9Panel>
      ) : (
        projects.map((project) => (
          <E9Panel
            key={project.id}
            title={
              <span className="flex items-center gap-3">
                <E9CodeTile code={project.identifier} size="sm" />
                <Link
                  href={`/${workspaceSlug}/e9/projects/${project.id}?view=certification`}
                  className="hover:underline"
                >
                  {project.name}
                </Link>
                <span className="text-body-2xs-semibold text-success-primary">{CERT_TEXT[project.cert_state]}</span>
              </span>
            }
            action={
              <span className="text-body-xs-regular text-tertiary">
                Billable now <span className="font-semibold text-primary">{money(project.billable_amount)}</span>
              </span>
            }
          >
            {project.bills.length === 0 ? (
              <p className="px-5 py-5 text-body-sm-regular text-tertiary">
                No bill started.{" "}
                <Link
                  href={`/${workspaceSlug}/e9/projects/${project.id}?view=certification`}
                  className="font-semibold text-accent-primary hover:underline"
                >
                  Start the bill →
                </Link>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-body-xs-regular">
                  <thead>
                    <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                      <th className="px-5 py-2.5">Bill</th>
                      <th className="w-[260px] px-5 py-2.5">Stage</th>
                      <th className="px-5 py-2.5">Now</th>
                      <th className="px-5 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle text-primary">
                    {project.bills.map((bill) => (
                      <tr key={bill.id}>
                        <td className="px-5 py-2.5">
                          <span className="font-semibold">{bill.title}</span>
                          {bill.certification_label && (
                            <span className="block text-body-2xs-regular text-tertiary">
                              JMC · {bill.certification_label}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2.5">
                          <BillStepper stage={bill.stage} compact />
                        </td>
                        <td className={cn("px-5 py-2.5", bill.stage === 4 ? "text-success-primary" : "text-secondary")}>
                          {bill.stage_text}
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{money(bill.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </E9Panel>
        ))
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warning" | "ok" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-subtle bg-surface-1 p-4 shadow-raised-100">
      <span className="text-body-2xs-semibold tracking-wide text-tertiary uppercase">{label}</span>
      <span
        className={cn(
          "text-h4-semibold tabular-nums",
          tone === "warning" && "text-warning-primary",
          tone === "ok" && "text-success-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}
