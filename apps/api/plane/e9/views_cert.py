# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Certification (JMC) per project / floor / scope, the part-billing switch, and team announcements."""

import datetime

from django.db import transaction
from django.db.models import Q
from rest_framework.response import Response

from plane.app.permissions import allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace

from . import certification
from .models import E9Announcement, E9Certification
from .services import record, record_changes, scope_map, snapshot
from .views import _can_edit, _is_workspace_admin
from .views_boq import Invalid, _apply, _bad, _date, _link, _text
from .views_setup import WORKSPACE_ROLES, _forbidden, _not_found, _project

CERT_SPEC = {
    "floor": _text(255),
    "scope": _text(40),
    "jmc_number": _text(80),
    "jmc_date": _date,
    "client_signatory": _text(120),
    "done_on": _date,
    "link": _link,
    "notes": _text(5000),
}
CERT_FIELDS = list(CERT_SPEC)
ADMIN_ONLY = "Only the project's admins or workspace admins can change certification and billing."


def _payload(request, slug, project):
    return certification.payload(project, _can_edit(request.user, slug, project.id), scope_map(project))


def _editable(request, slug, project_id):
    project = _project(request, slug, project_id)
    if project is None:
        return None, _not_found()
    if not _can_edit(request.user, slug, project.id):
        return None, _forbidden(ADMIN_ONLY)
    return project, None


def _check(project, cert):
    """Validate one certification before saving."""
    if cert.scope and cert.scope not in scope_map(project):
        raise Invalid("scope", "Choose one of this project's scopes.")
    same = E9Certification.objects.filter(project=project, floor__iexact=cert.floor, scope=cert.scope)
    if cert.pk:
        same = same.exclude(pk=cert.pk)
    if same.exists():
        raise Invalid("floor", f"{cert} already has a certification. Open that one instead.")
    if cert.done_on and not cert.jmc_date:
        cert.jmc_date = cert.done_on
    if cert.done_on and cert.jmc_date and cert.done_on < cert.jmc_date:
        raise Invalid("done_on", "The JMC can't be signed before the measurement date.")
    if cert.done_on and cert.done_on > datetime.date.today():
        raise Invalid("done_on", "The signed date can't be in the future.")


class E9CertificationListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        return Response(_payload(request, slug, project))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        cert = E9Certification(project=project, workspace_id=project.workspace_id)
        try:
            _apply(cert, request.data, CERT_SPEC)
            _check(project, cert)
        except Invalid as problem:
            return _bad(problem)
        cert.save(created_by_id=request.user.id)
        record(project, request.user, "certification", "created", cert.id, f"JMC · {cert}", new=str(cert))
        return Response(_payload(request, slug, project), status=201)


class E9CertificationDetailEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, cert_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        cert = E9Certification.objects.filter(project=project, pk=cert_id).first()
        if cert is None:
            return Response({"error": "Certification not found."}, status=404)
        before = snapshot(cert, CERT_FIELDS)
        try:
            _apply(cert, request.data, CERT_SPEC)
            _check(project, cert)
            if before["done_on"] and not cert.done_on and cert.bills.exists():
                raise Invalid("done_on", "Bills are already raised on this JMC, so it can't be undone.")
        except Invalid as problem:
            return _bad(problem)
        cert.save()
        after = snapshot(cert, CERT_FIELDS)
        record_changes(project, request.user, "certification", cert.id, f"JMC · {cert}", before, after)
        return Response(_payload(request, slug, project))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, cert_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        cert = E9Certification.objects.filter(project=project, pk=cert_id).first()
        if cert is None:
            return Response({"error": "Certification not found."}, status=404)
        if cert.bills.exists():
            return Response({"error": "Bills are raised on this JMC, so it can't be deleted."}, status=400)
        with transaction.atomic():
            record(project, request.user, "certification", "deleted", cert.id, f"JMC · {cert}", old=str(cert))
            cert.delete(soft=False)
        return Response(_payload(request, slug, project))


# ---------------------------------------------------------------------------
# Announcements (whole team)
# ---------------------------------------------------------------------------


def _announcements(slug, can_post):
    today = datetime.date.today()
    rows = E9Announcement.objects.filter(workspace__slug=slug).filter(Q(ends_on__isnull=True) | Q(ends_on__gte=today))
    return {
        "can_post": can_post,
        "announcements": [
            {
                "id": str(row.id),
                "title": row.title,
                "body": row.body,
                "important": row.important,
                "ends_on": row.ends_on.isoformat() if row.ends_on else None,
                "created_at": row.created_at.isoformat(),
                "author": row.created_by.display_name if row.created_by else "",
            }
            for row in rows.select_related("created_by").order_by("-important", "-created_at")
        ],
    }


class E9AnnouncementListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug):
        return Response(_announcements(slug, _is_workspace_admin(request.user, slug)))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug):
        if not _is_workspace_admin(request.user, slug):
            return _forbidden("Only workspace admins can post announcements.")
        title = str(request.data.get("title") or "").strip()[:160]
        if not title:
            return Response({"title": "Type a short title."}, status=400)
        try:
            ends_on = _date("ends_on", request.data.get("ends_on"))
        except Invalid as problem:
            return _bad(problem)
        if ends_on and ends_on < datetime.date.today():
            return Response({"ends_on": "Pick today or a later day."}, status=400)
        workspace = Workspace.objects.get(slug=slug)
        announcement = E9Announcement(
            workspace=workspace,
            title=title,
            body=str(request.data.get("body") or "").strip()[:5000],
            important=bool(request.data.get("important")),
            ends_on=ends_on,
        )
        announcement.save(created_by_id=request.user.id)
        return Response(_announcements(slug, True), status=201)


class E9AnnouncementDetailEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, announcement_id):
        if not _is_workspace_admin(request.user, slug):
            return _forbidden("Only workspace admins can remove announcements.")
        row = E9Announcement.objects.filter(workspace__slug=slug, pk=announcement_id).first()
        if row is None:
            return Response({"error": "Announcement not found."}, status=404)
        row.delete(soft=False)
        return Response(_announcements(slug, True))
