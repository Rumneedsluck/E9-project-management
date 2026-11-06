/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { ArrowNarrowRightOutline } from "@makeplane/propel/icons";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { cn, renderFormattedDate } from "@plane/utils";
import { getStatusMeta } from "./constants";
import { cityName, groupByCity } from "./cities";
import type { TCity } from "./cities";
import { sortProjects, summarizeProjects } from "./helpers";
import { useE9Projects } from "./hooks";
import { CountUp, Reveal, RevealText } from "./motion";
import { E9ErrorState, E9LoadingState } from "./states";
import { E9Showcase } from "./showcase";
import { E9DeadlineText, E9PageBody } from "./ui";

/** Live clock (India time) for the top of Home. */
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!now) return null;
  return (
    <span className="text-body-xs-semibold text-tertiary tabular-nums">
      {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST ·{" "}
      {renderFormattedDate(now, "EEE dd MMM")}
    </span>
  );
}

/** Endless strip of city names — pauses when you point at it. */
function CityMarquee({ cities }: { cities: TCity[] }) {
  if (cities.length === 0) return null;
  const items = cities.map(
    (city) => `${city.name.toUpperCase()} — ${city.active.length} SITE${city.active.length === 1 ? "" : "S"}`
  );
  const strip = [...items, ...items, ...items, ...items];
  return (
    <div
      className="e9-marquee relative -mx-4 overflow-hidden border-y border-subtle py-3 sm:-mx-6 lg:-mx-8"
      aria-hidden
    >
      <div className="e9-marquee-track flex w-max gap-10 pr-10">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-10">
            {strip.map((text, index) => (
              <span
                // oxlint-disable-next-line react/no-array-index-key -- repeated decorative text
                key={`${copy}-${index}`}
                className="flex items-center gap-10 text-body-sm-semibold tracking-[0.18em]"
              >
                <span className={index % 2 ? "text-tertiary" : "text-primary"}>{text}</span>
                <span className="size-1.5 rounded-full bg-[var(--brand-default)]" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CityCard({ city, workspaceSlug, index }: { city: TCity; workspaceSlug: string; index: number }) {
  const next = city.active.find((project) => project.e9.deadline);
  return (
    <Reveal delay={Math.min(index, 6) * 0.06}>
      <article className="e9-lift group flex h-full flex-col gap-5 rounded-2xl border border-subtle bg-surface-1 p-5 hover:border-strong">
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-body-2xs-semibold tracking-[0.18em] text-tertiary uppercase">City</span>
            <h3 className="text-h4-semibold tracking-tight text-primary">{city.name}</h3>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-h3-semibold leading-none text-primary tabular-nums">
              <CountUp value={city.active.length} />
            </span>
            <span className="text-body-2xs-medium text-tertiary">active site{city.active.length === 1 ? "" : "s"}</span>
          </div>
        </header>

        {/* one segment per site, coloured by its stage */}
        <div className="flex h-1.5 gap-1 overflow-hidden rounded-full">
          {city.active.map((project) => (
            <span
              key={project.id}
              className="e9-grow h-full flex-1 rounded-full"
              style={{ backgroundColor: getStatusMeta(project.e9.status).color }}
              title={`${project.name} · ${getStatusMeta(project.e9.status).label}`}
            />
          ))}
        </div>

        <ul className="flex flex-col divide-y divide-subtle">
          {city.active.slice(0, 4).map((project) => {
            const stage = getStatusMeta(project.e9.status);
            return (
              <li key={project.id}>
                <Link
                  href={`/${workspaceSlug}/e9/projects/${project.id}`}
                  className="group/row flex items-center gap-3 py-2.5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-layer-2">
                    <Logo logo={project.logo_props} size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="e9-link truncate text-body-sm-semibold text-primary">{project.name}</span>
                    <span className="flex items-center gap-1.5 text-body-2xs-medium text-tertiary">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      {stage.label}
                    </span>
                  </span>
                  <E9DeadlineText project={project} className="shrink-0 text-body-2xs-semibold" />
                </Link>
              </li>
            );
          })}
        </ul>
        {city.active.length > 4 && (
          <span className="-mt-3 text-body-2xs-medium text-tertiary">+{city.active.length - 4} more</span>
        )}

        <footer className="mt-auto flex items-center justify-between gap-2 border-t border-subtle pt-3 text-body-xs-regular">
          <span className="text-tertiary">
            {next ? (
              <>
                Next handover{" "}
                <span className="font-semibold text-primary">{renderFormattedDate(next.e9.deadline)}</span>
              </>
            ) : (
              "No handover dates yet"
            )}
          </span>
          {city.overdue > 0 ? (
            <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-body-2xs-semibold text-danger-primary">
              {city.overdue} overdue
            </span>
          ) : (
            <span className="text-body-2xs-semibold text-success-primary">On track</span>
          )}
        </footer>
      </article>
    </Reveal>
  );
}

export const E9Home = observer(function E9Home({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: projects, error, isLoading, mutate } = useE9Projects(workspaceSlug);
  const cities = useMemo(() => groupByCity(projects ?? []), [projects]);
  const summary = useMemo(() => summarizeProjects(projects ?? []), [projects]);
  const upcoming = useMemo(
    () =>
      sortProjects(
        (projects ?? []).filter((project) => project.e9.deadline && project.e9.status !== "completed"),
        "deadline"
      ).slice(0, 6),
    [projects]
  );

  return (
    <E9PageBody>
      {/* hero */}
      <section className="relative flex flex-col gap-6 pt-2">
        <div aria-hidden className="e9-dot-grid pointer-events-none absolute inset-x-0 -top-6 h-64" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-body-xs-semibold tracking-[0.18em] text-accent-primary uppercase">
            <span className="e9-live-dot size-2 rounded-full bg-[var(--brand-default)]" />
            E9 Operations · Live
          </span>
          <LiveClock />
        </div>
        <h1 className="relative max-w-4xl text-[clamp(2.4rem,6vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.03em] text-primary">
          <RevealText text="Every site, every city." />
        </h1>
        <Reveal delay={0.25} className="relative">
          <p className="max-w-2xl text-body-md-regular text-tertiary">
            <span className="font-semibold text-primary">
              <CountUp value={summary.active} /> active sites
            </span>{" "}
            across <span className="font-semibold text-primary">{cities.length}</span>{" "}
            {cities.length === 1 ? "city" : "cities"} ·{" "}
            <span className={cn(summary.overdue > 0 && "font-semibold text-danger-primary")}>
              {summary.overdue} overdue
            </span>{" "}
            · {summary.dueSoon} due this week
          </p>
        </Reveal>
      </section>

      {isLoading && !projects ? (
        <E9LoadingState />
      ) : error ? (
        <E9ErrorState onRetry={() => mutate()} />
      ) : (
        <>
          <E9Showcase
            projects={sortProjects(
              (projects ?? []).filter((project) => project.e9.status !== "completed"),
              "deadline"
            )}
            workspaceSlug={workspaceSlug}
          />
          <CityMarquee cities={cities} />

          {cities.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-strong px-6 py-14 text-center text-body-sm-regular text-tertiary">
              No active sites yet. Add a project with its city and it shows up here.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cities.map((city, index) => (
                <CityCard key={city.name} city={city} workspaceSlug={workspaceSlug} index={index} />
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <section className="flex flex-col gap-4">
              <Reveal className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-body-xs-semibold tracking-[0.14em] text-accent-primary uppercase">
                    Coming up
                  </span>
                  <h2 className="text-h4-semibold tracking-tight text-primary">Next handovers</h2>
                </div>
                <Link
                  href={`/${workspaceSlug}/e9/dashboard`}
                  className="group inline-flex items-center gap-1 text-body-sm-semibold text-accent-primary"
                >
                  Open the dashboard
                  <ArrowNarrowRightOutline className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Reveal>
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((project, index) => (
                  <Reveal key={project.id} delay={index * 0.05} as="li">
                    <Link
                      href={`/${workspaceSlug}/e9/projects/${project.id}`}
                      className="e9-lift flex items-center gap-4 rounded-xl border border-subtle bg-surface-1 p-4 hover:border-strong"
                    >
                      <span className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-layer-2 py-1.5">
                        <span className="text-body-2xs-semibold text-tertiary uppercase">
                          {renderFormattedDate(project.e9.deadline, "MMM")}
                        </span>
                        <span className="text-h5-semibold leading-none text-primary tabular-nums">
                          {renderFormattedDate(project.e9.deadline, "dd")}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="e9-link truncate text-body-sm-semibold text-primary">{project.name}</span>
                        <span className="truncate text-body-2xs-regular text-tertiary">
                          {project.e9.city ? cityName(project.e9.city) : "No city"} ·{" "}
                          {getStatusMeta(project.e9.status).label}
                        </span>
                        <E9DeadlineText project={project} className="text-body-2xs-semibold" />
                      </span>
                    </Link>
                  </Reveal>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </E9PageBody>
  );
});
