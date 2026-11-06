/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Big sliding strip of sites, bent like a curved screen.
 * Each panel tilts away the further it is from the middle, so the strip
 * looks curved while you scroll. Arrows, a 01 / 05 counter and slow auto-play.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeftOutline, ChevronRightOutline } from "@makeplane/propel/icons";
import { Logo } from "@plane/blocks/emoji-icon-picker";
import { getStatusMeta } from "./constants";
import { getProgressPercent } from "./helpers";
import { E9LogoMark } from "./brand";
import type { TE9Project } from "./types";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const pad = (value: number) => String(value).padStart(2, "0");

export function E9Showcase({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  /** bend every panel by its distance from the middle of the strip */
  const bend = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const middle = track.scrollLeft + track.clientWidth / 2;
    let nearest = 0;
    let nearestGap = Infinity;
    [...track.children].forEach((child, index) => {
      const slide = child as HTMLElement;
      const centre = slide.offsetLeft + slide.offsetWidth / 2;
      const offset = (centre - middle) / track.clientWidth; // -1 … 1
      if (Math.abs(offset) < nearestGap) {
        nearestGap = Math.abs(offset);
        nearest = index;
      }
      if (reducedMotion()) return;
      const clamped = Math.max(-1, Math.min(1, offset));
      slide.style.transform = `perspective(1400px) rotateY(${clamped * -28}deg) scale(${1 - Math.abs(clamped) * 0.08})`;
      slide.style.transformOrigin = clamped > 0 ? "left center" : "right center";
    });
    setCurrent(nearest);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    bend();
    track.addEventListener("scroll", bend, { passive: true });
    window.addEventListener("resize", bend);
    return () => {
      track.removeEventListener("scroll", bend);
      window.removeEventListener("resize", bend);
    };
  }, [bend, projects.length]);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      const count = projects.length;
      if (!track || count === 0) return;
      const target = track.children[((index % count) + count) % count] as HTMLElement | undefined;
      if (!target) return;
      track.scrollTo({
        left: target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2,
        behavior: reducedMotion() ? "auto" : "smooth",
      });
    },
    [projects.length]
  );

  // slow auto-play; stops while you point at it
  useEffect(() => {
    if (paused || projects.length < 2 || reducedMotion()) return;
    const timer = window.setInterval(() => goTo(current + 1), 5000);
    return () => window.clearInterval(timer);
  }, [paused, current, goTo, projects.length]);

  if (projects.length === 0) return null;
  const active = projects[current] ?? projects[0];

  return (
    <section
      className="flex flex-col gap-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Sites"
    >
      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
        <div
          ref={trackRef}
          className="e9-showcase flex snap-x snap-mandatory gap-4 overflow-x-auto px-[calc(50%-min(360px,39vw))] py-4"
        >
          {projects.map((project, index) => {
            const stage = getStatusMeta(project.e9.status);
            return (
              <Link
                key={project.id}
                href={`/${workspaceSlug}/e9/projects/${project.id}`}
                aria-label={`${project.name}, ${stage.label}`}
                aria-current={index === current ? "true" : undefined}
                className="group relative aspect-[16/9] w-[min(720px,78vw)] shrink-0 snap-center overflow-hidden rounded-2xl shadow-raised-200 will-change-transform"
              >
                <div
                  className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-105"
                  style={{
                    background: `radial-gradient(90% 120% at 15% 10%, ${stage.color} 0%, transparent 55%), radial-gradient(80% 90% at 95% 100%, ${stage.color}88 0%, transparent 60%), linear-gradient(135deg, #0b0b0b 0%, #1d1d21 100%)`,
                  }}
                />
                <div aria-hidden className="e9-dot-grid absolute inset-0 opacity-40" />
                <E9LogoMark className="absolute -right-6 -bottom-6 size-48 opacity-10 sm:size-64" />
                <div className="absolute inset-0 flex flex-col justify-between p-5 text-white sm:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-12 place-items-center rounded-xl bg-white/95 shadow-raised-100">
                      <Logo logo={project.logo_props} size={24} />
                    </span>
                    <span className="rounded-full bg-black/40 px-3 py-1 text-body-2xs-semibold tracking-[0.12em] uppercase backdrop-blur">
                      {stage.label}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-body-xs-semibold tracking-[0.18em] text-white/70 uppercase">
                      {[project.e9.city, project.e9.client_name].filter(Boolean).join(" · ") || project.identifier}
                    </span>
                    <span className="text-[clamp(1.4rem,3.2vw,2.6rem)] leading-none font-semibold tracking-tight">
                      {project.name}
                    </span>
                    <span className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/20">
                      <span
                        className="block h-full rounded-full bg-white"
                        style={{ width: `${getProgressPercent(project)}%` }}
                      />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* caption row like an editorial portfolio */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-body-xs-semibold text-tertiary tabular-nums">
            {pad(current + 1)} / {pad(projects.length)}
          </span>
          <span key={active.id} className="e9-swap truncate text-h3-semibold tracking-tight text-primary">
            {active.name}
          </span>
        </div>
        {projects.length > 1 && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Previous site"
              onClick={() => goTo(current - 1)}
              className="grid size-10 place-items-center rounded-full border border-subtle bg-surface-1 text-primary transition-colors hover:bg-layer-1-hover"
            >
              <ChevronLeftOutline className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next site"
              onClick={() => goTo(current + 1)}
              className="grid size-10 place-items-center rounded-full bg-[var(--brand-default)] text-white transition-transform hover:scale-105"
            >
              <ChevronRightOutline className="size-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
