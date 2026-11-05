# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Snag List: defects found at handover, per item (the template's 'Snag List' and 'Open Snags')."""

import datetime

from rest_framework.response import Response

from plane.app.permissions import allow_permission
from plane.app.views.base import BaseAPIView

from . import tracker
from .models import E9ScopeItem, E9Snag, E9SnagStatus
from .services import item_code, record, record_changes, scope_map, snapshot
from .views import _can_update_items
from .views_boq import Invalid, _apply, _bad, _choice, _date, _editable, _iso, _text
from .views_setup import WORKSPACE_ROLES, _not_found, _project

SNAG_SPEC = {
    "raised_on": _date,
    "reason": _text(80),
    "details": _text(5000),
    "priority": _choice(tracker.SNAG_PRIORITY),
    "raised_by": _text(120),
    "assigned_to": _text(120),
    "target_date": _date,
    "status": _choice(E9SnagStatus.values),
    "closed_on": _date,
    "remarks": _text(5000),
}
SNAG_FIELDS = list(SNAG_SPEC)


def _snag_payload(snag, scopes, today):
    item = snag.item if snag.item_id else None
    end = snag.closed_on or today
    return {
        "id": str(snag.id),
        "item": str(snag.item_id) if item else None,
        "item_code": item_code(item, scopes) if item else "",
        "scope": item.scope if item else "",
        "scope_label": scopes[item.scope].label if item and item.scope in scopes else "",
        "item_description": item.description if item else "",
        "floor": item.floor_area if item else "",
        "days_open": (end - snag.raised_on).days if snag.raised_on else None,
        "overdue": bool(snag.target_date and snag.status != E9SnagStatus.CLOSED and snag.target_date < today),
        **{
            field: (
                _iso(getattr(snag, field)) if isinstance(getattr(snag, field), datetime.date) else getattr(snag, field)
            )
            for field in SNAG_FIELDS
        },
        "created_at": snag.created_at.isoformat(),
    }


def snags_payload(project, user, slug):
    scopes = scope_map(project)
    today = datetime.date.today()
    snags = E9Snag.objects.filter(project=project).select_related("item")
    rows = [_snag_payload(snag, scopes, today) for snag in snags]
    return {
        "can_update": _can_update_items(user, slug, project.id),
        "snags": rows,
        "reasons": tracker.SNAG_REASONS,
        "priorities": tracker.SNAG_PRIORITY,
        "statuses": tracker.SNAG_STATUS,
        "open": sum(1 for row in rows if row["status"] != E9SnagStatus.CLOSED),
    }


def _label(snag, project):
    if snag.item_id:
        return f"Snag on {item_code(snag.item, scope_map(project))}"
    return "Snag"


def _link_item(project, snag, data):
    if "item" in data:
        snag.item = E9ScopeItem.objects.filter(project=project, pk=data["item"]).first() if data["item"] else None
        if data["item"] and snag.item is None:
            raise Invalid("item", "Tracker row not found.")


def _closing(snag):
    """Closed → stamp the date; reopened → clear it."""
    if snag.status == E9SnagStatus.CLOSED and not snag.closed_on:
        snag.closed_on = datetime.date.today()
    if snag.status != E9SnagStatus.CLOSED:
        snag.closed_on = None


class E9SnagListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        return Response(snags_payload(project, request.user, slug))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project, error = _editable(request, slug, project_id, members=True)
        if error:
            return error
        snag = E9Snag(project=project, workspace_id=project.workspace_id, raised_on=datetime.date.today())
        try:
            _apply(snag, request.data, SNAG_SPEC)
            _link_item(project, snag, request.data)
            _closing(snag)
        except Invalid as problem:
            return _bad(problem)
        snag.sort_order = E9Snag.objects.filter(project=project).count() * 1000 + 1000
        snag.save(created_by_id=request.user.id)
        record(project, request.user, "snag", "created", snag.id, _label(snag, project), new=snag.reason or "Snag")
        return Response(snags_payload(project, request.user, slug), status=201)


class E9SnagDetailEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, snag_id):
        project, error = _editable(request, slug, project_id, members=True)
        if error:
            return error
        snag = E9Snag.objects.filter(project=project, pk=snag_id).first()
        if snag is None:
            return Response({"error": "Snag not found."}, status=404)
        before = snapshot(snag, SNAG_FIELDS)
        try:
            _apply(snag, request.data, SNAG_SPEC)
            _link_item(project, snag, request.data)
            _closing(snag)
        except Invalid as problem:
            return _bad(problem)
        snag.save()
        record_changes(
            project, request.user, "snag", snag.id, _label(snag, project), before, snapshot(snag, SNAG_FIELDS)
        )
        return Response(snags_payload(project, request.user, slug))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, snag_id):
        project, error = _editable(request, slug, project_id, members=True)
        if error:
            return error
        snag = E9Snag.objects.filter(project=project, pk=snag_id).first()
        if snag is None:
            return Response({"error": "Snag not found."}, status=404)
        record(project, request.user, "snag", "deleted", snag.id, _label(snag, project), old=snag.reason or "Snag")
        snag.delete(soft=False)
        return Response(snags_payload(project, request.user, slug))
