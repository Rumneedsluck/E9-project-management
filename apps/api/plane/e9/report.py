# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hold & cancel lists, the client progress report and the health check (template sheets of the same names).

Rules (same as the Excel template):
  * a held item stays in the totals but shows no progress until it is released
  * a cancelled item leaves every number and sits on the Cancelled list
  * billable follows each row's "Bill when" (Signed off / Delivered); held rows need Bill now = Yes + Production Done
"""

import datetime
from decimal import Decimal

from . import boq, tracker
from .models import E9BoqLine, E9ProjectProfile, E9ScopeItem, E9Snag, E9SnagStatus
from .services import item_code, scope_map

ZERO = Decimal("0")


def _iso(value):
    return value.isoformat() if value else None


def _text(value):
    return str((value or ZERO).quantize(Decimal("0.01")))


def _unit(item, scopes):
    scope = scopes.get(item.scope)
    return tracker.item_unit(scope.unit_mode if scope else "either", item.height_in, item.width_in, item.unit_override)


def _load(project):
    scopes = scope_map(project)
    items = [item for item in E9ScopeItem.objects.filter(project=project) if boq.is_filled(item)]
    codes = {item_code(item, scopes).upper(): item for item in items}
    return scopes, items, codes


def _replacement(item, codes):
    """'ok', 'missing' (nothing typed), 'unknown' (typed code does not exist) or '' (not a replacement)."""
    if item.hold_reason != tracker.REPLACED_REASON:
        return ""
    note = item.replaced_by.strip()
    if not note:
        return "missing"
    return "ok" if note.upper() in codes else "unknown"


def _row(item, scopes, codes, today):
    scope = scopes.get(item.scope)
    held = tracker.is_held(item)
    scope_rule = scope.bill_when if scope else "Signed off"
    return {
        "id": str(item.id),
        "code": item_code(item, scopes),
        "scope": item.scope,
        "scope_label": scope.label if scope else item.scope,
        "floor": item.floor_area,
        "description": item.description,
        "reason": item.hold_reason,
        "since": _iso(item.hold_since),
        "days": (today - item.hold_since).days if held and item.hold_since else None,
        "bill_now": item.bill_now,
        "billable": held and boq.can_bill(item, scope_rule),
        "replaced_by": item.replaced_by,
        "replacement": _replacement(item, codes),
    }


def hold_payload(project):
    scopes, items, codes = _load(project)
    today = datetime.date.today()
    held = [_row(item, scopes, codes, today) for item in items if tracker.is_held(item)]
    cancelled = [_row(item, scopes, codes, today) for item in items if tracker.is_cancelled(item)]
    return {
        "held": held,
        "cancelled": cancelled,
        "billable_held": sum(1 for row in held if row["billable"]),
        "reasons": tracker.HOLD_REASONS,
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

CHECKS = [
    ("over_dispatched", "Over-dispatched items", "The DC quantities add up to more than the production quantity."),
    (
        "no_boq_no",
        "Items with no BOQ No.",
        "Rows with data but no BOQ No. (Non-Tender items are ignored). "
        "They will not appear in the BOQ / Variance totals.",
    ),
    (
        "boq_wrong",
        "BOQ No. wrong",
        "The BOQ No. typed on a row does not exist in the BOQ, or belongs to a different scope.",
    ),
    (
        "replacement",
        "Replacement missing",
        'An item is marked "Item replaced by another scope" but the "Replaced by" box is empty, '
        "or the code typed there does not exist.",
    ),
    (
        "bill_now",
        "Bill now? set but not billable",
        '"Bill now? = Yes" is set on an item that is not On Hold, '
        "or whose Production is not Done yet, so it cannot be billed.",
    ),
]


def health_payload(project):
    scopes, items, codes = _load(project)
    live = [item for item in items if not tracker.is_cancelled(item)]
    boq_scope = {boq.norm(line.line_no): line.scope for line in E9BoqLine.objects.filter(project=project)}
    found = {key: [] for key, _, _ in CHECKS}
    for item in live:
        code = item_code(item, scopes)
        unit = _unit(item, scopes)
        produced = tracker.production_measure(item, unit)
        if item.dc_nos.strip() and tracker.dispatched(item, unit) > produced + Decimal("0.005"):
            found["over_dispatched"].append(
                {"id": str(item.id), "code": code, "note": "Sent more than the production quantity"}
            )
        number = boq.norm(item.boq_item_no)
        if item.scope != "non_tender":
            if not number:
                found["no_boq_no"].append({"id": str(item.id), "code": code, "note": "No BOQ No."})
            elif boq_scope and (number not in boq_scope or (boq_scope[number] and boq_scope[number] != item.scope)):
                found["boq_wrong"].append({"id": str(item.id), "code": code, "note": f"BOQ No. {item.boq_item_no}"})
        if item.hold_status and _replacement(item, codes) in ("missing", "unknown"):
            note = "Replaced by is empty" if not item.replaced_by.strip() else f"No item {item.replaced_by.strip()}"
            found["replacement"].append({"id": str(item.id), "code": code, "note": note})
        if item.bill_now == "Yes" and (not tracker.is_held(item) or item.production_status != "Production Done"):
            found["bill_now"].append({"id": str(item.id), "code": code, "note": "Not on hold, or production not done"})
    checks = [
        {"key": key, "label": label, "meaning": meaning, "count": len(found[key]), "items": found[key][:50]}
        for key, label, meaning in CHECKS
    ]
    return {
        "problems": sum(check["count"] for check in checks),
        "checks": checks,
        "on_hold": sum(1 for item in items if tracker.is_held(item)),
        "cancelled": sum(1 for item in items if tracker.is_cancelled(item)),
    }


# ---------------------------------------------------------------------------
# Client report
# ---------------------------------------------------------------------------

STAGE_DONE = [
    ("Site audit", "target_site_audit", lambda item: item.site_audit_status == "Measured"),
    ("Pre-press", "target_pre_press", lambda item: item.pre_press == "Sent for Production"),
    (
        "Production & material",
        "target_material",
        lambda item: item.production_status == "Production Done" and item.material_status == "Material Received",
    ),
    ("Delivered to site", "target_delivered", lambda item: item.dispatch_status == "Delivered at Site"),
    ("Installation", "target_installation", lambda item: item.installation_status == "Installation Done"),
    ("Client sign-off", "target_sign_off", lambda item: item.client_sign_off == "Signed Off"),
]


def _amount(item, scopes):
    unit = _unit(item, scopes)
    return unit, tracker.measured(item, unit)


def report_payload(project):
    scopes, items, codes = _load(project)
    today = datetime.date.today()
    counted = [item for item in items if not tracker.is_cancelled(item)]
    profile = E9ProjectProfile.objects.filter(project=project).first()
    unit_modes = {key: scope.unit_mode for key, scope in scopes.items()}
    progress = tracker.progress(counted, unit_modes)

    by_scope = []
    for key, scope in scopes.items():
        rows = [item for item in counted if item.scope == key]
        if not scope.enabled and not rows:
            continue
        working = [item for item in rows if tracker.makes_progress(item)]
        sqft = sum((_amount(item, scopes)[1] for item in rows if _unit(item, scopes) == "sqft"), ZERO)
        nos = sum((_amount(item, scopes)[1] for item in rows if _unit(item, scopes) != "sqft"), ZERO)
        installed = [item for item in working if item.installation_status == "Installation Done"]
        by_scope.append(
            {
                "scope": key,
                "label": scope.label,
                "items": len(rows),
                "sqft": _text(sqft),
                "nos": _text(nos),
                "on_hold": sum(1 for item in rows if tracker.is_held(item)),
                "production_done": sum(1 for item in working if item.production_status == "Production Done"),
                "material_received": sum(1 for item in working if item.material_status == "Material Received"),
                "qc_passed": sum(1 for item in working if item.quality_check == "Passed"),
                "delivered": sum(1 for item in working if item.dispatch_status == "Delivered at Site"),
                "installed": len(installed),
                "signed_off": sum(1 for item in working if item.client_sign_off == "Signed Off"),
                "percent": round(len(installed) / len(rows) * 100) if rows else 0,
            }
        )

    stages = []
    for label, field, done in STAGE_DONE:
        target = getattr(profile, field, None) if profile else None
        finished = sum(1 for item in counted if tracker.makes_progress(item) and done(item))
        pending = len(counted) - finished
        state = "Done" if counted and pending == 0 else ("Overdue" if target and target < today else "On track")
        stages.append({"stage": label, "target": _iso(target), "done": finished, "pending": pending, "state": state})

    billable = [
        item for item in counted if boq.can_bill(item, scopes[item.scope].bill_when if item.scope in scopes else "")
    ]
    billable_sqft = sum(
        (boq.billable_measure(item, "sqft") for item in billable if _unit(item, scopes) == "sqft"), ZERO
    )
    billable_nos = sum((boq.billable_measure(item, "nos") for item in billable if _unit(item, scopes) != "sqft"), ZERO)

    open_issues = sum(
        1 for item in counted if item.site_issue not in ("", "No issues") and item.issue_resolved != "Yes"
    )
    open_snags = E9Snag.objects.filter(project=project).exclude(status=E9SnagStatus.CLOSED).count()
    holds = hold_payload(project)
    deadline = profile.deadline if profile else None
    return {
        "project_name": project.name,
        "as_on": today.isoformat(),
        "headline": {
            "items": len(counted),
            "percent_installed": progress["percent"],
            "days_to_deadline": (deadline - today).days if deadline else None,
            "open_site_issues": open_issues,
            "open_snags": open_snags,
            "on_hold": len(holds["held"]),
            "cancelled": len(holds["cancelled"]),
        },
        "by_scope": by_scope,
        "stages": stages,
        "billing": {
            "billable_items": len(billable),
            "of_which_on_hold": sum(1 for item in billable if tracker.is_held(item)),
            "not_billable_yet": len(counted) - len(billable),
            "sqft": _text(billable_sqft),
            "nos": _text(billable_nos),
        },
        "held": holds["held"],
        "cancelled": holds["cancelled"],
    }
