/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * "Ring" view of the projects: a draggable 3D ring of project cards (React Bits CircularCarousel).
 * The carousel shows pictures, so every project is drawn as a small SVG card picture right here
 * (nothing is downloaded): paper card, stage stripe, name, progress.
 */

import { useMemo } from "react";
import { useAppRouter } from "@/hooks/use-app-router";
import { getStatusMeta } from "./constants";
import { describeDeadline, getProgressPercent } from "./helpers";
import type { TE9Project } from "./types";
import CircularCarousel from "./vendor/circular-carousel";
import type { TCarouselItem } from "./vendor/circular-carousel";

const CARD_W = 800;
const CARD_H = 600;

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Break a name into at most 3 lines of about `limit` characters. */
const wrapName = (name: string, limit = 17): string[] => {
  const lines: string[] = [];
  let line = "";
  for (const word of name.split(/\s+/)) {
    if (line && `${line} ${word}`.length > limit) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
};

const cardPicture = (project: TE9Project): string => {
  const stage = getStatusMeta(project.e9.status);
  const percent = getProgressPercent(project);
  const lines = wrapName(project.name);
  const place = [project.e9.city, project.e9.client_name].filter(Boolean).join(" · ").toUpperCase().slice(0, 34);
  const titleTop = 330 - (lines.length - 1) * 30;
  const title = lines
    .map(
      (text, index) =>
        `<text x="48" y="${titleTop + index * 64}" font-family="Georgia,'Times New Roman',serif" font-size="58" font-weight="700" fill="#1B1512">${escapeXml(text)}</text>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<rect width="${CARD_W}" height="${CARD_H}" fill="#F2E9D8"/>
<rect width="${CARD_W}" height="16" fill="${stage.color}"/>
<text x="470" y="470" font-family="Georgia,serif" font-size="360" font-weight="700" fill="#DA1E26" opacity="0.13">E9</text>
<rect x="48" y="56" width="${stage.label.length * 15 + 40}" height="40" fill="${stage.color}"/>
<text x="68" y="83" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="3" fill="#FFFFFF">${escapeXml(stage.label.toUpperCase())}</text>
<text x="48" y="${titleTop - 44}" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="3" fill="#1B1512" opacity="0.65">${escapeXml(place || project.identifier)}</text>
${title}
<rect x="48" y="478" width="704" height="6" fill="#1B1512" opacity="0.15"/>
<rect x="48" y="478" width="${Math.round((704 * Math.max(0, Math.min(100, percent))) / 100)}" height="6" fill="#DA1E26"/>
<text x="48" y="535" font-family="'Courier New',monospace" font-size="26" fill="#1B1512" opacity="0.8">${percent}% done · ${escapeXml(describeDeadline(project))}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export function E9RingShowcase({ projects, workspaceSlug }: { projects: TE9Project[]; workspaceSlug: string }) {
  const router = useAppRouter();
  const items: TCarouselItem[] = useMemo(
    () =>
      projects.map((project) => ({
        src: cardPicture(project),
        alt: `${project.name}, ${getStatusMeta(project.e9.status).label}`,
        title: project.name,
        subtitle: getStatusMeta(project.e9.status).label,
      })),
    [projects]
  );

  // a ring of fewer than 3 cards looks broken: the caller falls back to the slider
  if (projects.length < 3) return null;

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-lg bg-[var(--e9-paper)] text-primary">
      <CircularCarousel
        items={items}
        preset="cylinder"
        intro="rise"
        cardWidth={300}
        aspectRatio={CARD_W / CARD_H}
        gap={24}
        speed={9}
        cornerRadius={4}
        fadeColor="var(--e9-paper)"
        depthFade={0.7}
        captions
        onItemClick={(_item, index) => {
          const project = projects[index];
          if (project) router.push(`/${workspaceSlug}/e9/projects/${project.id}`);
        }}
      />
    </div>
  );
}
