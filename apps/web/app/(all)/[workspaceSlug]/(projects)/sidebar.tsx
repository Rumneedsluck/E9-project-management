/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";
import { SidebarMenuItems } from "@/components/workspace/sidebar/sidebar-menu-items";

/*
 * E9: the sidebar only carries E9's own pages plus Drafts and Your work.
 * Plane's "New work item" button, Stickies, Workspace menu, favourites and project list are
 * hidden here (not deleted) – their pages still work by link and from the workspace menu.
 */
export const AppSidebar = observer(function AppSidebar() {
  return (
    <SidebarWrapper title="Menu">
      <SidebarMenuItems />
    </SidebarWrapper>
  );
});
