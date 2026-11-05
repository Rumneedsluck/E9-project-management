/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { cn } from "@plane/utils";
import { useE9Summary } from "../hooks";
import { E9ErrorState, E9LoadingState } from "../states";
import { E9PageHeader, E9Panel } from "../ui";
import { BillStepper } from "./billing-page";
import { ItemLink, StatusPill, fmt, trackerHref, unitText } from "./shared";
import type { TE9BoqLine, TE9SummaryProject } from "./types";

function LineRow({ slug, project, line }: { slug: string; project: TE9SummaryProject; line: TE9BoqLine }) {
  return (
    <tr className={line.status === "excess" ? "bg-danger-subtle/40" : "bg-warning-subtle/30"}>
      <td className="px-4 py-2.5">
        <Link
          href={`/${slug}/e9/projects/${project.id}?view=boq`}
          className="font-semibold text-primary hover:underline"
        >
          {project.name}
        </Link>
        <span className="block text-body-2xs-regular text-tertiary">{line.po_label}</span>
      </td>
      <td className="px-4 py-2.5 font-semibold">{line.line_no}</td>
      <td className="max-w-[240px] px-4 py-2.5">{line.description || "—"}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(line.allowed)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <Link
          href={trackerHref(slug, project.id, line.scope, line.line_no)}
          className="font-semibold text-accent-primary hover:underline"
        >
          {fmt(line.on_tracker)}
        </Link>
      </td>
      <td
        className={cn(
          "px-4 py-2.5 text-right font-semibold tabular-nums",
          line.status === "excess" ? "text-danger-primary" : "text-warning-primary"
        )}
      >
        +{fmt(line.extra)} {unitText(line.unit)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {Number(line.pending) > 0 ? `+${fmt(line.pending)}` : "—"}
      </td>
      <td className="px-4 py-2.5">
        <StatusPill status={line.status} />
      </td>
    </tr>
  );
}

/** One page for the whole company: what crossed the BOQ, what waits for a mail, where each bill is. */
export function E9SummaryPage({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, error, isLoading, mutate } = useE9Summary(workspaceSlug);
  if (isLoading && !data) return <E9LoadingState />;
  if (error || !data) return <E9ErrorState onRetry={() => mutate()} />;

  const projects = data.projects;
  const flagged = projects.flatMap((project) =>
    [...project.excess, ...project.pending].map((line) => ({ project, line }))
  );
  const excessCount = projects.reduce((t, p) => t + p.excess.length, 0);
  const pendingCount = projects.reduce((t, p) => t + p.pending.length, 0);
  const unlinked = projects.filter((p) => p.unlinked.length > 0 || p.missing_boq_no > 0);
  const bills = projects.flatMap((project) => project.bills.map((bill) => ({ project, bill })));
  const byStage = [0, 1, 2, 3, 4].map((stage) => bills.filter(({ bill }) => bill.stage === stage).length);

  return (
    <div className="flex flex-col gap-5">
      <E9PageHeader
        eyebrow="Summary"
        title="Extra over BOQ & billing"
        description="Every project in one place: production that crossed the BOQ, extra waiting for the client's mail, and where each bill stands."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Lines over BOQ – not approved" value={excessCount} tone={excessCount ? "danger" : "ok"} />
        <Tile label="Waiting for client confirmation" value={pendingCount} tone={pendingCount ? "warning" : "ok"} />
        <Tile label="Bills in progress" value={bills.length - byStage[4]} />
        <Tile label="Bills complete (WCC acknowledged)" value={byStage[4]} tone="ok" />
      </div>

      <E9Panel title={`Extra over BOQ · ${flagged.length}`}>
        {flagged.length === 0 ? (
          <p className="px-5 py-8 text-center text-body-sm-regular text-success-primary">
            ✓ Nothing has crossed the BOQ.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-body-xs-regular">
              <thead>
                <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                  {[
                    "Project",
                    "BOQ No.",
                    "Description",
                    "Allowed",
                    "On tracker",
                    "Over BOQ",
                    "Waiting mail",
                    "Status",
                  ].map((heading, index) => (
                    <th key={heading} className={cn("px-4 py-2.5", index >= 3 && index <= 6 && "text-right")}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle text-primary">
                {flagged.map(({ project, line }) => (
                  <LineRow key={line.id} slug={workspaceSlug} project={project} line={line} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </E9Panel>

      {unlinked.length > 0 && (
        <E9Panel title="Tracker rows not on any BOQ">
          <ul className="divide-y divide-subtle">
            {unlinked.map((project) => (
              <li key={project.id} className="flex flex-col gap-1.5 px-5 py-3">
                <Link
                  href={`/${workspaceSlug}/e9/projects/${project.id}?view=boq`}
                  className="text-body-sm-semibold text-primary hover:underline"
                >
                  {project.name}
                </Link>
                {project.unlinked.map((group) => (
                  <span key={group.boq_no} className="flex flex-wrap items-center gap-1.5 text-body-xs-regular">
                    <span className="text-danger-primary">BOQ No. “{group.boq_no}” is not on the BOQ:</span>
                    {group.items.map((item) => (
                      <ItemLink
                        key={item.id}
                        slug={workspaceSlug}
                        projectId={project.id}
                        scope={item.scope}
                        code={item.code}
                      />
                    ))}
                  </span>
                ))}
                {project.missing_boq_no > 0 && (
                  <span className="text-body-xs-regular text-tertiary">
                    {project.missing_boq_no} row(s) have no BOQ No. typed.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </E9Panel>
      )}

      <E9Panel title={`Billing · ${bills.length} bill(s)`}>
        {bills.length === 0 ? (
          <p className="px-5 py-8 text-center text-body-sm-regular text-tertiary">No bills started yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-body-xs-regular">
              <thead>
                <tr className="border-b border-subtle text-body-2xs-semibold text-tertiary">
                  <th className="px-4 py-2.5">Project</th>
                  <th className="px-4 py-2.5">Bill</th>
                  <th className="w-[280px] px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle text-primary">
                {bills.map(({ project, bill }) => (
                  <tr key={bill.id}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/${workspaceSlug}/e9/projects/${project.id}?view=billing`}
                        className="font-semibold hover:underline"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{bill.title}</td>
                    <td className="px-4 py-2.5">
                      <BillStepper stage={bill.stage} compact />
                    </td>
                    <td className={cn("px-4 py-2.5", bill.stage === 4 ? "text-success-primary" : "text-secondary")}>
                      {bill.stage_text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </E9Panel>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" | "ok" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-subtle bg-surface-1 p-4 shadow-raised-100">
      <span className="text-body-2xs-semibold tracking-wide text-tertiary uppercase">{label}</span>
      <span
        className={cn(
          "text-h3-semibold tabular-nums",
          tone === "danger" && "text-danger-primary",
          tone === "warning" && "text-warning-primary",
          tone === "ok" && "text-success-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}
