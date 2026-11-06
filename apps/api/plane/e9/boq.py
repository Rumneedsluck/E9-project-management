# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""BOQ maths: what is allowed, what the tracker has, what is extra, what can be billed.

allowed  = BOQ qty, or the amended qty when the client sent an amended BOQ (+ confirmed amendments)
pending  = quantity asked for by mail but not confirmed yet
on tracker = sum of the tracker rows that carry this BOQ No. (sq ft or Nos, by the line's unit)
extra    = on tracker - allowed            (amber while a pending mail covers it, red otherwise)
billable = min(installed, allowed) + client-change reprints
Reprints caused by our own mistakes are listed, but never billed and never counted as extra.
"""

from collections import defaultdict
from decimal import Decimal

from .models import (
    E9AmendmentStatus,
    E9Bill,
    E9BillLine,
    E9BoqLine,
    E9ReprintCause,
    E9Reprint,
    E9ScopeItem,
)
from . import tracker

ZERO = Decimal("0")
CONFIRMED = E9AmendmentStatus.CONFIRMED
REQUESTED = E9AmendmentStatus.REQUESTED


def norm(value):
    return (value or "").strip().upper()


def is_filled(item):
    return bool(item.floor_area.strip() or item.description.strip() or item.height_in or item.width_in or item.qty)


def measure(item, unit):
    """How much one tracker row counts towards a BOQ line (site-measured size)."""
    return tracker.measured(item, unit)


def q2(value):
    """Money / quantity as text with 2 decimals (what the website shows)."""
    return str((value or ZERO).quantize(Decimal("0.01")))


def bill_stage(bill):
    """0 = nothing yet, 1 = certification done ... 4 = WCC acknowledged (finished)."""
    if not bill.cert_to_accounts_on:
        return 0
    if not (bill.pi_number and bill.pi_date):
        return 1
    if not bill.pi_submitted_on:
        return 2
    if not bill.wcc_acknowledged_on:
        return 3
    return 4


STAGE_TEXT = {
    0: "1 · Certification done – give it to Accounts",
    1: "2 · Proforma invoice – with Accounts",
    2: "3 · PI – waiting for signature & submission",
    3: "4 · Work completion certificate – waiting for acknowledgement",
    4: "Done – WCC acknowledged",
}


def line_rows(project):
    """Every BOQ line of the project with its numbers and status."""
    lines = list(
        E9BoqLine.objects.filter(project=project)
        .select_related("po", "amendment")
        .prefetch_related("amendment_changes__amendment")
        .order_by("po__sort_order", "po__created_at", "sort_order", "created_at")
    )
    items = [item for item in E9ScopeItem.objects.filter(project=project) if is_filled(item)]
    by_no = defaultdict(list)
    for item in items:
        by_no[norm(item.boq_item_no)].append(item)

    reprints = defaultdict(lambda: {"internal": ZERO, "client": ZERO, "extra": ZERO})
    for reprint in E9Reprint.objects.filter(project=project, boq_line__isnull=False):
        if reprint.kind == "extra":
            key = "extra"
        elif reprint.cause == E9ReprintCause.CLIENT:
            key = "client"
        else:
            key = "internal"
        reprints[reprint.boq_line_id][key] += reprint.qty or ZERO

    certified = defaultdict(lambda: ZERO)
    for bill_line in E9BillLine.objects.filter(project=project, bill__deleted_at__isnull=True):
        certified[bill_line.boq_line_id] += bill_line.certified_qty or ZERO

    rows = []
    for line in lines:
        base, pending = ZERO, ZERO
        line_qty = line.amended_qty if line.amended_qty is not None else line.qty
        if line.amendment is None or line.amendment.status == CONFIRMED:
            base = line_qty
        elif line.amendment.status == REQUESTED:
            pending += line_qty
        confirmed_change = ZERO
        for change in line.amendment_changes.all():
            if change.amendment.deleted_at:
                continue
            if change.amendment.status == CONFIRMED:
                confirmed_change += change.qty_change
            elif change.amendment.status == REQUESTED:
                pending += change.qty_change
        allowed = base + confirmed_change
        rows_for_line = by_no.get(norm(line.line_no), [])
        unit = line.unit
        # production size when typed (what we actually send), else the measured size
        on_tracker = sum((tracker.production_measure(item, unit) for item in rows_for_line), ZERO)
        produced = sum(
            (
                tracker.production_measure(item, unit)
                for item in rows_for_line
                if item.production_status == "Production Done"
            ),
            ZERO,
        )
        certified_rows = [tracker.certified_measure(item, unit) for item in rows_for_line]
        certified_on_site = sum((value for value in certified_rows if value is not None), ZERO)
        installed = sum(
            (measure(item, unit) for item in rows_for_line if item.installation_status == "Installation Done"), ZERO
        )
        over = on_tracker - allowed
        if over > 0 and over > pending:
            status = "excess"
        elif over > 0:
            status = "pending"
        else:
            status = "ok"
        client_reprints = reprints[line.id]["client"]
        # after the joint measurement the certified quantity counts; before it, what is installed
        done = certified_on_site if certified_on_site > 0 else installed
        billable_now = min(done, allowed) + client_reprints
        max_billable = allowed + client_reprints
        rows.append(
            {
                "id": str(line.id),
                "po": str(line.po_id),
                "po_label": str(line.po),
                "amendment": str(line.amendment_id) if line.amendment_id else None,
                "amendment_status": line.amendment.status if line.amendment else None,
                "line_no": line.line_no,
                "scope": line.scope,
                "description": line.description,
                "unit": unit,
                "qty": q2(line.qty),
                "amended_qty": q2(line.amended_qty) if line.amended_qty is not None else None,
                "amended_note": line.amended_note,
                "is_amended": (line.amended_qty is not None and line.amended_qty != line.qty) or confirmed_change != 0,
                "rate": q2(line.rate) if line.rate is not None else None,
                "remarks": line.remarks,
                "confirmed_change": q2(confirmed_change),
                "pending": q2(pending),
                "allowed": q2(allowed),
                "on_tracker": q2(on_tracker),
                "produced": q2(produced),
                "installed": q2(installed),
                "extra": q2(max(over, ZERO)),
                "unapproved_extra": q2(max(over - pending, ZERO)),
                "status": status,
                "internal_reprints": q2(reprints[line.id]["internal"]),
                "client_reprints": q2(client_reprints),
                "extras": q2(reprints[line.id]["extra"]),
                "certified_on_site": q2(certified_on_site),
                "billable_now": q2(billable_now),
                "max_billable": q2(max_billable),
                "certified": q2(certified[line.id]),
                "item_ids": [str(item.id) for item in rows_for_line],
            }
        )
    return rows, items


def unlinked_items(project, lines, items, scopes):
    """Tracker rows whose BOQ No. is missing from the BOQ (they are extra until a BOQ line covers them)."""
    known = {norm(line["line_no"]) for line in lines}
    from .services import item_code  # local import: services imports models only

    groups = defaultdict(list)
    for item in items:
        number = norm(item.boq_item_no)
        if number in known:
            continue
        groups[number].append({"id": str(item.id), "code": item_code(item, scopes), "scope": item.scope})
    return [
        {"boq_no": number, "missing": number == "", "items": rows, "count": len(rows)}
        for number, rows in sorted(groups.items())
    ]


def bill_amount(bill):
    """Certified quantity x BOQ rate (the proforma amount when it is typed)."""
    if bill.pi_amount is not None:
        return bill.pi_amount
    return sum(
        (line.certified_qty * line.boq_line.rate for line in bill.lines.all() if line.boq_line.rate is not None),
        ZERO,
    )


def bill_rows(project):
    bills = (
        E9Bill.objects.filter(project=project).select_related("po", "certification").prefetch_related("lines__boq_line")
    )
    return [
        {
            "id": str(bill.id),
            "po": str(bill.po_id),
            "po_label": str(bill.po),
            "title": bill.title,
            "certification_label": str(bill.certification) if bill.certification_id else "",
            "stage": bill_stage(bill),
            "stage_text": STAGE_TEXT[bill_stage(bill)],
            "amount": q2(bill_amount(bill)),
        }
        for bill in bills
    ]
