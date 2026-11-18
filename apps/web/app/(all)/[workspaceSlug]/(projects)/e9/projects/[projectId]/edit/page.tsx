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
import { E9ProjectForm } from "@/components/e9/project-form";
import { E9ErrorState, E9LoadingState } from "@/components/e9/states";
import { E9PageBody } from "@/components/e9/ui";

function E9EditProjectPage() {
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const id = projectId?.toString() ?? "";
  const { data: project, error, isLoading } = useE9Project(slug, id);

  let content;
  if (isLoading && !project) content = <E9LoadingState />;
  else if (error || !project) content = <E9ErrorState message="This project could not be found." />;
  else if (!project.can_edit)
    content = (
      <E9ErrorState message="Only the project's coordinator, project admins and workspace admins can edit this project." />
    );

  return (
    <>
      <PageHead title={`Edit ${project?.name ?? "project"} - ${E9_BRAND.name}`} />
      <E9Header
        workspaceSlug={slug}
        section="projects"
        trail={[{ label: project?.name ?? "Project", href: `/${slug}/e9/projects/${id}` }, { label: "Edit" }]}
      />
      <ContentWrapper>
        {content ? (
          <E9PageBody>{content}</E9PageBody>
        ) : (
          // key: re-create the form when a different project loads
          <E9ProjectForm key={project!.id} workspaceSlug={slug} project={project} />
        )}
      </ContentWrapper>
    </>
  );
}

export default observer(E9EditProjectPage);
