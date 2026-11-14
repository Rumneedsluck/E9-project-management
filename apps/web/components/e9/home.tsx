/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Home: a calm cover page: E9 Operations, the date, four doors (Projects, Dashboard,
 * Billing, New project) and the team announcements. Numbers and charts live on the Dashboard,
 * sites live on Projects – nothing is repeated here.
 */

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import {
  AddOutline,
  ArrowNarrowRightOutline,
  BillingsOutline,
  DashboardsOutline,
  ProjectsOutline,
} from "@makeplane/propel/icons";
import { renderFormattedDate } from "@plane/utils";
import { E9Announcements } from "./announcements";
import { E9_BRAND, E9Text } from "./brand";
import { useCanCreateE9Project } from "./hooks";
import { Reveal } from "./motion";
import { E9PageBody } from "./ui";

/** India time, refreshed every 30 s. Rendered after mount so server and browser agree. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

type TDoor = { href: string; label: string; hint: string; icon: ComponentType<{ className?: string }> };

function Door({ door, index }: { door: TDoor; index: number }) {
  const Icon = door.icon;
  return (
    <Reveal delay={0.25 + index * 0.06}>
      <Link
        href={door.href}
        className="e9-lift group flex h-full flex-col justify-between gap-8 rounded-2xl border border-subtle bg-surface-1 p-5 hover:border-strong"
      >
        <span className="flex items-center justify-between">
          <span className="grid size-10 place-items-center rounded-xl bg-layer-2 text-primary transition-colors group-hover:bg-[#0B0B0B] group-hover:text-white">
            <Icon className="size-5" />
          </span>
          <ArrowNarrowRightOutline className="size-4 -translate-x-1 text-placeholder opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-h5-semibold tracking-tight text-primary">{door.label}</span>
          <span className="min-h-[2lh] text-body-xs-regular text-tertiary">{door.hint}</span>
        </span>
      </Link>
    </Reveal>
  );
}

export const E9Home = observer(function E9Home({ workspaceSlug }: { workspaceSlug: string }) {
  const canCreate = useCanCreateE9Project(workspaceSlug);
  const now = useNow();

  const doors: TDoor[] = [
    {
      href: `/${workspaceSlug}/e9/projects`,
      label: "Projects",
      hint: "Every site, its tracker, BOQ and JMC",
      icon: ProjectsOutline,
    },
    {
      href: `/${workspaceSlug}/e9/dashboard`,
      label: "Dashboard",
      hint: "Stages, billing and what needs attention",
      icon: DashboardsOutline,
    },
    {
      href: `/${workspaceSlug}/e9/billing`,
      label: "Billing",
      hint: "Certified sites and where each bill stands",
      icon: BillingsOutline,
    },
  ];
  if (canCreate) {
    doors.push({
      href: `/${workspaceSlug}/e9/projects/new`,
      label: "New project",
      hint: "Add an awarded site",
      icon: AddOutline,
    });
  }

  return (
    <E9PageBody>
      <section className="flex flex-col gap-3 py-4">
        <Reveal>
          <h1 className="e9-display [font-size:clamp(2.6rem,6vw,4.5rem)] leading-none text-primary">
            <E9Text>{E9_BRAND.productName}</E9Text>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="e9-mono text-body-sm-regular text-tertiary">
            {now
              ? `${renderFormattedDate(now, "EEEE, dd MMMM")} · ${now.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                })} IST`
              : ""}
          </p>
        </Reveal>
      </section>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {doors.map((door, index) => (
          <Door key={door.href} door={door} index={index} />
        ))}
      </div>

      <Reveal delay={0.4}>
        <E9Announcements workspaceSlug={workspaceSlug} limit={3} />
      </Reveal>
    </E9PageBody>
  );
});
