/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { BillingsOutline, ReceiptOutline } from "@makeplane/propel/icons";
import { useE9Boq } from "../hooks";
import { E9Panel } from "../ui";
import { BillStepper } from "./billing-page";
import { SmallButton, StatusPill, fmt, unitText } from "./shared";

/** Project dashboard: BOQ check (extra over BOQ) and where the bills are. */
export function E9BoqDashboardPanel({
  workspaceSlug,
  projectId,
  onOpen,
}: {
  workspaceSlug: string;
  projectId: string;
  onOpen: (view: "boq" | "billing") => void;
}) {
  const { data } = useE9Boq(workspaceSlug, projectId);
  if (!data || (data.lines.length === 0 && data.bills.length === 0 && data.unlinked.length === 0)) return null;
  const flagged = data.lines.filter((line) => line.status !== "ok");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <E9Panel
        tone="amber"
        icon={ReceiptOutline}
        title="BOQ check"
        subtitle="What is on the tracker against what the BOQ allows"
        meta={flagged.length ? `${flagged.length} over BOQ` : "All within BOQ"}
        className="lg:col-span-2"
        action={<SmallButton onClick={() => onOpen("boq")}>Open BOQ</SmallButton>}
      >
        {flagged.length === 0 && data.totals.unlinked_items === 0 ? (
          <p className="px-5 py-6 text-center text-body-sm-regular text-success-primary">
            ✓ Nothing on the tracker crosses the BOQ.
          </p>
        ) : (
          <ul className="divide-y divide-subtle">
            {flagged.map((line) => (
              <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                <span className="text-body-xs-regular text-secondary">
                  <span className="font-semibold text-primary">{line.line_no}</span> {line.description} · allowed{" "}
                  {fmt(line.allowed)}, on tracker {fmt(line.on_tracker)} →{" "}
                  <span className="font-semibold text-warning-primary">
                    +{fmt(line.extra)} {unitText(line.unit)}
                  </span>
                </span>
                <StatusPill status={line.status} />
              </li>
            ))}
            {data.totals.unlinked_items > 0 && (
              <li className="px-5 py-2.5 text-body-xs-semibold text-danger-primary">
                {data.totals.unlinked_items} tracker row(s) have a BOQ No. that is blank or not on the BOQ.
              </li>
            )}
          </ul>
        )}
      </E9Panel>
      <E9Panel
        tone="green"
        icon={BillingsOutline}
        title="Billing"
        subtitle="Where each bill has got to"
        meta={data.bills.length ? `${data.bills.length} ${data.bills.length === 1 ? "bill" : "bills"}` : undefined}
        action={<SmallButton onClick={() => onOpen("billing")}>Open billing</SmallButton>}
      >
        {data.bills.length === 0 ? (
          <p className="px-5 py-6 text-center text-body-sm-regular text-tertiary">No bills yet.</p>
        ) : (
          <ul className="divide-y divide-subtle">
            {data.bills.map((bill) => (
              <li key={bill.id} className="flex flex-col gap-2 px-5 py-3">
                <span className="text-body-xs-semibold text-primary">{bill.title}</span>
                <BillStepper stage={bill.stage} compact />
                <span className="text-body-2xs-regular text-tertiary">{bill.stage_text}</span>
              </li>
            ))}
          </ul>
        )}
      </E9Panel>
    </div>
  );
}
