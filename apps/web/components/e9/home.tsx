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
        className="group flex h-full flex-col gap-10 border-t-2 border-[var(--e9-ink)] pt-4 pb-2 outline-none focus-visible:bg-[var(--e9-hover)]"
      >
        <span className="flex items-center justify-between">
          <span className="e9-mono text-body-xs-semibold tracking-[0.14em] text-[var(--e9-brass)]">
            {String(index + 1).padStart(2, "0")}
          </span>
          <Icon className="size-5 text-tertiary transition-colors group-hover:text-accent-primary" />
        </span>
        <span className="flex flex-col gap-2">
          <span className="e9-display flex items-center gap-2 text-[28px] leading-none text-primary">
            {door.label}
            <ArrowNarrowRightOutline className="size-5 -translate-x-1 text-accent-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </span>
          <span className="max-w-[26ch] text-body-sm-regular text-tertiary">{door.hint}</span>
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
      <section className="flex min-h-[38vh] flex-col justify-between gap-12 py-4">
        <div className="flex items-start justify-between gap-6">
          <span className="e9-eyebrow">{E9_BRAND.productName}</span>
          <Reveal>
            <E9LogoMark className="size-14 rounded-lg sm:size-16" />
          </Reveal>
        </div>
        <div className="flex flex-col gap-5">
          <h1 className="e9-display [font-size:clamp(3.2rem,9vw,7.5rem)] leading-[0.95] text-primary">
            <RevealText text={greeting(hour)} />
            {currentUser?.first_name && (
              <span className="block [font-size:0.62em] text-[var(--e9-brass)] italic">{currentUser.first_name}.</span>
            )}
          </h1>
          <Reveal delay={0.15}>
            <p className="e9-mono flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm-regular text-tertiary">
              <span className="e9-eyebrow !text-tertiary">{E9_BRAND.name}</span>
              <span aria-hidden className="h-3 w-px bg-[var(--e9-grid)]" />
              <span>
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
