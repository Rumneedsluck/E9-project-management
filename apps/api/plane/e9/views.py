# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, Project, ProjectMember, StateGroup, WorkspaceMember

from .models import E9ProjectProfile
from .serializers import E9ProjectProfileSerializer, default_profile_data


def _is_workspace_admin(user, slug):
    return WorkspaceMember.objects.filter(
        member=user, workspace__slug=slug, role=ROLE.ADMIN.value, is_active=True
    ).exists()


def _visible_projects(user, slug):
    """Projects this user may see on the E9 screens.

    Workspace admins see every active project; everyone else sees the projects
    they are a member of. This matches who can open the project in Plane.
    """
    projects = Project.objects.filter(workspace__slug=slug, archived_at__isnull=True)
    if _is_workspace_admin(user, slug):
        return projects
    return projects.filter(
        project_projectmember__member=user,
        project_projectmember__is_active=True,
    ).distinct()


def _can_edit(user, slug, project_id):
    """Same rule Plane uses for editing a project: project admin or workspace admin."""
    return ProjectMember.objects.filter(
        member=user,
        workspace__slug=slug,
        project_id=project_id,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists() or _is_workspace_admin(user, slug)


def _serialize_projects(projects, user, slug):
    projects = list(projects.select_related("e9_profile"))
    project_ids = [project.id for project in projects]

    members = {}
    for project_id, member_id in ProjectMember.objects.filter(
        project_id__in=project_ids, is_active=True, member__is_bot=False
    ).values_list("project_id", "member_id"):
        members.setdefault(project_id, []).append(str(member_id))

    work_items = {
        row["project_id"]: row
        for row in Issue.issue_objects.filter(project_id__in=project_ids)
        .values("project_id")
        .annotate(
            total=Count("id"),
            completed=Count("id", filter=Q(state__group=StateGroup.COMPLETED.value)),
        )
    }

    editable_ids = set()
    if _is_workspace_admin(user, slug):
        editable_ids = set(project_ids)
    else:
        editable_ids = set(
            ProjectMember.objects.filter(
                project_id__in=project_ids, member=user, role=ROLE.ADMIN.value, is_active=True
            ).values_list("project_id", flat=True)
        )

    results = []
    for project in projects:
        profile = getattr(project, "e9_profile", None)
        if profile is not None and profile.deleted_at is not None:
            profile = None
        counts = work_items.get(project.id, {})
        results.append(
            {
                "id": str(project.id),
                "name": project.name,
                "identifier": project.identifier,
                "description": project.description,
                "logo_props": project.logo_props,
                "project_lead": str(project.project_lead_id) if project.project_lead_id else None,
                "member_ids": members.get(project.id, []),
                "created_at": project.created_at,
                "can_edit": project.id in editable_ids,
                "work_items": {
                    "total": counts.get("total", 0),
                    "completed": counts.get("completed", 0),
                },
                "e9": E9ProjectProfileSerializer(profile).data if profile else default_profile_data(),
            }
        )
    return results


class E9ProjectListEndpoint(BaseAPIView):
    """List E9 projects (Plane projects plus their E9 profile) for the dashboard and project list."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        projects = _visible_projects(request.user, slug)
        return Response(_serialize_projects(projects, request.user, slug), status=status.HTTP_200_OK)


class E9ProjectDetailEndpoint(BaseAPIView):
    """Read one E9 project, or create/update its E9 profile."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, project_id):
        projects = _visible_projects(request.user, slug).filter(pk=project_id)
        data = _serialize_projects(projects, request.user, slug)
        if not data:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(data[0], status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug, archived_at__isnull=True).first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_edit(request.user, slug, project.id):
            return Response(
                {"error": "Only the project's admins or workspace admins can edit this project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            # all_objects also finds a profile that was soft-deleted with its project, so it can be revived
            profile = E9ProjectProfile.all_objects.select_for_update().filter(project=project).first()
            if profile is None:
                profile = E9ProjectProfile(project=project, workspace_id=project.workspace_id)
            profile.deleted_at = None
            serializer = E9ProjectProfileSerializer(profile, data=request.data, partial=True)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            serializer.save()

        data = _serialize_projects(Project.objects.filter(pk=project.id), request.user, slug)
        return Response(data[0], status=status.HTTP_200_OK)
