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
import { getStatusMeta } from "./constants";
import { getProgressPercent } from "./helpers";
import type { TE9Project } from "./types";
import { E9CertSteps, E9CodeTile } from "./ui";

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

  const animation = useRef<number | null>(null);
  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      const count = projects.length;
      if (!track || count === 0) return;
      const target = track.children[((index % count) + count) % count] as HTMLElement | undefined;
      if (!target) return;
      const to = target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2;
      if (reducedMotion()) {
        track.scrollLeft = to;
        return;
      }
      // own easing (fast start, soft landing) – smoother than the browser's smooth scroll
      if (animation.current) cancelAnimationFrame(animation.current);
      const from = track.scrollLeft;
      const start = performance.now();
      const duration = 750;
      track.style.scrollSnapType = "none";
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 4);
        track.scrollLeft = from + (to - from) * eased;
        if (t < 1) animation.current = requestAnimationFrame(step);
        else {
          animation.current = null;
          track.style.scrollSnapType = "";
        }
      };
      animation.current = requestAnimationFrame(step);
    },
    [projects.length]
  );

  // point at a side card and it glides to the centre (short pause so passing the mouse over doesn't jump)
  const glideTimer = useRef<number | null>(null);
  const cancelGlide = useCallback(() => {
    if (glideTimer.current) window.clearTimeout(glideTimer.current);
    glideTimer.current = null;
  }, []);
  const glideTo = useCallback(
    (index: number) => {
      cancelGlide();
      if (index === current) return;
      glideTimer.current = window.setTimeout(() => goTo(index), 220);
    },
    [cancelGlide, current, goTo]
  );
  useEffect(() => cancelGlide, [cancelGlide]);

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
                onMouseEnter={() => glideTo(index)}
                onMouseLeave={cancelGlide}
                className="group relative aspect-[16/9] w-[min(720px,78vw)] shrink-0 snap-center overflow-hidden shadow-raised-200 will-change-transform"
              >
                <div
                  className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-105"
                  style={{
                    background: "var(--e9-band)",
                  }}
                />
                <div aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: stage.color }} />
                <div className="absolute inset-0 flex flex-col justify-between p-5 text-white sm:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <E9CodeTile code={project.identifier} size="lg" inverse />
                    <span className="border border-white/30 px-3 py-1 text-body-2xs-semibold tracking-[0.14em] uppercase">
                      {stage.label}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-body-xs-semibold tracking-[0.18em] text-white/70 uppercase">
                      {[project.e9.city, project.e9.client_name].filter(Boolean).join(" · ") || project.identifier}
                    </span>
                    <span className="e9-display [font-size:clamp(1.6rem,3.4vw,2.8rem)] leading-none">
                      {project.name}
                    </span>
                    <span className="mt-3 h-[3px] w-full overflow-hidden bg-white/20">
                      <span
                        className="block h-full bg-[var(--brand-default)]"
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
          <E9CertSteps project={active} />
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
