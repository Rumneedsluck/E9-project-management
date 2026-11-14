# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""BOQ / POs / amendments, reprints, JC & DC logs, billing (4 stages) and the company summary."""

import datetime
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework.response import Response

from plane.app.permissions import allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project

from . import boq, certification, tracker
from .models import (
    E9Amendment,
    E9AmendmentChange,
    E9AmendmentStatus,
    E9Bill,
    E9BillLine,
    E9BoqLine,
    E9BoqUnit,
    E9Certification,
    E9Challan,
    E9JobCard,
    E9POKind,
    E9PurchaseOrder,
    E9Reprint,
    E9ReprintCause,
    E9ReprintKind,
    E9ScopeItem,
)
from .safety import clean_link, uuid_or_none
from .services import item_code, record, record_changes, scope_map, snapshot
from .tracker import item_unit
from .access import is_locked_for
from .views import _can_edit, _can_update_items, _visible_projects
from .views_setup import WORKSPACE_ROLES, _forbidden, _not_found, _project


class Invalid(Exception):
    def __init__(self, field, message):
        super().__init__(message)
        self.field, self.message = field, message


# ---------------------------------------------------------------------------
# small parsing helpers (forms send strings; blank means "not set")
# ---------------------------------------------------------------------------


def _text(limit):
    def parse(field, value):
        return str(value or "").strip()[:limit]

    return parse


def _link(field, value):
    """A web or mail address only (never javascript: and friends)."""
    cleaned = clean_link(value)
    if cleaned is None:
        raise Invalid(field, "Use a web address that starts with http:// or https://.")
    return cleaned[:1000]


def _date(field, value):
    if value in (None, ""):
        return None
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        raise Invalid(field, "Use a date like 2026-11-05.")


def _decimal(required=False, allow_negative=False):
    def parse(field, value):
        if value in (None, ""):
            if required:
                raise Invalid(field, "Type a number.")
            return None
        try:
            number = Decimal(str(value))
        except InvalidOperation:
            raise Invalid(field, "Type a number.")
        if not number.is_finite() or (number < 0 and not allow_negative):
            raise Invalid(field, "Type a number that is 0 or more.")
        return number.quantize(Decimal("0.01"))

    return parse


def _choice(values):
    def parse(field, value):
        if value not in values:
            raise Invalid(field, f"Choose one of: {', '.join(values)}.")
        return value

    return parse


def _apply(instance, data, spec):
    """Copy the allowed fields from data onto instance. Returns the names that were sent."""
    sent = []
    for field, parse in spec.items():
        if field in data:
            value = parse(field, data[field])
            if value is None and field in ("qty",):
                value = Decimal("0")
            setattr(instance, field, value)
            sent.append(field)
    return sent


def _bad(error):
    return Response({error.field: error.message}, status=400)


def _iso(value):
    return value.isoformat() if value else None


def _num(value):
    return None if value is None else str(value)


PO_SPEC = {
    "kind": _choice(E9POKind.values),
    "number": _text(80),
    "title": _text(160),
    "po_date": _date,
    "link": _link,
    "notes": _text(5000),
}
LINE_SPEC = {
    "line_no": _text(60),
    "scope": _text(40),
    "description": _text(5000),
    "unit": _choice(E9BoqUnit.values),
    "qty": _decimal(),
    "amended_qty": _decimal(),
    "amended_note": _text(255),
    "rate": _decimal(),
    "remarks": _text(5000),
}
AMENDMENT_SPEC = {
    "reference": _text(160),
    "requested_on": _date,
    "confirmed_on": _date,
    "status": _choice(E9AmendmentStatus.values),
    "mail_link": _link,
    "notes": _text(5000),
}
REPRINT_SPEC = {
    "kind": _choice(E9ReprintKind.values),
    "cause": _choice(E9ReprintCause.values),
    "qty": _decimal(),
    "reason": _text(5000),
    "description": _text(5000),
    "pieces": _decimal(),
    "reprint_height_in": _decimal(),
    "reprint_width_in": _decimal(),
    "jc_no": _text(60),
    "approved": _choice(["", "Yes", "Pending", "No"]),
    "remarks": _text(5000),
    "reprint_date": _date,
}
JC_SPEC = {
    "jc_date": _date,
    "vendor": _text(120),
    "expected_date": _date,
    "received": _choice(["Pending", "Partly", "Yes", "No"]),
    "received_date": _date,
    "eproof_sent_on": _date,
    "notes": _text(5000),
}
DC_SPEC = {
    "dc_date": _date,
    "dispatched_from": _text(120),
    "sent_by": _text(120),
    "vehicle": _text(120),
    "invoice_no": _text(80),
    "invoice_date": _date,
    "e9_signoff": _choice(["Pending", "Signed"]),
    "client_signoff": _choice(["Pending", "Signed", "Returned"]),
    "client_signatory": _text(120),
    "status": _choice(["Dispatched", "Delivered at Site", "Returned"]),
    "notes": _text(5000),
}
# billing: fields grouped by stage, in order
BILL_STAGES = [
    ("Certification", ["cert_number", "cert_signed_on", "cert_to_accounts_on"]),
    ("Proforma invoice", ["pi_number", "pi_date", "pi_amount"]),
    ("PI signed & submitted", ["pi_signed_on", "pi_submitted_on"]),
    ("Work completion certificate", ["wcc_number", "wcc_date", "wcc_acknowledged_on"]),
]
BILL_SPEC = {
    "title": _text(160),
    "notes": _text(5000),
    "cert_number": _text(80),
    "cert_signed_on": _date,
    "cert_to_accounts_on": _date,
    "pi_number": _text(80),
    "pi_date": _date,
    "pi_amount": _decimal(),
    "pi_signed_on": _date,
    "pi_submitted_on": _date,
    "wcc_number": _text(80),
    "wcc_date": _date,
    "wcc_acknowledged_on": _date,
}
# inside a stage, this field needs that one first
BILL_NEEDS = {
    "cert_to_accounts_on": ("cert_signed_on", "the client's sign-off date"),
    "pi_submitted_on": ("pi_signed_on", "the PI signed date"),
    "wcc_acknowledged_on": ("wcc_date", "the WCC date"),
}


def _stage_done(bill, index):
    """Is stage `index` (0-based) complete?"""
    return [
        bool(bill.cert_to_accounts_on),
        bool(bill.pi_number and bill.pi_date),
        bool(bill.pi_submitted_on),
        bool(bill.wcc_acknowledged_on),
    ][index]


def _check_bill_order(bill):
    """A later stage cannot be filled in before the one before it is complete."""
    for index, (label, fields) in enumerate(BILL_STAGES):
        filled = [field for field in fields if getattr(bill, field) not in (None, "")]
        if filled and index > 0 and not _stage_done(bill, index - 1):
            previous = BILL_STAGES[index - 1][0]
            raise Invalid(filled[0], f"Finish '{previous}' first. {label} can only start after it.")
    for field, (needed, text) in BILL_NEEDS.items():
        if getattr(bill, field) and not getattr(bill, needed):
            raise Invalid(field, f"Fill in {text} first.")


# ---------------------------------------------------------------------------
# BOQ overview
# ---------------------------------------------------------------------------


def _po_payload(po):
    return {
        "id": str(po.id),
        "kind": po.kind,
        "number": po.number,
        "title": po.title,
        "label": str(po),
        "po_date": _iso(po.po_date),
        "link": po.link,
        "notes": po.notes,
        "amendments": [
            {
                "id": str(amendment.id),
                "reference": amendment.reference,
                "requested_on": _iso(amendment.requested_on),
                "confirmed_on": _iso(amendment.confirmed_on),
                "status": amendment.status,
                "mail_link": amendment.mail_link,
                "notes": amendment.notes,
                "changes": [
                    {
                        "id": str(change.id),
                        "boq_line": str(change.boq_line_id),
                        "line_no": change.boq_line.line_no,
                        "qty_change": _num(change.qty_change),
                    }
                    for change in amendment.changes.all()
                    if not change.boq_line.deleted_at
                ],
                "new_lines": [line.line_no for line in amendment.new_lines.all()],
            }
            for amendment in po.amendments.all()
        ],
    }


def _item_unit(item, scopes):
    scope = scopes.get(item.scope)
    return item_unit(scope.unit_mode if scope else "either", item.height_in, item.width_in, item.unit_override)


def _reprint_payload(reprint, scopes, vendors):
    item = reprint.item if reprint.item_id else None
    unit = _item_unit(item, scopes) if item else (reprint.boq_line.unit if reprint.boq_line_id else "nos")
    height = reprint.reprint_height_in or (item.height_in if item else None)
    width = reprint.reprint_width_in or (item.width_in if item else None)
    return {
        "id": str(reprint.id),
        "boq_line": str(reprint.boq_line_id) if reprint.boq_line_id else None,
        "line_no": reprint.boq_line.line_no if reprint.boq_line_id else "",
        "item": str(reprint.item_id) if reprint.item_id else None,
        "item_code": item_code(item, scopes) if item else "",
        "scope": item.scope if item else "",
        "scope_label": (scopes[item.scope].label if item and item.scope in scopes else ""),
        "item_description": item.description if item else "",
        "original_height_in": _num(item.height_in) if item else None,
        "original_width_in": _num(item.width_in) if item else None,
        "size_used": f"{_num(height)} × {_num(width)} in" if height and width else "",
        "unit": unit,
        "kind": reprint.kind,
        "cause": reprint.cause,
        "qty": _num(reprint.qty),
        "reason": reprint.reason,
        "description": reprint.description,
        "pieces": _num(reprint.pieces),
        "reprint_height_in": _num(reprint.reprint_height_in),
        "reprint_width_in": _num(reprint.reprint_width_in),
        "jc_no": reprint.jc_no,
        "vendor": vendors.get(boq.norm(reprint.jc_no), "") if reprint.jc_no else "",
        "approved": reprint.approved,
        "remarks": reprint.remarks,
        "reprint_date": _iso(reprint.reprint_date),
        "created_at": reprint.created_at.isoformat(),
    }


GUEST_MONEY_MESSAGE = "Guests can't see rates, purchase orders or bills."


def _sees_money(user, slug, project_id):
    """Rates, PO values and bills are for people who run the tracker (members and admins), never guests."""
    return _can_update_items(user, slug, project_id)


def boq_payload(project, user, slug):
    scopes = scope_map(project)
    lines, items = boq.line_rows(project)
    money = _sees_money(user, slug, project.id)
    if not money:
        # quantities stay (guests follow progress); every rate is removed
        lines = [{**line, "rate": None} for line in lines]
    pos = (
        E9PurchaseOrder.objects.filter(project=project)
        .prefetch_related("amendments__changes__boq_line", "amendments__new_lines")
        .order_by("sort_order", "created_at")
    )
    reprints = E9Reprint.objects.filter(project=project).select_related("boq_line", "item")
    vendors = {boq.norm(jc.number): jc.vendor for jc in E9JobCard.objects.filter(project=project) if jc.vendor}
    unlinked = boq.unlinked_items(project, lines, items, scopes)
    return {
        "can_edit": _can_edit(user, slug, project.id),
        "can_update": _can_update_items(user, slug, project.id),
        "pos": [_po_payload(po) for po in pos] if money else [],
        "lines": lines,
        "reprints": [_reprint_payload(reprint, scopes, vendors) for reprint in reprints],
        "reprint_reasons": tracker.REPRINT_REASONS,
        "unlinked": unlinked,
        "bills": boq.bill_rows(project) if money else [],
        "totals": {
            "excess_lines": sum(1 for line in lines if line["status"] == "excess"),
            "pending_lines": sum(1 for line in lines if line["status"] == "pending"),
            "unlinked_items": sum(group["count"] for group in unlinked),
        },
    }


class E9BoqEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        return Response(boq_payload(project, request.user, slug))


def _editable(request, slug, project_id, members=False):
    """(project, error response)"""
    project = _project(request, slug, project_id)
    if project is None:
        return None, _not_found()
    allowed = _can_update_items if members else _can_edit
    if not allowed(request.user, slug, project.id):
        message = (
            "Guests can view this project but not change it."
            if members
            else "Only the project's admins or workspace admins can change the BOQ, POs and billing."
        )
        return None, _forbidden(message)
    return project, None


# ---------------------------------------------------------------------------
# POs
# ---------------------------------------------------------------------------

PO_FIELDS = list(PO_SPEC)


class E9POListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        po = E9PurchaseOrder(project=project, workspace_id=project.workspace_id)
        try:
            _apply(po, request.data, PO_SPEC)
        except Invalid as problem:
            return _bad(problem)
        if not po.title:
            po.title = "Original BOQ / PO" if po.kind == E9POKind.ORIGINAL else f"New PO {po.number}".strip()
        po.sort_order = E9PurchaseOrder.objects.filter(project=project).count() * 1000 + 1000
        po.save(created_by_id=request.user.id)
        record(project, request.user, "po", "created", po.id, str(po), new=str(po))
        return Response(boq_payload(project, request.user, slug), status=201)


class E9PODetailEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, po_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        po = E9PurchaseOrder.objects.filter(project=project, pk=po_id).first()
        if po is None:
            return Response({"error": "PO not found."}, status=404)
        before = snapshot(po, PO_FIELDS)
        try:
            _apply(po, request.data, PO_SPEC)
        except Invalid as problem:
            return _bad(problem)
        po.save()
        record_changes(project, request.user, "po", po.id, str(po), before, snapshot(po, PO_FIELDS))
        return Response(boq_payload(project, request.user, slug))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, po_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        po = E9PurchaseOrder.objects.filter(project=project, pk=po_id).first()
        if po is None:
            return Response({"error": "PO not found."}, status=404)
        if E9Bill.objects.filter(po=po).exists():
            return Response({"error": "This PO has bills. Delete its bills first."}, status=400)
        with transaction.atomic():
            E9BoqLine.objects.filter(po=po).delete(soft=False)
            E9Amendment.objects.filter(po=po).delete(soft=False)
            record(project, request.user, "po", "deleted", po.id, str(po), old=str(po))
            po.delete(soft=False)
        return Response(boq_payload(project, request.user, slug))


# ---------------------------------------------------------------------------
# BOQ lines
# ---------------------------------------------------------------------------

LINE_FIELDS = list(LINE_SPEC)


def _line_no_taken(project, line_no, exclude=None):
    lines = E9BoqLine.objects.filter(project=project, line_no__iexact=line_no)
    if exclude:
        lines = lines.exclude(pk=exclude)
    return lines.exists()


class E9BoqLineListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        po = E9PurchaseOrder.objects.filter(project=project, pk=uuid_or_none(request.data.get("po"))).first()
        if po is None:
            return Response({"po": "Choose the PO this line belongs to."}, status=400)
        amendment = None
        if request.data.get("amendment"):
            amendment = E9Amendment.objects.filter(
                project=project, po=po, pk=uuid_or_none(request.data["amendment"])
            ).first()
            if amendment is None:
                return Response({"amendment": "Amendment not found on this PO."}, status=400)
        line = E9BoqLine(project=project, workspace_id=project.workspace_id, po=po, amendment=amendment)
        try:
            _apply(line, request.data, LINE_SPEC)
        except Invalid as problem:
            return _bad(problem)
        if not line.line_no:
            return Response({"line_no": "Type the BOQ Item No., e.g. BO1."}, status=400)
        if _line_no_taken(project, line.line_no):
            return Response({"line_no": f"{line.line_no} is already on this project's BOQ."}, status=400)
        line.qty = line.qty or Decimal("0")
        line.sort_order = E9BoqLine.objects.filter(project=project).count() * 1000 + 1000
        line.save(created_by_id=request.user.id)
        record(
            project,
            request.user,
            "boq",
            "created",
            line.id,
            line.line_no,
            new=f"{line.line_no} {line.description} {line.qty} {line.get_unit_display()}".strip(),
        )
        return Response(boq_payload(project, request.user, slug), status=201)


class E9BoqLineDetailEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, line_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        line = E9BoqLine.objects.filter(project=project, pk=line_id).first()
        if line is None:
            return Response({"error": "BOQ line not found."}, status=404)
        before = snapshot(line, LINE_FIELDS)
        try:
            _apply(line, request.data, LINE_SPEC)
        except Invalid as problem:
            return _bad(problem)
        if not line.line_no:
            return Response({"line_no": "Type the BOQ Item No., e.g. BO1."}, status=400)
        if _line_no_taken(project, line.line_no, exclude=line.id):
            return Response({"line_no": f"{line.line_no} is already on this project's BOQ."}, status=400)
        line.save()
        record_changes(project, request.user, "boq", line.id, line.line_no, before, snapshot(line, LINE_FIELDS))
        return Response(boq_payload(project, request.user, slug))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, line_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        line = E9BoqLine.objects.filter(project=project, pk=line_id).first()
        if line is None:
            return Response({"error": "BOQ line not found."}, status=404)
        if E9BillLine.objects.filter(boq_line=line, bill__deleted_at__isnull=True).exists():
            return Response({"error": f"{line.line_no} is on a bill, so it cannot be deleted."}, status=400)
        record(project, request.user, "boq", "deleted", line.id, line.line_no, old=line.line_no)
        line.delete(soft=False)
        return Response(boq_payload(project, request.user, slug))


# ---------------------------------------------------------------------------
# Amendments (client mail -> amended BOQ / PO)
# ---------------------------------------------------------------------------

AMENDMENT_FIELDS = list(AMENDMENT_SPEC)


def _save_changes(project, amendment, rows):
    """Replace the amendment's '+N on BOx' rows."""
    if not isinstance(rows, list):
        raise Invalid("changes", "Send a list of changes.")
    parsed = []
    for row in rows:
        line = E9BoqLine.objects.filter(project=project, po=amendment.po, pk=row.get("boq_line")).first()
        if line is None:
            raise Invalid("changes", "A change points at a BOQ line that is not on this PO.")
        qty = _decimal(required=True, allow_negative=True)("changes", row.get("qty_change"))
        if qty != 0:
            parsed.append((line, qty))
    E9AmendmentChange.objects.filter(amendment=amendment).delete(soft=False)
    for line, qty in parsed:
        E9AmendmentChange.objects.create(
            project=project, workspace_id=project.workspace_id, amendment=amendment, boq_line=line, qty_change=qty
        )
    return ", ".join(f"{line.line_no} {'+' if qty > 0 else ''}{qty}" for line, qty in parsed)


class E9AmendmentListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        po = E9PurchaseOrder.objects.filter(project=project, pk=uuid_or_none(request.data.get("po"))).first()
        if po is None:
            return Response({"po": "Choose the PO being amended."}, status=400)
        amendment = E9Amendment(project=project, workspace_id=project.workspace_id, po=po)
        try:
            with transaction.atomic():
                _apply(amendment, request.data, AMENDMENT_SPEC)
                if amendment.status == E9AmendmentStatus.CONFIRMED and not amendment.confirmed_on:
                    amendment.confirmed_on = datetime.date.today()
                amendment.save(created_by_id=request.user.id)
                summary = _save_changes(project, amendment, request.data.get("changes", []))
        except Invalid as problem:
            return _bad(problem)
        record(
            project,
            request.user,
            "amendment",
            "created",
            amendment.id,
            amendment.reference or "Amendment",
            new=f"{amendment.get_status_display()}: {summary}".strip(": "),
        )
        return Response(boq_payload(project, request.user, slug), status=201)


class E9AmendmentDetailEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, amendment_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        amendment = E9Amendment.objects.filter(project=project, pk=amendment_id).first()
        if amendment is None:
            return Response({"error": "Amendment not found."}, status=404)
        before = snapshot(amendment, AMENDMENT_FIELDS)
        try:
            with transaction.atomic():
                _apply(amendment, request.data, AMENDMENT_SPEC)
                if amendment.status == E9AmendmentStatus.CONFIRMED and not amendment.confirmed_on:
                    amendment.confirmed_on = datetime.date.today()
                amendment.save()
                if "changes" in request.data:
                    summary = _save_changes(project, amendment, request.data["changes"])
                    record(
                        project,
                        request.user,
                        "amendment",
                        "updated",
                        amendment.id,
                        amendment.reference or "Amendment",
                        field="changes",
                        new=summary,
                    )
        except Invalid as problem:
            return _bad(problem)
        record_changes(
            project,
            request.user,
            "amendment",
            amendment.id,
            amendment.reference or "Amendment",
            before,
            snapshot(amendment, AMENDMENT_FIELDS),
        )
        return Response(boq_payload(project, request.user, slug))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, amendment_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        amendment = E9Amendment.objects.filter(project=project, pk=amendment_id).first()
        if amendment is None:
            return Response({"error": "Amendment not found."}, status=404)
        if E9BillLine.objects.filter(boq_line__amendment=amendment, bill__deleted_at__isnull=True).exists():
            return Response({"error": "Lines from this amendment are on a bill."}, status=400)
        with transaction.atomic():
            E9AmendmentChange.objects.filter(amendment=amendment).delete(soft=False)
            E9BoqLine.objects.filter(amendment=amendment).delete(soft=False)
            record(
                project,
                request.user,
                "amendment",
                "deleted",
                amendment.id,
                amendment.reference or "Amendment",
                old=amendment.reference or "Amendment",
            )
            amendment.delete(soft=False)
        return Response(boq_payload(project, request.user, slug))


# ---------------------------------------------------------------------------
# Reprints
# ---------------------------------------------------------------------------

REPRINT_FIELDS = list(REPRINT_SPEC)


def _reprint_links(project, reprint, data):
    if "boq_line" in data:
        reprint.boq_line = (
            E9BoqLine.objects.filter(project=project, pk=uuid_or_none(data["boq_line"])).first()
            if data["boq_line"]
            else None
        )
        if data["boq_line"] and reprint.boq_line is None:
            raise Invalid("boq_line", "BOQ line not found.")
    if "item" in data:
        reprint.item = (
            E9ScopeItem.objects.filter(project=project, pk=uuid_or_none(data["item"])).first() if data["item"] else None
        )
        if data["item"] and reprint.item is None:
            raise Invalid("item", "Tracker row not found.")
        if reprint.item and not reprint.boq_line and reprint.item.boq_item_no:
            reprint.boq_line = E9BoqLine.objects.filter(
                project=project, line_no__iexact=reprint.item.boq_item_no.strip()
            ).first()


def _reprint_qty(project, reprint, data):
    """Qty (BOQ unit): worked out from the item, the tile size and pieces – like the template."""
    if reprint.item_id and "qty" not in data:
        unit = _item_unit(reprint.item, scope_map(project))
        height = reprint.reprint_height_in or reprint.item.height_in
        width = reprint.reprint_width_in or reprint.item.width_in
        reprint.qty = tracker.reprint_measure(unit, reprint.pieces, height, width)
    elif not reprint.item_id and reprint.qty in (None, Decimal("0")) and not reprint.pieces:
        raise Invalid("qty", "Pick the item code, or type the quantity.")
    elif not reprint.item_id and reprint.pieces and "qty" not in data:
        reprint.qty = Decimal(reprint.pieces)
    if reprint.qty is None:
        reprint.qty = Decimal("0")


class E9ReprintListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project, error = _editable(request, slug, project_id, members=True)
        if error:
            return error
        reprint = E9Reprint(project=project, workspace_id=project.workspace_id)
        try:
            _apply(reprint, request.data, REPRINT_SPEC)
            _reprint_links(project, reprint, request.data)
            _reprint_qty(project, reprint, request.data)
        except Invalid as problem:
            return _bad(problem)
        reprint.save(created_by_id=request.user.id)
        label = reprint.boq_line.line_no if reprint.boq_line else "Reprint"
        record(
            project,
            request.user,
            "reprint",
            "created",
            reprint.id,
            label,
            new=f"{reprint.get_kind_display()} · {reprint.qty} · caused by {reprint.get_cause_display()}",
        )
        return Response(boq_payload(project, request.user, slug), status=201)


class E9ReprintDetailEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, reprint_id):
        project, error = _editable(request, slug, project_id, members=True)
        if error:
            return error
        reprint = E9Reprint.objects.filter(project=project, pk=reprint_id).first()
        if reprint is None:
            return Response({"error": "Reprint not found."}, status=404)
        before = snapshot(reprint, REPRINT_FIELDS)
        try:
            _apply(reprint, request.data, REPRINT_SPEC)
            _reprint_links(project, reprint, request.data)
            _reprint_qty(project, reprint, request.data)
        except Invalid as problem:
            return _bad(problem)
        reprint.save()
        label = reprint.boq_line.line_no if reprint.boq_line else "Reprint"
        record_changes(project, request.user, "reprint", reprint.id, label, before, snapshot(reprint, REPRINT_FIELDS))
        return Response(boq_payload(project, request.user, slug))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, reprint_id):
        project, error = _editable(request, slug, project_id, members=True)
        if error:
            return error
        reprint = E9Reprint.objects.filter(project=project, pk=reprint_id).first()
        if reprint is None:
            return Response({"error": "Reprint not found."}, status=404)
        label = reprint.boq_line.line_no if reprint.boq_line else "Reprint"
        record(project, request.user, "reprint", "deleted", reprint.id, label, old=f"{reprint.qty}")
        reprint.delete(soft=False)
        return Response(boq_payload(project, request.user, slug))


# ---------------------------------------------------------------------------
# JC & DC logs (numbers and items come from the tracker; details are typed here)
# ---------------------------------------------------------------------------


def _split_dcs(value):
    return [part.strip() for part in (value or "").replace(";", ",").replace("/", ",").split(",") if part.strip()]


def logs_payload(project, user, slug):
    scopes = scope_map(project)
    items = [
        item for item in tracker.fold_parts(list(E9ScopeItem.objects.filter(project=project))) if boq.is_filled(item)
    ]
    jcs, dcs = defaultdict(list), defaultdict(list)
    for item in items:
        scope = scopes.get(item.scope)
        unit = item_unit(scope.unit_mode if scope else "either", item.height_in, item.width_in, item.unit_override)
        area = item.area_sqft if unit == "sqft" else None  # includes the wall's parts
        row = {
            "id": str(item.id),
            "code": item_code(item, scopes),
            "scope": item.scope,
            "scope_label": scope.label if scope else item.scope,
            "description": item.description,
            "floor": item.floor_area,
            "unit": unit,
            "qty": _num(item.qty),
            "area": _num(area),
            "wastage": _num(tracker.wastage(item, unit)),
            "wastage_pct": _num(tracker.wastage_percent(item, unit)),
            "part_count": len(tracker.parts_of(item)),
        }
        if item.jc_no.strip():
            jcs[boq.norm(item.jc_no)].append((item.jc_no.strip(), row))
        # partial dispatch: each DC gets the quantity typed for it (DC Qty, same order as DC No.)
        breakdown = tracker.dc_breakdown(item, unit)
        partial = len(breakdown) > 1 or any(
            qty is not None and qty < tracker.production_measure(item, unit) for _, qty in breakdown
        )
        for dc, qty in breakdown:
            dcs[boq.norm(dc)].append((dc, {**row, "sent": _num(qty), "partial": partial}))

    def merge(groups, meta_model, spec, totals):
        saved = {boq.norm(meta.number): meta for meta in meta_model.objects.filter(project=project)}
        out = []
        for key in sorted(set(groups) | set(saved), key=lambda k: (len(k), k)):
            rows = [row for _, row in groups.get(key, [])]
            meta = saved.get(key)
            number = meta.number if meta else groups[key][0][0]
            entry = {"number": number, "items": rows, "count": len(rows), "saved": bool(meta)}
            for field in spec:
                value = getattr(meta, field) if meta else None
                entry[field] = _iso(value) if isinstance(value, datetime.date) else (value if value is not None else "")
            if not meta:
                entry.update({k: v for k, v in DEFAULTS.get(meta_model, {}).items()})
            if totals:
                entry["sqft"] = str(
                    sum((Decimal(row["sent"]) for row in rows if row["unit"] == "sqft" and row["sent"]), Decimal("0"))
                )
                entry["nos"] = str(
                    sum((Decimal(row["sent"]) for row in rows if row["unit"] == "nos" and row["sent"]), Decimal("0"))
                )
                entry["unknown_qty"] = sum(1 for row in rows if not row["sent"])
            out.append(entry)
        return out

    return {
        "can_update": _can_update_items(user, slug, project.id),
        "job_cards": merge(jcs, E9JobCard, JC_SPEC, totals=False),
        "challans": merge(dcs, E9Challan, DC_SPEC, totals=True),
    }


DEFAULTS = {
    E9JobCard: {"received": "Pending"},
    E9Challan: {"e9_signoff": "Pending", "client_signoff": "Pending", "status": "Dispatched"},
}


class E9LogsEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        return Response(logs_payload(project, request.user, slug))


class E9LogEntryEndpoint(BaseAPIView):
    """PUT {number, ...details} saves the typed details of one JC (kind=jc) or DC (kind=dc)."""

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def put(self, request, slug, project_id, kind):
        project, error = _editable(request, slug, project_id, members=True)
        if error:
            return error
        if kind not in ("jc", "dc"):
            return Response({"error": "Unknown log."}, status=404)
        model, spec, entity = (E9JobCard, JC_SPEC, "jc") if kind == "jc" else (E9Challan, DC_SPEC, "dc")
        number = str(request.data.get("number", "")).strip()[:60]
        if not number:
            return Response({"number": "Type the number."}, status=400)
        entry = model.objects.filter(project=project, number__iexact=number).first()
        created = entry is None
        if created:
            entry = model(project=project, workspace_id=project.workspace_id, number=number)
        before = snapshot(entry, list(spec))
        try:
            _apply(entry, request.data, spec)
        except Invalid as problem:
            return _bad(problem)
        if created:
            entry.save(created_by_id=request.user.id)
        else:
            entry.save()
        label = f"{'JC' if kind == 'jc' else 'DC'} {number}"
        record_changes(
            project, request.user, entity, entry.id, label, {} if created else before, snapshot(entry, list(spec))
        )
        return Response(logs_payload(project, request.user, slug))


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------

BILL_FIELDS = list(BILL_SPEC)


def _bill_payload(bill):
    data = {
        "id": str(bill.id),
        "po": str(bill.po_id),
        "po_label": str(bill.po),
        "certification": str(bill.certification_id) if bill.certification_id else None,
        "certification_label": str(bill.certification) if bill.certification_id else "",
        "stage": boq.bill_stage(bill),
        "stage_text": boq.STAGE_TEXT[boq.bill_stage(bill)],
        "created_at": bill.created_at.isoformat(),
        "lines": [
            {
                "id": str(line.id),
                "boq_line": str(line.boq_line_id),
                "line_no": line.boq_line.line_no,
                "certified_qty": _num(line.certified_qty),
                "rate": _num(line.boq_line.rate),
                "unit": line.boq_line.unit,
                "description": line.boq_line.description,
            }
            for line in bill.lines.all()
        ],
    }
    for field in BILL_FIELDS:
        value = getattr(bill, field)
        if isinstance(value, datetime.date):
            value = _iso(value)
        elif isinstance(value, Decimal):
            value = _num(value)
        data[field] = value
    amount = sum(
        (line.certified_qty * line.boq_line.rate for line in bill.lines.all() if line.boq_line.rate is not None),
        Decimal("0"),
    )
    data["certified_amount"] = str(amount.quantize(Decimal("0.01")))
    return data


def bills_payload(project, user, slug):
    lines, _ = boq.line_rows(project)
    bills = E9Bill.objects.filter(project=project).select_related("po").prefetch_related("lines__boq_line")
    certs = list(E9Certification.objects.filter(project=project))
    profile = getattr(project, "e9_profile", None)
    return {
        "can_edit": _can_edit(user, slug, project.id),
        "billing_open": certification.billing_open(profile, certs),
        "certifications": [
            {"id": str(cert.id), "label": str(cert), "done_on": _iso(cert.done_on)} for cert in certs if cert.done_on
        ],
        "pos": [{"id": str(po.id), "label": str(po)} for po in E9PurchaseOrder.objects.filter(project=project)],
        "bills": [_bill_payload(bill) for bill in bills],
        "lines": lines,
    }


def _still_to_bill(line):
    """Billable now minus what bills already certified (never below zero)."""
    return max(Decimal(line["billable_now"]) - Decimal(line["certified"]), Decimal("0"))


def _save_bill_lines(project, bill, rows):
    if not isinstance(rows, list):
        raise Invalid("lines", "Send a list of certified quantities.")
    # one bill at a time per project, so two people cannot both certify the last units of a line
    Project.objects.select_for_update().filter(pk=project.id).first()
    # a bill may only certify what ITS signed JMC covers: a floor or scope JMC limits it to those rows
    cert = bill.certification if bill.certification_id else None
    lines = {row["id"]: row for row in boq.line_rows(project, cert=cert)[0]}
    earlier = E9BillLine.objects.filter(project=project, bill__deleted_at__isnull=True).exclude(bill=bill)
    if cert is not None and not cert.is_whole:
        # quantities certified on other JMCs belong to other floors / scopes
        earlier = earlier.filter(bill__certification=cert)
    others = defaultdict(lambda: Decimal("0"))
    for other in earlier:
        others[str(other.boq_line_id)] += other.certified_qty
    parsed = []
    for row in rows:
        line_id = str(row.get("boq_line"))
        line = lines.get(line_id)
        if line is None or line["po"] != str(bill.po_id):
            raise Invalid("lines", "A certified line is not on this bill's PO.")
        qty = _decimal(required=True)("lines", row.get("certified_qty"))
        if qty == 0:
            continue
        limit = Decimal(line["max_billable"]) - others[line_id]
        if qty > limit:
            raise Invalid(
                "lines",
                f"{line['line_no']}: only {limit} can be certified on this JMC (approved BOQ qty + client-change "
                "reprints for what the JMC covers, minus what other bills already certified). "
                "Unapproved extra cannot be billed – get it amended first.",
            )
        parsed.append((line_id, qty))
    E9BillLine.objects.filter(bill=bill).delete(soft=False)
    for line_id, qty in parsed:
        E9BillLine.objects.create(
            project=project, workspace_id=project.workspace_id, bill=bill, boq_line_id=line_id, certified_qty=qty
        )


def _check_has_lines(bill):
    if bill.cert_to_accounts_on and not E9BillLine.objects.filter(bill=bill).exists():
        raise Invalid("cert_to_accounts_on", "Add the certified quantities before giving it to Accounts.")


class E9BillListEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        if not _sees_money(request.user, slug, project.id):
            return _forbidden(GUEST_MONEY_MESSAGE)
        return Response(bills_payload(project, request.user, slug))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def post(self, request, slug, project_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        po = E9PurchaseOrder.objects.filter(project=project, pk=uuid_or_none(request.data.get("po"))).first()
        if po is None:
            return Response({"po": "Choose the PO you are billing."}, status=400)
        certs = list(E9Certification.objects.filter(project=project))
        if not certification.billing_open(getattr(project, "e9_profile", None), certs):
            message = "Billing starts after certification. Finish Step 1: mark the JMC as signed."
            return Response({"error": message}, status=400)
        cert = next((c for c in certs if str(c.id) == str(request.data.get("certification") or "") and c.done_on), None)
        if cert is None:
            return Response({"certification": "Choose the signed JMC this bill is for."}, status=400)
        bill = E9Bill(project=project, workspace_id=project.workspace_id, po=po, certification=cert)
        try:
            with transaction.atomic():
                _apply(bill, request.data, BILL_SPEC)
                if cert is not None:
                    bill.cert_number = bill.cert_number or cert.jmc_number
                    bill.cert_signed_on = bill.cert_signed_on or cert.done_on
                _check_bill_order(bill)
                if not bill.title:
                    bill.title = f"Bill {E9Bill.objects.filter(po=po).count() + 1} · {po}"
                bill.save(created_by_id=request.user.id)
                _save_bill_lines(project, bill, request.data.get("lines", []))
                _check_has_lines(bill)
        except Invalid as problem:
            return _bad(problem)
        record(project, request.user, "bill", "created", bill.id, bill.title, new=boq.STAGE_TEXT[boq.bill_stage(bill)])
        return Response(bills_payload(project, request.user, slug), status=201)


class E9BillDetailEndpoint(BaseAPIView):
    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def patch(self, request, slug, project_id, bill_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        bill = E9Bill.objects.filter(project=project, pk=bill_id).first()
        if bill is None:
            return Response({"error": "Bill not found."}, status=404)
        before = snapshot(bill, BILL_FIELDS)
        try:
            with transaction.atomic():
                _apply(bill, request.data, BILL_SPEC)
                _check_bill_order(bill)
                if "lines" in request.data:
                    if boq.bill_stage(bill) >= 1 and before.get("cert_to_accounts_on"):
                        raise Invalid("lines", "The certification is already with Accounts; quantities are locked.")
                    _save_bill_lines(project, bill, request.data["lines"])
                bill.save()
                _check_has_lines(bill)
        except Invalid as problem:
            return _bad(problem)
        record_changes(project, request.user, "bill", bill.id, bill.title, before, snapshot(bill, BILL_FIELDS))
        return Response(bills_payload(project, request.user, slug))

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def delete(self, request, slug, project_id, bill_id):
        project, error = _editable(request, slug, project_id)
        if error:
            return error
        bill = E9Bill.objects.filter(project=project, pk=bill_id).first()
        if bill is None:
            return Response({"error": "Bill not found."}, status=404)
        if boq.bill_stage(bill) >= 2:
            message = "A proforma invoice is raised on this bill, so it cannot be deleted."
            return Response({"error": message}, status=400)
        with transaction.atomic():
            E9BillLine.objects.filter(bill=bill).delete(soft=False)
            record(project, request.user, "bill", "deleted", bill.id, bill.title, old=bill.title)
            bill.delete(soft=False)
        return Response(bills_payload(project, request.user, slug))


# ---------------------------------------------------------------------------
# Company-wide summary: extra over BOQ, waiting confirmations, billing stages
# ---------------------------------------------------------------------------


class E9SummaryEndpoint(BaseAPIView):
    """Billing across all projects. Only projects whose billing is open (JMC signed or part billing allowed)."""

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug):
        projects = list(_visible_projects(request.user, slug).select_related("e9_profile").order_by("name"))
        # a guest on any of these projects sees none of the money: only people who run the tracker see it
        projects = [project for project in projects if _sees_money(request.user, slug, project.id)]
        # a project whose code has not been typed stays out of the company-wide billing list too
        projects = [
            project for project in projects if not is_locked_for(request.user, request.session, slug, project.id)
        ]
        states = certification.project_states(projects)
        rows = []
        for project in projects:
            state, is_open = states[project.id]
            if not is_open:
                continue
            lines, _ = boq.line_rows(project)
            bills = boq.bill_rows(project)
            rows.append(
                {
                    "id": str(project.id),
                    "name": project.name,
                    "identifier": project.identifier,
                    "cert_state": state,
                    "bills": bills,
                    "lines": len(lines),
                    "billable_now": str(sum(_still_to_bill(line) for line in lines)),
                    "certified": str(sum(Decimal(line["certified"]) for line in lines)),
                    "billable_amount": str(
                        sum(
                            (
                                _still_to_bill(line) * Decimal(line["rate"])
                                for line in lines
                                if line["rate"] is not None
                            ),
                            Decimal("0"),
                        ).quantize(Decimal("0.01"))
                    ),
                }
            )
        waiting = [
            {"id": str(project.id), "name": project.name, "identifier": project.identifier}
            for project in projects
            if states[project.id][0] == "jmc_pending"
        ]
        return Response({"projects": rows, "waiting_for_jmc": waiting})
