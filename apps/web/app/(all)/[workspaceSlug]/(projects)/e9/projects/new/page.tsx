/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { E9_BRAND } from "@/components/e9/brand";
import { E9Header } from "@/components/e9/header";
import { useCanCreateE9Project } from "@/components/e9/hooks";
import { E9ProjectForm } from "@/components/e9/project-form";
import { E9ErrorState } from "@/components/e9/states";
import { E9PageBody } from "@/components/e9/ui";

function E9NewProjectPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const canCreate = useCanCreateE9Project(slug);
  return (
    <>
      <PageHead title={`New project - ${E9_BRAND.name}`} />
      <E9Header workspaceSlug={slug} section="projects" trail={[{ label: "New project" }]} />
      <ContentWrapper>
        {canCreate ? (
          <E9ProjectForm workspaceSlug={slug} />
        ) : (
          <E9PageBody>
            <E9ErrorState message="Only workspace admins and members can create projects. Ask your E9 admin for access." />
          </E9PageBody>
        )}
      </ContentWrapper>
    </>
  );
}

export default observer(E9NewProjectPage);
