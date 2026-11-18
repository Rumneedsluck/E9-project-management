/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { KeyboardEvent } from "react";

/** The tab to move to for a key (left / right wrap around, Home / End jump), or null for any other key. */
export const nextTabIndex = (key: string, current: number, count: number): number | null => {
  if (count <= 0) return null;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
};

/**
 * Keyboard support for a row of tabs (put it on the role="tablist" element): arrow keys move to the next
 * or previous tab and open it, Home / End go to the first / last. Tabs use tabIndex 0 only when selected.
 */
export const onTabListKeyDown = (event: KeyboardEvent<HTMLElement>) => {
  const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')];
  const current = tabs.findIndex((tab) => tab === document.activeElement);
  if (current === -1) return;
  const target = nextTabIndex(event.key, current, tabs.length);
  if (target === null) return;
  event.preventDefault();
  tabs[target]?.focus();
  tabs[target]?.click();
};
