# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models, transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, Project, ProjectMember, StateGroup, WorkspaceMember

from .models import E9ProjectProfile, E9ScopeItem
from .serializers import (
    ITEM_EDITABLE_FIELDS,
    PROFILE_FIELDS,
    E9ProjectProfileSerializer,
    E9ScopeItemSerializer,
    default_profile_data,
)
from .services import ensure_floors, item_code, record, record_changes, scope_map, snapshot


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
            is_new = profile._state.adding
            before = {} if is_new else snapshot(profile, PROFILE_FIELDS)
            profile.deleted_at = None
            serializer = E9ProjectProfileSerializer(profile, data=request.data, partial=True)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            serializer.save()
            if not is_new:
                changed = {field: getattr(profile, field) for field in serializer.validated_data}
                record_changes(project, request.user, "project", project.id, project.name, before, changed)

        data = _serialize_projects(Project.objects.filter(pk=project.id), request.user, slug)
        return Response(data[0], status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Tracker: scope items (one row per wall / glass panel / signage ...)
# ---------------------------------------------------------------------------


def _can_update_items(user, slug, project_id):
    """Project admins and members update the tracker; guests only view. Workspace admins always can."""
    return ProjectMember.objects.filter(
        member=user,
        workspace__slug=slug,
        project_id=project_id,
        role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
        is_active=True,
    ).exists() or _is_workspace_admin(user, slug)


MAX_ROWS_PER_ADD = 100


class E9ScopeItemListEndpoint(BaseAPIView):
    """List a project's tracker items, or add new rows to a scope sheet."""

    def _project(self, request, slug, project_id):
        return _visible_projects(request.user, slug).filter(pk=project_id).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = self._project(request, slug, project_id)
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        items = E9ScopeItem.objects.filter(project=project)
        scopes = scope_map(project)
        return Response(
            {
                "can_edit": _can_update_items(request.user, slug, project.id),
                "items": E9ScopeItemSerializer(items, many=True, context={"scopes": scopes}).data,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, project_id):
        project = self._project(request, slug, project_id)
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_update_items(request.user, slug, project.id):
            return Response({"error": "Guests can view the tracker but not change it."}, status=403)

        scope = request.data.get("scope")
        scopes = scope_map(project)
        if scope not in scopes or not scopes[scope].enabled:
            return Response({"scope": "Pick a scope that is switched on for this project."}, status=400)
        try:
            count = int(request.data.get("count", 1))
        except (TypeError, ValueError):
            count = 0
        if not 1 <= count <= MAX_ROWS_PER_ADD:
            return Response({"count": f"Add between 1 and {MAX_ROWS_PER_ADD} rows at a time."}, status=400)

        values = {key: value for key, value in request.data.items() if key not in ("scope", "count")}
        serializer = E9ScopeItemSerializer(data=values, context={"scope": scope})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Lock the project row so two people adding rows at once get different codes
            Project.objects.select_for_update().filter(pk=project.id).first()
            existing = E9ScopeItem.all_objects.filter(project=project, scope=scope)
            last_number = existing.aggregate(models.Max("item_number"))["item_number__max"] or 0
            last_order = existing.aggregate(models.Max("sort_order"))["sort_order__max"] or 0
            created = [
                E9ScopeItem.objects.create(
                    project=project,
                    workspace_id=project.workspace_id,
                    scope=scope,
                    item_number=last_number + index,
                    sort_order=last_order + index * 1000,
                    **serializer.validated_data,
                )
                for index in range(1, count + 1)
            ]
            codes = [item_code(item, scopes) for item in created]
            record(
                project,
                request.user,
                "item",
                "created",
                created[0].id if len(created) == 1 else None,
                codes[0] if len(codes) == 1 else f"{codes[0]}–{codes[-1]}",
                new=f"{len(created)} row(s) added to {scopes[scope].label}",
            )
            if serializer.validated_data.get("floor_area"):
                ensure_floors(project, [serializer.validated_data["floor_area"]], request.user)
        data = E9ScopeItemSerializer(created, many=True, context={"scopes": scopes}).data
        return Response(data, status=status.HTTP_201_CREATED)


class E9ScopeItemDetailEndpoint(BaseAPIView):
    """Update or remove one tracker row."""

    def _item(self, request, slug, project_id, item_id):
        project = _visible_projects(request.user, slug).filter(pk=project_id).first()
        if project is None:
            return None
        return E9ScopeItem.objects.filter(project=project, pk=item_id).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, project_id, item_id):
        item = self._item(request, slug, project_id, item_id)
        if item is None:
            return Response({"error": "Item not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_update_items(request.user, slug, project_id):
            return Response({"error": "Guests can view the tracker but not change it."}, status=403)
        scopes = scope_map(item.project)
        before = snapshot(item, ITEM_EDITABLE_FIELDS)
        serializer = E9ScopeItemSerializer(item, data=request.data, partial=True, context={"scopes": scopes})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            serializer.save()
            changed = {field: getattr(item, field) for field in serializer.validated_data if field != "sort_order"}
            record_changes(item.project, request.user, "item", item.id, item_code(item, scopes), before, changed)
            if "floor_area" in serializer.validated_data:
                ensure_floors(item.project, [item.floor_area], request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug, project_id, item_id):
        item = self._item(request, slug, project_id, item_id)
        if item is None:
            return Response({"error": "Item not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_update_items(request.user, slug, project_id):
            return Response({"error": "Guests can view the tracker but not change it."}, status=403)
        code = item_code(item, scope_map(item.project))
        details = " – ".join(part for part in (item.floor_area, item.description) if part)
        with transaction.atomic():
            item.delete()
            record(item.project, request.user, "item", "deleted", item.id, code, old=details or code)
        return Response(status=status.HTTP_204_NO_CONTENT)
