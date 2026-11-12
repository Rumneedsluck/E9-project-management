/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { BillingsOutline, DashboardsOutline, HomeOutline, ProjectsOutline } from "@makeplane/propel/icons";
import { ListItem, ListItemLabel } from "@makeplane/propel/components/list";
import { ListItemLink } from "@makeplane/propel/elements/list";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
// local
import { E9_BRAND, E9Text } from "./brand";

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

  return (
    <div className="flex w-full flex-col gap-px">
      <span className="px-2 pt-1 pb-1.5 text-body-xs-semibold whitespace-nowrap text-tertiary">
        <E9Text>{E9_BRAND.name}</E9Text>
      </span>
      {LINKS.map((link) => {
        const href = `/${workspaceSlug.toString()}/${link.path}`;
        const isActive = link.exact
          ? pathname === href || pathname === `${href}/`
          : pathname === href || pathname.startsWith(`${href}/`);
        const Icon = link.icon;
        return (
          <ListItem key={link.key} density="comfortable">
            <ListItemLink
              href={href}
              render={<Link href={href} />}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="size-4 flex-shrink-0" />
              <ListItemLabel>{link.label}</ListItemLabel>
            </ListItemLink>
          </ListItem>
        );
      })}
    </div>
  );
});
