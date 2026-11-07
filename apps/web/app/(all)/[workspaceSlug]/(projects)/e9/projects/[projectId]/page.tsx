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
import { useE9Project } from "@/components/e9/hooks";
import { E9ProjectDetail } from "@/components/e9/project-detail";

function E9ProjectDetailPage() {
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const id = projectId?.toString() ?? "";
  const { data: project } = useE9Project(slug, id);
  return (
    <>
      <PageHead title={`${project?.name ?? "Project"} - ${E9_BRAND.name}`} />
      <E9Header workspaceSlug={slug} section="projects" trail={[{ label: project?.name ?? "Project" }]} />
      <ContentWrapper>
        <E9ProjectDetail workspaceSlug={slug} projectId={id} />
      </ContentWrapper>
    </>
  );
}

export default observer(E9ProjectDetailPage);
