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

from . import certification, tracker
from .models import E9ProjectProfile, E9ProjectScope, E9ScopeItem
from .serializers import (
    ITEM_EDITABLE_FIELDS,
    PROFILE_FIELDS,
    E9ProjectProfileSerializer,
    E9ScopeItemSerializer,
    default_profile_data,
)
from .safety import uuid_or_none
from .services import (
    reorder_scope,
    link_parts,
    ensure_floors,
    split_floors,
    item_code,
    PARKED_FROM,
    park_item,
    record,
    record_changes,
    renumber_scope,
    scope_map,
    snapshot,
)


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

    cert_states = certification.project_states(projects)
    # tracker progress (installed vs total) for the pies, in two queries
    unit_modes = {}
    for scope in E9ProjectScope.objects.filter(project_id__in=project_ids):
        unit_modes.setdefault(scope.project_id, {})[scope.key] = scope.unit_mode
    items_by_project = {}
    # only the few columns the progress numbers use: the Dashboard asks for every project at once
    for item in E9ScopeItem.objects.filter(project_id__in=project_ids).only(*tracker.PROGRESS_FIELDS):
        items_by_project.setdefault(item.project_id, []).append(item)
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
                "tracker": tracker.progress(items_by_project.get(project.id, []), unit_modes.get(project.id, {})),
                "cert_state": cert_states[project.id][0],
                "billing_open": cert_states[project.id][1],
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


# a safety net against a runaway request, not a limit anyone should reach: sheets of 500+ rows are normal
MAX_ROWS_PER_ADD = 5000


def _resent_counts(project):
    """{item id: {"reprint": n, "extra": m}} for the tracker's 'Re-sent' column."""
    from .models import E9Reprint

    counts = {}
    for item_id, kind in E9Reprint.objects.filter(project=project, item__isnull=False).values_list("item_id", "kind"):
        bucket = counts.setdefault(str(item_id), {})
        bucket[kind] = bucket.get(kind, 0) + 1
    return counts


def _serialize_rows(project, scopes, ids):
    """The current form of these rows, with each wall's parts attached so totals and codes are right."""
    wanted = {str(row_id) for row_id in ids}
    if not wanted:
        return []
    rows = list(E9ScopeItem.objects.filter(project=project, scope__in={row.scope for row in _rows_by_id(project, ids)}))
    tracker.fold_parts(rows)
    chosen = [row for row in rows if str(row.id) in wanted]
    return E9ScopeItemSerializer(chosen, many=True, context={"scopes": scopes}).data


def _rows_by_id(project, ids):
    return list(E9ScopeItem.objects.filter(project=project, pk__in=list(ids)).only("id", "scope"))


def _blocked_fields(user, slug, project_id, datas):
    """A message when this person may not change one of these fields (nothing is blocked yet)."""
    return None


class E9ScopeItemListEndpoint(BaseAPIView):
    """List a project's tracker items, or add new rows to a scope sheet."""

    def _project(self, request, slug, project_id):
        return _visible_projects(request.user, slug).filter(pk=project_id).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = self._project(request, slug, project_id)
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        items = list(E9ScopeItem.objects.filter(project=project))
        tracker.fold_parts(items)  # a wall's parts are attached to it, so its totals include them
        scopes = scope_map(project)
        return Response(
            {
                "can_edit": _can_update_items(request.user, slug, project.id),
                "items": E9ScopeItemSerializer(
                    items, many=True, context={"scopes": scopes, "resent": _resent_counts(project)}
                ).data,
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
            # rows put aside by a delete (spare numbers from PARKED_FROM) don't count
            last_number = (
                existing.filter(item_number__lt=PARKED_FROM).aggregate(models.Max("item_number"))["item_number__max"]
                or 0
            )
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
                ensure_floors(project, split_floors(serializer.validated_data["floor_area"]), request.user)
        data = E9ScopeItemSerializer(created, many=True, context={"scopes": scopes}).data
        return Response(data, status=status.HTTP_201_CREATED)


class E9ScopeItemBulkEndpoint(BaseAPIView):
    """Many tracker changes in ONE request (paste, fill down, undo of a paste).

    Body: {"scope": "wall_graphics", "add": 120, "floor_area": "4th Floor",
           "changes": [{"id": "<item id>" or "new:0", "data": {"height_in": "96"}}, ...]}
    "add" rows are created first (and can be named "new:0", "new:1"... in changes).
    Everything succeeds or nothing is saved. Returns {"created": [...], "updated": [...]}.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, project_id):
        project = _visible_projects(request.user, slug).filter(pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_update_items(request.user, slug, project.id):
            return Response({"error": "Guests can view the tracker but not change it."}, status=403)

        scopes = scope_map(project)
        try:
            add = int(request.data.get("add", 0) or 0)
        except (TypeError, ValueError):
            add = -1
        changes = request.data.get("changes", [])
        if not 0 <= add <= MAX_ROWS_PER_ADD or not isinstance(changes, list) or len(changes) > MAX_ROWS_PER_ADD * 2:
            return Response({"error": "Send a sensible number of rows and changes."}, status=400)
        scope = request.data.get("scope")
        if add and (scope not in scopes or not scopes[scope].enabled):
            return Response({"scope": "Pick a scope that is switched on for this project."}, status=400)
        blocked = _blocked_fields(request.user, slug, project.id, [change.get("data") or {} for change in changes])
        if blocked:
            return Response({"error": blocked}, status=403)

        with transaction.atomic():
            Project.objects.select_for_update().filter(pk=project.id).first()
            created = []
            if add:
                existing = E9ScopeItem.all_objects.filter(project=project, scope=scope)
                last_number = (
                    existing.filter(item_number__lt=PARKED_FROM).aggregate(models.Max("item_number"))[
                        "item_number__max"
                    ]
                    or 0
                )
                last_order = existing.aggregate(models.Max("sort_order"))["sort_order__max"] or 0
                floor = str(request.data.get("floor_area") or "")[:255]
                created = E9ScopeItem.objects.bulk_create(
                    [
                        E9ScopeItem(
                            project=project,
                            workspace_id=project.workspace_id,
                            scope=scope,
                            item_number=last_number + index,
                            sort_order=last_order + index * 1000,
                            floor_area=floor,
                            created_by_id=request.user.id,
                        )
                        for index in range(1, add + 1)
                    ]
                )
                record(
                    project,
                    request.user,
                    "item",
                    "created",
                    None,
                    f"{item_code(created[0], scopes)}–{item_code(created[-1], scopes)}",
                    new=f"{add} row(s) added to {scopes[scope].label}",
                )

            by_id = {str(item.id): item for item in created}
            wanted = [str(change.get("id")) for change in changes if not str(change.get("id")).startswith("new:")]
            by_id.update(
                {
                    str(item.id): item
                    for item in E9ScopeItem.objects.select_for_update().filter(project=project, pk__in=wanted)
                }
            )
            updated, floors, errors, renumber = [], [], {}, set()
            for position, change in enumerate(changes):
                key = str(change.get("id"))
                if key.startswith("new:"):
                    try:
                        item = created[int(key[4:])]
                    except (ValueError, IndexError):
                        errors[position] = {"id": "Unknown new row."}
                        continue
                else:
                    item = by_id.get(key)
                    if item is None:
                        errors[position] = {"id": "Item not found."}
                        continue
                data = change.get("data") or {}
                before = snapshot(item, ITEM_EDITABLE_FIELDS)
                serializer = E9ScopeItemSerializer(item, data=data, partial=True, context={"scopes": scopes})
                if not serializer.is_valid():
                    errors[position] = serializer.errors
                    continue
                serializer.save()
                done = {field: getattr(item, field) for field in serializer.validated_data if field != "sort_order"}
                if key.startswith("new:"):
                    # a row created by this same request: its first values are not "changes" worth a history line each
                    pass
                else:
                    record_changes(item.project, request.user, "item", item.id, item_code(item, scopes), before, done)
                if "floor_area" in serializer.validated_data:
                    floors.extend(split_floors(item.floor_area))
                if "is_part" in serializer.validated_data:
                    renumber.add(item.scope)
                updated.append(item)
            if errors:
                transaction.set_rollback(True)
                return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
            if floors:
                ensure_floors(project, floors, request.user)
            for scope_key in renumber:  # parts take no W-number
                renumber_scope(project, scope_key, request.user)
        return Response(
            {
                "created": _serialize_rows(project, scopes, [item.id for item in created]),
                "updated": _serialize_rows(project, scopes, [item.id for item in updated]),
            },
            status=status.HTTP_201_CREATED,
        )


class E9ScopeItemInsertEndpoint(BaseAPIView):
    """Insert new rows in the MIDDLE of a sheet (above or below a row), or add a part under a wall.

    Body: {"before": "<item id>"} or {"after": "<item id>"}, optional "count" (default 1) and
    "is_part": true. Inserting above W3 makes the new row W3 and pushes the old W3 to W4 with all its data.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, project_id):
        project = _visible_projects(request.user, slug).filter(pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_update_items(request.user, slug, project.id):
            return Response({"error": "Guests can view the tracker but not change it."}, status=403)
        anchor_id = request.data.get("before") or request.data.get("after")
        below = bool(request.data.get("after"))
        try:
            count = int(request.data.get("count", 1))
        except (TypeError, ValueError):
            count = 0
        if not 1 <= count <= MAX_ROWS_PER_ADD:
            return Response({"count": "Insert a sensible number of rows."}, status=400)
        as_part = bool(request.data.get("is_part"))
        scopes = scope_map(project)
        with transaction.atomic():
            Project.objects.select_for_update().filter(pk=project.id).first()
            anchor = E9ScopeItem.objects.filter(project=project, pk=uuid_or_none(anchor_id)).first()
            if anchor is None:
                return Response({"error": "Pick the row to insert next to."}, status=status.HTTP_404_NOT_FOUND)
            if scopes.get(anchor.scope) is None or not scopes[anchor.scope].enabled:
                return Response({"scope": "That sheet is switched off."}, status=400)
            existing = E9ScopeItem.all_objects.filter(project=project, scope=anchor.scope)
            top = (
                existing.filter(item_number__lt=PARKED_FROM).aggregate(models.Max("item_number"))["item_number__max"]
                or 0
            )
            created = E9ScopeItem.objects.bulk_create(
                [
                    E9ScopeItem(
                        project=project,
                        workspace_id=project.workspace_id,
                        scope=anchor.scope,
                        item_number=top + index,
                        sort_order=anchor.sort_order,
                        floor_area=anchor.floor_area,
                        is_part=as_part,
                        created_by_id=request.user.id,
                    )
                    for index in range(1, count + 1)
                ]
            )
            order = [
                row.id
                for row in E9ScopeItem.objects.filter(project=project, scope=anchor.scope).order_by(
                    "sort_order", "item_number"
                )
                if row.id not in {c.id for c in created}
            ]
            at = order.index(anchor.id) + (1 if below else 0)
            if below and not as_part:
                # "below a wall" means below the wall AND its parts
                while at < len(order) and E9ScopeItem.objects.filter(pk=order[at], is_part=True).exists():
                    at += 1
            order[at:at] = [row.id for row in created]
            moved = reorder_scope(project, anchor.scope, order, request.user)
            kind = "part" if as_part else "row"
            side = "below" if below else "above"
            record(
                project,
                request.user,
                "item",
                "created",
                None,
                item_code(anchor, scopes),
                new=f"{count} {kind}(s) inserted {side} the row; {moved} code(s) moved",
            )
        return Response(
            {"created": _serialize_rows(project, scopes, [row.id for row in created]), "renumbered": moved},
            status=status.HTTP_201_CREATED,
        )


class E9ScopeItemMoveEndpoint(BaseAPIView):
    """Move rows (drag, or cut and paste) to a new place on the SAME sheet. Rows keep their photos, DCs and snags.

    Body: {"ids": ["<item id>", ...], "before": "<item id>" | null}. null = to the end of the sheet.
    A wall moves with its parts. The codes follow the new order.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, project_id):
        project = _visible_projects(request.user, slug).filter(pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_update_items(request.user, slug, project.id):
            return Response({"error": "Guests can view the tracker but not change it."}, status=403)
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids or len(ids) > MAX_ROWS_PER_ADD:
            return Response({"ids": "Pick the rows to move."}, status=400)
        scopes = scope_map(project)
        with transaction.atomic():
            Project.objects.select_for_update().filter(pk=project.id).first()
            wanted = {str(value) for value in ids}
            picked = list(E9ScopeItem.objects.filter(project=project, pk__in=[uuid_or_none(value) for value in ids]))
            if len(picked) != len(wanted):
                return Response({"ids": "Some rows were not found."}, status=404)
            scope_keys = {row.scope for row in picked}
            if len(scope_keys) != 1:
                return Response({"ids": "Rows can only be moved within one sheet."}, status=400)
            scope_key = scope_keys.pop()
            rows = list(
                E9ScopeItem.objects.filter(project=project, scope=scope_key).order_by("sort_order", "item_number")
            )
            tracker.fold_parts(rows)
            # a wall moves together with its parts
            moving = []
            for row in rows:
                parent = getattr(row, "_parent", None)
                if str(row.id) in wanted or (parent is not None and str(parent.id) in wanted):
                    moving.append(row)
            moving_ids = {row.id for row in moving}
            rest = [row for row in rows if row.id not in moving_ids]
            before = request.data.get("before")
            if before:
                target = uuid_or_none(before)
                if target in moving_ids:
                    return Response({"before": "Drop the rows somewhere else."}, status=400)
                at = next((index for index, row in enumerate(rest) if row.id == target), None)
                if at is None:
                    return Response({"before": "That row is not on the same sheet."}, status=400)
                # dropping "before a part" would split its wall: go above the wall instead
                while at > 0 and rest[at].is_part:
                    at -= 1
            else:
                at = len(rest)
            order = [row.id for row in rest[:at]] + [row.id for row in moving] + [row.id for row in rest[at:]]
            moved = reorder_scope(project, scope_key, order, request.user)
            record(
                project,
                request.user,
                "item",
                "updated",
                None,
                scopes[scope_key].label,
                field="order",
                new=f"{len(moving)} row(s) moved; {moved} code(s) changed",
            )
        return Response({"moved": len(moving), "renumbered": moved}, status=status.HTTP_200_OK)


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
        with transaction.atomic():
            # lock the row: two people editing different cells of one row must not overwrite each other
            item = E9ScopeItem.objects.select_for_update().get(pk=item.pk)
            before = snapshot(item, ITEM_EDITABLE_FIELDS)
            serializer = E9ScopeItemSerializer(item, data=request.data, partial=True, context={"scopes": scopes})
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            serializer.save()
            changed = {field: getattr(item, field) for field in serializer.validated_data if field != "sort_order"}
            record_changes(item.project, request.user, "item", item.id, item_code(item, scopes), before, changed)
            if "floor_area" in serializer.validated_data:
                ensure_floors(item.project, split_floors(item.floor_area), request.user)
            if "is_part" in serializer.validated_data:
                # a part takes no W-number: the real items renumber around it
                Project.objects.select_for_update().filter(pk=item.project_id).first()
                renumber_scope(item.project, item.scope, request.user)
                item.refresh_from_db()
        link_parts(item)
        return Response(E9ScopeItemSerializer(item, context={"scopes": scopes}).data, status=status.HTTP_200_OK)

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
            # lock the project so two people deleting at once renumber one after the other
            Project.objects.select_for_update().filter(pk=item.project_id).first()
            scope_key, project, deleted_id = item.scope, item.project, item.id
            link_parts(item)
            parts = list(item._parts)  # a wall's parts go with it (and come back together on Undo)
            # put aside (not erased) so Undo can bring the row back with its photos; its number moves out of
            # the way so the codes can close the gap
            park_item(item)
            for part in parts:
                park_item(part)
            record(project, request.user, "item", "deleted", deleted_id, code, old=details or code)
            moved = renumber_scope(project, scope_key, request.user)
            if moved:
                record(
                    project,
                    request.user,
                    "item",
                    "updated",
                    None,
                    code,
                    field="item_code",
                    new=f"{moved} code(s) moved up to close the gap after {code}",
                )
        if parts:
            return Response(
                {"deleted": [str(deleted_id), *(str(part.id) for part in parts)]}, status=status.HTTP_200_OK
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class E9ScopeItemRestoreEndpoint(BaseAPIView):
    """Undo a delete: the row comes back in its old place (codes after it move down one)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, project_id, item_id):
        if not _visible_projects(request.user, slug).filter(pk=project_id).exists():
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_update_items(request.user, slug, project_id):
            return Response({"error": "Guests can view the tracker but not change it."}, status=403)
        item = E9ScopeItem.all_objects.filter(project_id=project_id, pk=item_id, deleted_at__isnull=False).first()
        if item is None:
            return Response({"error": "Nothing to bring back."}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            Project.objects.select_for_update().filter(pk=project_id).first()
            E9ScopeItem.all_objects.filter(pk=item.pk).update(deleted_at=None)
            renumber_scope(item.project, item.scope, request.user)
            item.refresh_from_db()
            scopes = scope_map(item.project)
            record(item.project, request.user, "item", "restored", item.id, item_code(item, scopes))
        link_parts(item)
        return Response(E9ScopeItemSerializer(item, context={"scopes": scopes}).data, status=status.HTTP_200_OK)
