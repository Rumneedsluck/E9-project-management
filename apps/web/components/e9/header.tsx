/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { BillingsOutline, DashboardsOutline, ProjectsOutline } from "@makeplane/propel/icons";
import { Breadcrumbs } from "@plane/blocks/breadcrumb";
import { Header } from "@plane/blocks/layout";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";

type TCrumb = { label: string; href?: string };

type Props = {
  workspaceSlug: string;
  /** "dashboard" or "projects": decides the first breadcrumb */
  section: "dashboard" | "projects" | "summary";
  /** Extra breadcrumbs after the section, e.g. the project name */
  trail?: TCrumb[];
};

/** Top bar for every E9 page (breadcrumbs). Uses Plane's own header so mobile menus keep working. */
export function E9Header({ workspaceSlug, section, trail = [] }: Props) {
  const root =
    section === "dashboard"
      ? {
          label: "Dashboard",
          href: `/${workspaceSlug}/e9`,
          icon: <DashboardsOutline className="size-4 text-tertiary" />,
        }
      : section === "summary"
        ? {
            label: "Extra & Billing",
            href: `/${workspaceSlug}/e9/summary`,
            icon: <BillingsOutline className="size-4 text-tertiary" />,
          }
        : {
            label: "E9 Projects",
            href: `/${workspaceSlug}/e9/projects`,
            icon: <ProjectsOutline className="size-4 text-tertiary" />,
          };
  return (
    <AppHeader
      header={
        <Header>
          <Header.LeftItem>
            <Breadcrumbs>
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink label={root.label} href={trail.length ? root.href : undefined} icon={root.icon} />
                }
              />
              {trail.map((crumb) => (
                <Breadcrumbs.Item
                  key={crumb.label}
                  component={<BreadcrumbLink label={crumb.label} href={crumb.href} />}
                />
              ))}
            </Breadcrumbs>
          </Header.LeftItem>
        </Header>
      }
    />
  );
}
