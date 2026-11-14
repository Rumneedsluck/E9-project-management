/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { BillingsOutline, DashboardsOutline, HomeOutline, ProjectsOutline } from "@makeplane/propel/icons";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
// local
import { E9_BRAND, E9Text } from "./brand";
import { E9LineNav } from "./line-nav";

const LINKS = [
  { key: "home", label: "Home", path: "e9", icon: HomeOutline, exact: true },
  { key: "dashboard", label: "Dashboard", path: "e9/dashboard", icon: DashboardsOutline, exact: true },
  { key: "projects", label: "Projects", path: "e9/projects", icon: ProjectsOutline, exact: false },
  { key: "billing", label: "Billing", path: "e9/billing", icon: BillingsOutline, exact: true },
];

/** "E9 Operations" links shown at the top of Plane's sidebar. */
export const E9SidebarSection = observer(function E9SidebarSection() {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { toggleSidebar, isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();
  if (!workspaceSlug) return null;

  const onNavigate = () => {
    if (window.innerWidth < 768) toggleSidebar();
    if (isExtendedSidebarOpened) toggleExtendedSidebar(false);
  };

  const items = LINKS.map((link) => ({ label: link.label, href: `/${workspaceSlug.toString()}/${link.path}` }));
  const activeIndex = LINKS.findIndex((link, index) => {
    const href = items[index].href;
    return link.exact
      ? pathname === href || pathname === `${href}/`
      : pathname === href || pathname.startsWith(`${href}/`);
  });

  return (
    <div className="flex w-full flex-col gap-px">
      <span className="px-2 pt-1 pb-1.5 text-body-xs-semibold whitespace-nowrap text-tertiary">
        <E9Text>{E9_BRAND.name}</E9Text>
      </span>
      {/* lines and names slide toward the pointer; every row is still a normal link */}
      <E9LineNav items={items} activeIndex={activeIndex === -1 ? null : activeIndex} onNavigate={onNavigate} />
    </div>
  );
});
