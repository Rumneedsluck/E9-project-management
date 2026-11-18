/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Maths for the tick-ring pie on a project's Overview: the ring is made of many thin ticks,
 * shared out between the scopes by how big each scope is. Kept free of React so it can be tested.
 */

export type TRingSector = { key: string; value: number };
export type TRingTick = { index: number; angle: number; sector: number };

/** Ticks drawn round the full ring (one is left empty after each scope as a small gap). */
export const RING_TICKS = 120;

/** How many ticks each sector gets: in proportion to its value, at least one for any scope with work. */
export function allocateTicks(sectors: TRingSector[], total = RING_TICKS): number[] {
  const live = sectors.map((sector) => Math.max(0, sector.value));
  const sum = live.reduce((acc, value) => acc + value, 0);
  const used = live.filter((value) => value > 0).length;
  if (sum === 0) return live.map(() => 0);
  const available = total - (used > 1 ? used : 0);
  const exact = live.map((value) => (value / sum) * available);
  const counts = exact.map((share, index) => (live[index] > 0 ? Math.max(1, Math.floor(share)) : 0));
  let left = available - counts.reduce((acc, count) => acc + count, 0);
  // hand out what is left to the biggest remainders, take back from the biggest sectors if over
  const byRemainder = exact
    .map((share, index) => ({ index, rest: share - Math.floor(share) }))
    .filter(({ index }) => live[index] > 0)
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array made just above
    .sort((a, b) => b.rest - a.rest);
  for (let step = 0; left > 0 && byRemainder.length > 0; step += 1) {
    counts[byRemainder[step % byRemainder.length].index] += 1;
    left -= 1;
  }
  while (left < 0) {
    const biggest = counts.indexOf(Math.max(...counts));
    if (counts[biggest] <= 1) break;
    counts[biggest] -= 1;
    left += 1;
  }
  return counts;
}

/** Every tick round the ring with its angle (0° = top, clockwise) and the sector it belongs to. */
export function ringTicks(sectors: TRingSector[], total = RING_TICKS): TRingTick[] {
  const counts = allocateTicks(sectors, total);
  const gap = counts.filter((count) => count > 0).length > 1;
  const ticks: TRingTick[] = [];
  let position = 0;
  counts.forEach((count, sector) => {
    if (count === 0) return;
    for (let tick = 0; tick < count; tick += 1) {
      ticks.push({ index: position, angle: (position / total) * 360, sector });
      position += 1;
    }
    if (gap) position += 1;
  });
  return ticks;
}
