/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Home: a calm cover page. E9 Creative, a greeting, four doors (Projects, Dashboard,
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
import { useUser } from "@/hooks/store/user";
import { E9Announcements } from "./announcements";
import { E9_BRAND, E9LogoMark } from "./brand";
import { useCanCreateE9Project } from "./hooks";
import { Reveal, RevealText } from "./motion";
import { E9PageBody } from "./ui";

const greeting = (hour: number) => {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

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
  const { data: currentUser } = useUser();
  const canCreate = useCanCreateE9Project(workspaceSlug);
  const now = useNow();
  const hour = now
    ? Number(now.toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }))
    : 9;

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
      <section className="relative flex min-h-[36vh] flex-col justify-center gap-8 py-6">
        <div aria-hidden className="e9-dot-grid pointer-events-none absolute inset-x-0 top-0 h-full" />
        <div className="relative flex flex-col gap-6">
          <Reveal>
            <E9LogoMark className="size-16 rounded-2xl ring-1 ring-white/10 sm:size-20" />
          </Reveal>
          <h1 className="text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.035em] text-primary">
            <RevealText text={E9_BRAND.name} />
          </h1>
          <Reveal delay={0.15}>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-md-regular text-tertiary">
              <span className="text-primary">
                {greeting(hour)}
                {currentUser?.first_name ? `, ${currentUser.first_name}` : ""}
              </span>
              <span aria-hidden className="h-3 w-px bg-layer-3" />
              <span className="tabular-nums">
                {now
                  ? `${renderFormattedDate(now, "EEEE, dd MMMM")} · ${now.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })} IST`
                  : ""}
              </span>
            </p>
          </Reveal>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
