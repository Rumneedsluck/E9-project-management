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
import { E9Home } from "@/components/e9/home";

function E9HomePage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  return (
    <>
      <PageHead title={`Home - ${E9_BRAND.name}`} />
      <E9Header workspaceSlug={slug} section="home" />
      <ContentWrapper>
        <E9Home workspaceSlug={slug} />
      </ContentWrapper>
    </>
  );
}

export default observer(E9HomePage);
