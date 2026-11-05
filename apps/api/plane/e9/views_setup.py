# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Project set-up endpoints: scopes, floors, photos & PDFs, history and Excel import."""

import mimetypes
import uuid

from django.db import models, transaction
from django.http import FileResponse
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView

from . import importer
from .models import E9Attachment, E9AttachmentKind, E9ChangeLog, E9Floor, E9ProjectScope, E9ScopeItem, E9UnitMode
from .serializers import (
    E9AttachmentSerializer,
    E9ChangeLogSerializer,
    E9FloorSerializer,
    E9ProjectScopeSerializer,
)
from .services import (
    PREFIX_PATTERN,
    ensure_scopes,
    item_code,
    new_scope_key,
    record,
    record_changes,
    scope_map,
    snapshot,
)
from .views import _can_edit, _can_update_items, _visible_projects

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_TYPES = ("image/", "application/pdf")
WORKSPACE_ROLES = [ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST]


def _project(request, slug, project_id):
    return _visible_projects(request.user, slug).filter(pk=project_id).first()


def _not_found():
    return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)


def _forbidden(message="Guests can view this project but not change it."):
    return Response({"error": message}, status=status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# Scopes
# ---------------------------------------------------------------------------


def _scopes_payload(project):
    scopes = ensure_scopes(project)
    counts = dict(
        E9ScopeItem.objects.filter(project=project)
        .values("scope")
        .annotate(total=models.Count("id"))
        .values_list("scope", "total")
    )
    data = E9ProjectScopeSerializer(scopes, many=True).data
    for row in data:
        row["item_count"] = counts.get(row["key"], 0)
    return data


class E9ScopeListEndpoint(BaseAPIView):
    """The project's scope sheets. GET lists them; PUT saves the whole list (switch on/off, add, rename, order)."""

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        return Response(_scopes_payload(project))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def put(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        if not _can_edit(request.user, slug, project.id):
            return _forbidden("Only the project's admins or workspace admins can change its scopes.")
        rows = request.data.get("scopes")
        if not isinstance(rows, list):
            return Response({"scopes": "Send the list of scopes."}, status=400)

        current = {scope.key: scope for scope in ensure_scopes(project, user=request.user)}
        used = set(E9ScopeItem.objects.filter(project=project).values_list("scope", flat=True))

        # 1) check everything first, so nothing is half-saved
        cleaned = []
        for row in rows:
            label = str(row.get("label", "")).strip()[:80]
            prefix = str(row.get("prefix", "")).strip().upper()
            unit_mode = row.get("unit_mode", E9UnitMode.EITHER)
            key = row.get("key") if row.get("key") in current else None
            if not label:
                return Response({"scopes": "Every scope needs a name."}, status=400)
            if unit_mode not in E9UnitMode.values:
                return Response({"scopes": f"'{label}': choose how it is measured."}, status=400)
            if not PREFIX_PATTERN.match(prefix):
                return Response({"scopes": f"'{label}': the code must be 1-6 letters or numbers."}, status=400)
            if key and current[key].prefix != prefix and key in used:
                return Response({"scopes": f"'{label}' already has items, so its code cannot change."}, status=400)
            cleaned.append((key, label, prefix, unit_mode, bool(row.get("enabled", True))))
        sent_keys = {key for key, *_ in cleaned if key}
        # standard scopes are never removed (only switched off); keep any that were not sent
        kept_prefixes = [scope.prefix for key, scope in current.items() if key not in sent_keys and scope.is_standard]
        prefixes = [prefix for _, _, prefix, _, _ in cleaned] + kept_prefixes
        duplicate = next((prefix for prefix in prefixes if prefixes.count(prefix) > 1), None)
        if duplicate:
            return Response({"scopes": f"Two scopes use the code '{duplicate}'. Codes must differ."}, status=400)
        removed = [scope for key, scope in current.items() if key not in sent_keys and not scope.is_standard]
        for scope in removed:
            if scope.key in used:
                return Response(
                    {"scopes": f"'{scope.label}' has items. Switch it off instead of removing it."}, status=400
                )

        # 2) save
        fields = ["label", "prefix", "unit_mode", "enabled"]
        with transaction.atomic():
            for scope in removed:
                record(project, request.user, "scope", "deleted", None, scope.label, old=scope.label)
                scope.delete(soft=False)
            for order, (key, label, prefix, unit_mode, enabled) in enumerate(cleaned):
                if key:
                    scope = current[key]
                    before = snapshot(scope, fields)
                else:
                    scope = E9ProjectScope(
                        project=project,
                        workspace_id=project.workspace_id,
                        key=new_scope_key(project, label),
                        is_standard=False,
                    )
                    before = None
                scope.label, scope.prefix, scope.unit_mode, scope.enabled = label, prefix, unit_mode, enabled
                scope.sort_order = (order + 1) * 1000
                if before is None:
                    scope.save(created_by_id=request.user.id)
                    record(project, request.user, "scope", "created", None, label, new=f"{label} ({prefix})")
                else:
                    scope.save()
                    record_changes(project, request.user, "scope", None, label, before, snapshot(scope, fields))
        return Response(_scopes_payload(project))


# ---------------------------------------------------------------------------
# Floors
# ---------------------------------------------------------------------------


class E9FloorListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        return Response(E9FloorSerializer(E9Floor.objects.filter(project=project), many=True).data)

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        """Add one floor ({"name": ...}) or several at once ({"names": [...]})."""
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        if not _can_update_items(request.user, slug, project.id):
            return _forbidden()
        names = request.data.get("names") or [request.data.get("name", "")]
        names = [str(name).strip()[:255] for name in names if str(name).strip()]
        if not names:
            return Response({"name": "Give the floor a name."}, status=400)
        existing = set(E9Floor.objects.filter(project=project).values_list("name", flat=True))
        last = E9Floor.objects.filter(project=project).aggregate(models.Max("sort_order"))["sort_order__max"] or 0
        created = []
        with transaction.atomic():
            for name in dict.fromkeys(names):
                if name in existing:
                    continue
                last += 1000
                floor = E9Floor(project=project, workspace_id=project.workspace_id, name=name, sort_order=last)
                floor.save(created_by_id=request.user.id)
                created.append(floor)
            if created:
                record(
                    project,
                    request.user,
                    "floor",
                    "created",
                    None,
                    created[0].name if len(created) == 1 else f"{len(created)} floors",
                    new=", ".join(floor.name for floor in created),
                )
        return Response(E9FloorSerializer(created, many=True).data, status=status.HTTP_201_CREATED)


class E9FloorDetailEndpoint(BaseAPIView):
    def _floor(self, request, slug, project_id, floor_id):
        project = _project(request, slug, project_id)
        return None if project is None else E9Floor.objects.filter(project=project, pk=floor_id).first()

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, floor_id):
        floor = self._floor(request, slug, project_id, floor_id)
        if floor is None:
            return Response({"error": "Floor not found."}, status=404)
        if not _can_update_items(request.user, slug, project_id):
            return _forbidden()
        fields = ["name", "status", "target_date", "notes", "sort_order"]
        before = snapshot(floor, fields)
        serializer = E9FloorSerializer(floor, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        new_name = serializer.validated_data.get("name")
        taken = E9Floor.objects.filter(project=floor.project, name=new_name).exclude(pk=floor.pk).exists()
        if new_name and taken:
            return Response({"name": "Another floor already has this name."}, status=400)
        with transaction.atomic():
            serializer.save()
            if new_name and new_name != before["name"]:
                # renaming a floor renames it on every item too
                E9ScopeItem.objects.filter(project=floor.project, floor_area=before["name"]).update(floor_area=new_name)
            after = {field: getattr(floor, field) for field in serializer.validated_data if field != "sort_order"}
            record_changes(floor.project, request.user, "floor", floor.id, floor.name, before, after)
        return Response(E9FloorSerializer(floor).data)

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, floor_id):
        floor = self._floor(request, slug, project_id, floor_id)
        if floor is None:
            return Response({"error": "Floor not found."}, status=404)
        if not _can_update_items(request.user, slug, project_id):
            return _forbidden()
        if E9ScopeItem.objects.filter(project=floor.project, floor_area=floor.name).exists():
            return Response({"error": f"Items are still on '{floor.name}'. Move them first."}, status=400)
        record(floor.project, request.user, "floor", "deleted", floor.id, floor.name, old=floor.name)
        floor.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Photos & PDFs
# ---------------------------------------------------------------------------


def _attachment_label(attachment, scopes):
    if attachment.item_id:
        return f"{item_code(attachment.item, scopes)} photo"
    return attachment.label or attachment.name or "Document"


class E9AttachmentListEndpoint(BaseAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        attachments = E9Attachment.objects.filter(project=project)
        if request.query_params.get("kind"):
            attachments = attachments.filter(kind=request.query_params["kind"])
        if request.query_params.get("item"):
            attachments = attachments.filter(item_id=request.query_params["item"])
        if request.query_params.get("ref"):
            attachments = attachments.filter(ref_id=request.query_params["ref"])
        return Response(E9AttachmentSerializer(attachments, many=True).data)

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        """Upload files (field "files", several allowed) or save a link ("link") for an item or the project."""
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        if not _can_update_items(request.user, slug, project.id):
            return _forbidden()
        kind = request.data.get("kind", "photo")
        if kind not in E9AttachmentKind.values:
            return Response({"kind": "Unknown kind."}, status=400)
        ref_id = request.data.get("ref_id") or None
        if ref_id:
            try:
                ref_id = uuid.UUID(str(ref_id))
            except ValueError:
                return Response({"ref_id": "Not a valid id."}, status=400)
        item = None
        if request.data.get("item"):
            item = E9ScopeItem.objects.filter(project=project, pk=request.data["item"]).first()
            if item is None:
                return Response({"item": "Item not found."}, status=400)
        meta = E9AttachmentSerializer(
            data={
                "name": request.data.get("name", ""),
                "label": request.data.get("label", ""),
                "version": request.data.get("version", ""),
                "sent_on": request.data.get("sent_on") or None,
                "link": request.data.get("link", ""),
            }
        )
        if not meta.is_valid():
            return Response(meta.errors, status=400)
        files = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not files and not meta.validated_data.get("link") and not meta.validated_data.get("name"):
            return Response({"files": "Choose a file to upload."}, status=400)
        for upload in files:
            content_type = upload.content_type or mimetypes.guess_type(upload.name)[0] or ""
            if not content_type.startswith(ALLOWED_TYPES):
                return Response({"files": f"'{upload.name}' is not a photo or PDF."}, status=400)
            if upload.size > MAX_UPLOAD_BYTES:
                return Response({"files": f"'{upload.name}' is larger than 25 MB."}, status=400)

        scopes = scope_map(project)
        created = []
        with transaction.atomic():
            for upload in files or [None]:
                attachment = E9Attachment(
                    project=project,
                    workspace_id=project.workspace_id,
                    item=item,
                    kind=kind,
                    ref_id=ref_id,
                    **meta.validated_data,
                )
                if upload is not None:
                    attachment.name = attachment.name or upload.name[:255]
                    attachment.size = upload.size
                    attachment.content_type = (upload.content_type or mimetypes.guess_type(upload.name)[0] or "")[:120]
                    attachment.file.save(upload.name, upload, save=False)
                attachment.save(created_by_id=request.user.id)
                created.append(attachment)
                record(
                    project,
                    request.user,
                    "attachment",
                    "uploaded",
                    attachment.id,
                    _attachment_label(attachment, scopes),
                    new=attachment.name or attachment.link,
                )
        return Response(E9AttachmentSerializer(created, many=True).data, status=status.HTTP_201_CREATED)


class E9AttachmentDetailEndpoint(BaseAPIView):
    def _attachment(self, request, slug, project_id, attachment_id):
        project = _project(request, slug, project_id)
        return None if project is None else E9Attachment.objects.filter(project=project, pk=attachment_id).first()

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, attachment_id):
        attachment = self._attachment(request, slug, project_id, attachment_id)
        if attachment is None:
            return Response({"error": "File not found."}, status=404)
        if not _can_update_items(request.user, slug, project_id):
            return _forbidden()
        fields = ["name", "label", "version", "sent_on", "link"]
        before = snapshot(attachment, fields)
        serializer = E9AttachmentSerializer(attachment, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        serializer.save()
        after = {field: getattr(attachment, field) for field in serializer.validated_data}
        label = _attachment_label(attachment, scope_map(attachment.project))
        record_changes(attachment.project, request.user, "attachment", attachment.id, label, before, after)
        return Response(serializer.data)

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, attachment_id):
        attachment = self._attachment(request, slug, project_id, attachment_id)
        if attachment is None:
            return Response({"error": "File not found."}, status=404)
        if not _can_update_items(request.user, slug, project_id):
            return _forbidden()
        label = _attachment_label(attachment, scope_map(attachment.project))
        record(attachment.project, request.user, "attachment", "deleted", attachment.id, label, old=attachment.name)
        if attachment.file:
            attachment.file.delete(save=False)
        attachment.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class E9AttachmentFileEndpoint(BaseAPIView):
    """Streams the stored photo / PDF to people who can see the project."""

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id, attachment_id):
        project = _project(request, slug, project_id)
        attachment = None if project is None else E9Attachment.objects.filter(project=project, pk=attachment_id).first()
        if attachment is None or not attachment.file:
            return Response({"error": "File not found."}, status=404)
        response = FileResponse(
            attachment.file.open("rb"),
            content_type=attachment.content_type or "application/octet-stream",
            as_attachment=request.query_params.get("download") == "1",
            filename=attachment.name or "file",
        )
        response["Cache-Control"] = "private, max-age=3600"
        return response


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


class E9HistoryEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        changes = E9ChangeLog.objects.filter(project=project).select_related("created_by")
        if request.query_params.get("entity_id"):
            changes = changes.filter(entity_id=request.query_params["entity_id"])
        if request.query_params.get("before"):
            changes = changes.filter(created_at__lt=request.query_params["before"])
        try:
            limit = min(max(int(request.query_params.get("limit", 100)), 1), 500)
        except ValueError:
            limit = 100
        return Response(E9ChangeLogSerializer(changes[:limit], many=True).data)


# ---------------------------------------------------------------------------
# Excel import
# ---------------------------------------------------------------------------


class E9ImportEndpoint(BaseAPIView):
    parser_classes = (MultiPartParser, FormParser)

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        if not _can_edit(request.user, slug, project.id):
            return _forbidden("Only the project's admins or workspace admins can import a tracker.")
        upload = request.FILES.get("file")
        if upload is None or not upload.name.lower().endswith((".xlsx", ".xlsm")):
            return Response({"file": "Choose the tracker's .xlsx file."}, status=400)
        if upload.size > MAX_UPLOAD_BYTES:
            return Response({"file": "The file is larger than 25 MB."}, status=400)
        try:
            report = importer.import_tracker(project, upload, request.user)
        except importer.ImportProblem as problem:
            return Response({"file": str(problem)}, status=400)
        return Response(report, status=status.HTTP_201_CREATED)
