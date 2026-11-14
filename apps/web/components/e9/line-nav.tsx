/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * The sliding-line menu (React Bits LineSidebar) in the E9 colours: lines and names slide toward the pointer
 * and light up red as it comes near. Used for the left menu and for the doors on the Home page.
 * Every row is a real link, so right-click, new tab and keyboard all keep working.
 */

import Link from "next/link";
import LineSidebar from "./vendor/line-sidebar";
// oxlint-disable-next-line import/no-unassigned-import -- stylesheet for the menu
import "./line-nav.css";

export type TLineNavItem = { label: string; href: string; hint?: string };

type Props = {
  items: TLineNavItem[];
  /** index of the page we are on (null = none) */
  activeIndex: number | null;
  size?: "compact" | "big";
  onNavigate?: () => void;
};

export function E9LineNav({ items, activeIndex, size = "compact", onNavigate }: Props) {
  const big = size === "big";
  return (
    <LineSidebar
      className={`e9-line-nav ${big ? "e9-line-nav--big" : "e9-line-nav--compact"}`}
      items={items}
      activeIndex={activeIndex}
      LinkComponent={Link}
      onItemClick={() => onNavigate?.()}
      accentColor="var(--brand-default)"
      textColor="var(--e9-ink-soft)"
      markerColor="var(--e9-grid)"
      showIndex={big}
      proximityRadius={big ? 130 : 56}
      maxShift={big ? 26 : 10}
      markerLength={big ? 72 : 18}
      tickScale={0.45}
      itemGap={big ? 26 : 2}
      fontSize={big ? 2.1 : 0.9}
      smoothing={110}
    />
  );
}
