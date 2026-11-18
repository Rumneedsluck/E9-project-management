/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS } from "@plane/constants";
// components
import { E9SidebarSection } from "@/components/e9/sidebar-section";
import { SidebarItemBase } from "./sidebar-item";

/** E9 sidebar: E9 pages, then Plane's Drafts and Your work (Home, Stickies and the Workspace menu are hidden). */
const PLANE_ITEMS = ["drafts", "your-work"] as const;

export const SidebarMenuItems = observer(function SidebarMenuItems() {
  const items = useMemo(
    () => PLANE_ITEMS.map((key) => WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS[key]).filter(Boolean),
    []
  );

  return (
    <>
      <E9SidebarSection />
      <div className="flex w-full flex-col gap-px border-t border-subtle pt-3">
        {items.map((item) => (
          <SidebarItemBase key={item.key} item={item} />
        ))}
      </div>
    </>
  );
});
