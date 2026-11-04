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
import { E9ProjectList } from "@/components/e9/project-list";

function E9ProjectsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  return (
    <>
      <PageHead title={`Projects - ${E9_BRAND.name}`} />
      <E9Header workspaceSlug={slug} section="projects" />
      <ContentWrapper>
        <E9ProjectList workspaceSlug={slug} />
      </ContentWrapper>
    </>
  );
}

export default observer(E9ProjectsPage);
