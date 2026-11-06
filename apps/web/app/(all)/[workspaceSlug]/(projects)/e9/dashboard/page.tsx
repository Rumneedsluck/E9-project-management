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
import { E9Dashboard } from "@/components/e9/dashboard";
import { E9Header } from "@/components/e9/header";

function E9DashboardPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  return (
    <>
      <PageHead title={`Dashboard - ${E9_BRAND.name}`} />
      <E9Header workspaceSlug={slug} section="dashboard" />
      <ContentWrapper>
        <E9Dashboard workspaceSlug={slug} />
      </ContentWrapper>
    </>
  );
}

export default observer(E9DashboardPage);
