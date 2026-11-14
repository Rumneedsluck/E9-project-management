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
import { observer } from "mobx-react";
import { renderFormattedDate } from "@plane/utils";
import { useUser } from "@/hooks/store/user";
import { E9Announcements } from "./announcements";
import { E9_BRAND, E9LogoMark, E9Text } from "./brand";
import { useCanCreateE9Project } from "./hooks";
import { Reveal, RevealText } from "./motion";
import { E9LineNav } from "./line-nav";
import { E9SwarmBackdrop } from "./swarm-backdrop";
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

type TDoor = { href: string; label: string; hint: string };

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
    },
    {
      href: `/${workspaceSlug}/e9/dashboard`,
      label: "Dashboard",
      hint: "Stages, billing and what needs attention",
    },
    {
      href: `/${workspaceSlug}/e9/billing`,
      label: "Billing",
      hint: "Certified sites and where each bill stands",
    },
  ];
  if (canCreate) {
    doors.push({
      href: `/${workspaceSlug}/e9/projects/new`,
      label: "New project",
      hint: "Add an awarded site",
    });
  }

  return (
    <E9PageBody>
      <E9SwarmBackdrop className="min-h-[38vh]">
        <section className="flex min-h-[38vh] flex-col justify-between gap-12 py-4">
          <div className="flex items-start justify-between gap-6">
            <span className="e9-eyebrow">
              <E9Text>{E9_BRAND.productName}</E9Text>
            </span>
            <Reveal>
              <E9LogoMark className="size-14 rounded-lg sm:size-16" />
            </Reveal>
          </div>
          <div className="flex flex-col gap-5">
            <h1 className="e9-display [font-size:clamp(3.2rem,9vw,7.5rem)] leading-[0.95] text-primary">
              <RevealText text={greeting(hour)} />
              {currentUser?.first_name && (
                <span className="block [font-size:0.62em] text-[var(--e9-brass)] italic">
                  {currentUser.first_name}.
                </span>
              )}
            </h1>
            <Reveal delay={0.15}>
              <p className="e9-mono flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm-regular text-tertiary">
                <span className="e9-eyebrow !text-tertiary">
                  <E9Text>{E9_BRAND.name}</E9Text>
                </span>
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
      </E9SwarmBackdrop>

      <Reveal delay={0.25}>
        {/* the four doors as a sliding-line menu: lines and names slide toward the pointer */}
        <E9LineNav
          size="big"
          activeIndex={null}
          items={doors.map((door) => ({ label: door.label, href: door.href, hint: door.hint }))}
        />
      </Reveal>

      <Reveal delay={0.4}>
        <E9Announcements workspaceSlug={workspaceSlug} limit={3} />
      </Reveal>
    </E9PageBody>
  );
});
