# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared helpers for the E9 tracker: project scopes, floors and the change history."""

import re
from datetime import date, datetime
from decimal import Decimal

from django.utils.text import slugify

from . import tracker
from .models import E9ChangeLog, E9Floor, E9ProjectScope, E9ScopeItem, E9ScopeTemplate

# ---------------------------------------------------------------------------
# Scopes
# ---------------------------------------------------------------------------


def ensure_scopes(project, enabled_keys=None, user=None):
    """Make sure the project has its scope rows; create the 9 standard ones the first time.

    enabled_keys: which standard scopes to switch on (None = all of them, used for
    projects that existed before scopes could be chosen). Scopes that already have
    items are always switched on.
    """
    existing = list(E9ProjectScope.objects.filter(project=project))
    if existing:
        return existing
    used = set(E9ScopeItem.objects.filter(project=project).values_list("scope", flat=True))
    rows = []
    for order, (key, (label, prefix, unit)) in enumerate(tracker.SCOPES.items()):
        enabled = True if enabled_keys is None else (key in enabled_keys or key in used)
        rows.append(
            E9ProjectScope(
                project=project,
                workspace_id=project.workspace_id,
                key=key,
                label=label,
                prefix=prefix,
                unit_mode=unit,
                is_standard=True,
                enabled=enabled,
                sort_order=(order + 1) * 1000,
                created_by_id=getattr(user, "id", None),
            )
        )
    # several requests can open a brand-new project at the same moment; the loser must not fail
    E9ProjectScope.objects.bulk_create(rows, ignore_conflicts=True)
    return list(E9ProjectScope.objects.filter(project=project))


def scope_map(project):
    """{scope key: E9ProjectScope} for every scope of the project (enabled or not)."""
    return {scope.key: scope for scope in ensure_scopes(project)}


def new_scope_key(project, label):
    base = "custom_" + (slugify(label).replace("-", "_")[:28] or "scope")
    key, counter = base, 2
    taken = set(E9ProjectScope.all_objects.filter(project=project).values_list("key", flat=True))
    while key in taken:
        key = f"{base[:30]}_{counter}"
        counter += 1
    return key


PREFIX_PATTERN = re.compile(r"^[A-Z0-9]{1,6}$")

# how the team works a scope (shown on its sheet, carried in the company scope list)
NOTE_FIELDS = ("measure_note", "production_note", "notes")
NOTE_LIMIT = 2000


def save_scope_template(workspace_id, scope, user=None):
    """Keep the company list in step with a scope the team added: same name = same entry (any capitals)."""
    template = E9ScopeTemplate.objects.filter(workspace_id=workspace_id, label__iexact=scope.label).first()
    if template is None:
        template = E9ScopeTemplate(workspace_id=workspace_id, label=scope.label)
    template.label = scope.label
    template.prefix = scope.prefix
    template.unit_mode = scope.unit_mode
    template.size_unit = scope.size_unit
    template.bill_when = scope.bill_when
    for field in NOTE_FIELDS:
        setattr(template, field, getattr(scope, field))
    if template._state.adding:
        template.save(created_by_id=getattr(user, "id", None))
    else:
        template.save()
    return template


# ---------------------------------------------------------------------------
# Floors
# ---------------------------------------------------------------------------


def split_floors(text):
    """'7th Floor, 8th Floor' -> ['7th Floor', '8th Floor']: one item can sit on several floors."""
    return [part.strip() for part in re.split(r"[;,]", text or "") if part.strip()]


def ensure_floors(project, names, user=None):
    """Create floor rows for any of these names the project does not have yet (keeps first-seen order)."""
    names = [name.strip() for name in names if name and name.strip()]
    if not names:
        return []
    # "7th Floor" and "7th floor" are the same floor
    existing = {floor.name.strip().lower() for floor in E9Floor.objects.filter(project=project)}
    last = E9Floor.objects.filter(project=project).order_by("-sort_order").values_list("sort_order", flat=True).first()
    order = (last or 0) + 1000
    created = []
    seen = set()
    for name in names:
        key = name.lower()
        if key in existing or key in seen:
            continue
        seen.add(key)
        created.append(
            E9Floor(
                project=project,
                workspace_id=project.workspace_id,
                name=name,
                sort_order=order,
                created_by_id=getattr(user, "id", None),
            )
        )
        order += 1000
    E9Floor.objects.bulk_create(created, ignore_conflicts=True)
    return created


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

FIELD_LABELS = {
    # items
    "boq_item_no": "BOQ item no.",
    "floor_area": "Floor / area",
    "floor_plan_ref": "Floor plan",
    "description": "Description",
    "site_audit_status": "Site audit",
    "height_in": "Height (in)",
    "width_in": "Width (in)",
    "qty": "Qty",
    "unit_override": "Count in",
    "photo_link": "Photo link",
    "site_issue": "Site issue",
    "issue_resolved": "Issue resolved?",
    "pre_press": "Pre-press",
    "jc_no": "JC No.",
    "production_status": "Production",
    "material_status": "Material",
    "quality_check": "Quality check",
    "qc_done_by": "QC done by",
    "dc_nos": "DC No(s).",
    "dispatch_status": "Dispatch",
    "installation_status": "Installation",
    "installation_date": "Installation date",
    "installed_by": "Installed by",
    "client_sign_off": "Client sign-off",
    "remarks": "Remarks",
    # project info
    "client_name": "Client",
    "site_address": "Site address",
    "city": "City",
    "work_order_number": "Work order / PO no.",
    "status": "Project stage",
    "priority": "Priority",
    "start_date": "Start date",
    "deadline": "Handover deadline",
    "client_contact": "Client contact",
    "site_contact": "Site contact",
    "work_order_date": "Work order date",
    "site_timings": "Site timings",
    "target_site_audit": "Target: site audit",
    "target_pre_press": "Target: pre-press",
    "target_material": "Target: material received",
    "target_delivered": "Target: delivered to site",
    "target_installation": "Target: installation",
    "target_sign_off": "Target: client sign-off",
    "hidden_columns": "Hidden columns",
    # scopes / floors
    "label": "Name",
    "prefix": "Code prefix",
    "unit_mode": "Measured as",
    "enabled": "On this project",
    "name": "Name",
    "target_date": "Target date",
    "notes": "Notes",
    "version": "Version",
    "sent_on": "Sent to pre-press on",
}


def as_text(value):
    """How a value is written in the history."""
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, Decimal):
        return format(value.normalize(), "f") if value == value.to_integral() else str(value.normalize())
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return ", ".join(as_text(entry) for entry in value)
    return str(value)


FIELD_LABELS.update(
    {
        "jmc_number": "JMC no.",
        "jmc_date": "JMC (measurement) date",
        "done_on": "JMC signed on",
        "allow_part_billing": "Part billing allowed",
        "amended_qty": "Amended qty",
        "amended_note": "Amended BOQ ref",
    }
)
FIELD_LABELS.update(
    {
        "line_no": "BOQ Item No.",
        "unit": "Unit",
        "rate": "Rate",
        "number": "Number",
        "po_date": "PO date",
        "link": "Link",
        "reference": "Reference",
        "requested_on": "Mail received on",
        "confirmed_on": "Confirmed on",
        "mail_link": "Mail link",
        "changes": "Quantity changes",
        "cause": "Caused by",
        "reason": "Reason",
        "reprint_date": "Reprint date",
        "jc_date": "JC date",
        "vendor": "Vendor",
        "expected_date": "Expected date",
        "received": "Received?",
        "received_date": "Received date",
        "eproof_sent_on": "E-proof sent on",
        "dc_date": "DC date",
        "dispatched_from": "Dispatched from",
        "sent_by": "Sent by",
        "vehicle": "Vehicle / transporter",
        "invoice_no": "Invoice no.",
        "invoice_date": "Invoice date",
        "e9_signoff": "E9 sign-off",
        "client_signoff": "Client sign-off",
        "cert_number": "Certification no.",
        "cert_signed_on": "Certification signed by client",
        "cert_to_accounts_on": "Given to Accounts",
        "pi_number": "PI no.",
        "pi_date": "PI date",
        "pi_amount": "PI amount",
        "pi_signed_on": "PI signed",
        "pi_submitted_on": "PI submitted",
        "wcc_number": "WCC no.",
        "wcc_date": "WCC date",
        "wcc_acknowledged_on": "WCC acknowledged",
        "production_height_in": "Production height",
        "production_width_in": "Production width",
        "production_qty": "Production qty",
        "dc_qty": "DC qty",
        "certified_height_in": "Certified height",
        "certified_width_in": "Certified width",
        "certified_qty": "Certified qty",
        "kind": "Type",
        "pieces": "Pieces",
        "reprint_height_in": "Reprint height",
        "reprint_width_in": "Reprint width",
        "approved": "Approved by client",
        "raised_on": "Date raised",
        "details": "Snag details",
        "priority": "Priority",
        "raised_by": "Raised by",
        "assigned_to": "Assigned to",
        "closed_on": "Date closed",
        "client_signatory": "Client signatory",
    }
)

# The same field name means something else on a floor / a scope
ENTITY_FIELD_LABELS = {
    ("floor", "status"): "Floor status",
    ("floor", "name"): "Floor name",
    ("scope", "label"): "Scope name",
    ("scope", "prefix"): "Code prefix",
    ("boq", "qty"): "BOQ qty",
    ("reprint", "qty"): "Reprint qty",
    ("snag", "status"): "Snag status",
    ("snag", "reason"): "Snag reason",
    ("dc", "status"): "DC status",
    ("po", "title"): "PO name",
}


def field_label(entity, field):
    if not field:
        return ""
    return ENTITY_FIELD_LABELS.get((entity, field)) or FIELD_LABELS.get(field, field.replace("_", " ").capitalize())


def record(project, user, entity, action, entity_id=None, label="", field="", old="", new=""):
    return E9ChangeLog.objects.create(
        project=project,
        workspace_id=project.workspace_id,
        entity=entity,
        entity_id=entity_id,
        entity_label=label[:255],
        action=action,
        field=field,
        field_label=field_label(entity, field),
        old_value=as_text(old),
        new_value=as_text(new),
        created_by_id=getattr(user, "id", None),
    )


def record_changes(project, user, entity, entity_id, label, before, after):
    """One history line per field whose value changed."""
    rows = []
    for field, new_value in after.items():
        old_value = before.get(field)
        if as_text(old_value) == as_text(new_value):
            continue
        rows.append(
            E9ChangeLog(
                project=project,
                workspace_id=project.workspace_id,
                entity=entity,
                entity_id=entity_id,
                entity_label=label[:255],
                action="updated",
                field=field,
                field_label=field_label(entity, field),
                old_value=as_text(old_value),
                new_value=as_text(new_value),
                created_by_id=getattr(user, "id", None),
            )
        )
    E9ChangeLog.objects.bulk_create(rows)
    return rows


def snapshot(instance, fields):
    return {field: getattr(instance, field) for field in fields}


def link_parts(item):
    """Attach item._parts / item._parent from the rows next to it, for responses about ONE row.

    (A list of rows uses tracker.fold_parts instead.)
    """
    from .tracker import fold_parts

    rows = list(E9ScopeItem.objects.filter(project=item.project, scope=item.scope))
    fold_parts(rows)
    for row in rows:
        if row.id == item.id:
            item._parts = getattr(row, "_parts", [])
            if getattr(row, "_parent", None) is not None:
                item._parent = row._parent
                # the response must show the freshly saved row, not the copy loaded above
                row._parent._parts[row._parent._parts.index(row)] = item
            break
    return item


def item_code(item, scopes):
    scope = scopes.get(item.scope)
    prefix = scope.prefix if scope else tracker.SCOPES.get(item.scope, ("", "?"))[1]
    return f"{prefix}{item.item_number}"


PARKED_FROM = 5_000_000
# part rows keep a hidden number here, so they never use up a W-number (W1, part, W2 ...)
PART_FROM = 2_000_000


def park_item(item):
    """Delete a tracker row so it can be brought back: hidden (deleted_at) and given a spare number."""
    from django.db.models import Max
    from django.utils import timezone

    highest = (
        E9ScopeItem.all_objects.filter(project_id=item.project_id, scope=item.scope).aggregate(top=Max("item_number"))[
            "top"
        ]
        or 0
    )
    E9ScopeItem.all_objects.filter(pk=item.pk).update(
        deleted_at=timezone.now(), item_number=max(highest, PARKED_FROM) + 1
    )


def renumber_scope(project, scope_key, user=None):
    """Close the gaps after rows are deleted: W1, W2, W3… in the order the rows are shown.

    Returns how many codes changed. Rows are matched to photos, history and BOQ by id,
    so only the visible code changes.
    """
    from django.db.models import F

    # rows put aside by a delete keep a number of PARKED_FROM or more, out of the way
    rows = list(E9ScopeItem.objects.filter(project=project, scope=scope_key).order_by("sort_order", "item_number"))
    # real items are W1, W2, W3... in sheet order; a part (not the first row) takes a hidden number instead
    wanted = {}
    items_seen = parts_seen = 0
    for row in rows:
        if row.is_part and items_seen:
            parts_seen += 1
            wanted[row.id] = PART_FROM + parts_seen
        else:
            items_seen += 1
            wanted[row.id] = items_seen
    changed = [row for row in rows if row.item_number != wanted[row.id]]
    if not changed:
        return 0
    ids = [row.id for row in changed]
    # "Replaced by" is the one place a typed item code is stored: rewrite codes that moved (old code -> new code)
    scope = scope_map(project).get(scope_key)
    prefix = scope.prefix if scope else tracker.SCOPES.get(scope_key, ("", "?"))[1]
    moved_codes = {
        f"{prefix}{row.item_number}".upper(): f"{prefix}{wanted[row.id]}"
        for row in changed
        if row.item_number < PART_FROM and wanted[row.id] < PART_FROM
    }
    # two steps so no two rows ever share a number on the way
    E9ScopeItem.objects.filter(id__in=ids).update(item_number=F("item_number") + 1_000_000)
    for row in changed:
        E9ScopeItem.objects.filter(id=row.id).update(item_number=wanted[row.id])
    if moved_codes:
        for other in E9ScopeItem.objects.filter(project=project).exclude(replaced_by=""):
            new_code = moved_codes.get(other.replaced_by.strip().upper())
            if new_code:
                E9ScopeItem.objects.filter(id=other.id).update(replaced_by=new_code)
    return len(changed)


def reorder_scope(project, scope_key, ordered_ids, user=None):
    """Put the rows of one scope in this order (ids not listed keep their relative order, at the end),
    then renumber so the codes follow the new order. Returns how many codes changed."""
    rows = list(E9ScopeItem.objects.filter(project=project, scope=scope_key).order_by("sort_order", "item_number"))
    known = {row.id: row for row in rows}
    first = [known[row_id] for row_id in ordered_ids if row_id in known]
    listed = {row.id for row in first}
    final = first + [row for row in rows if row.id not in listed]
    changed = []
    for index, row in enumerate(final, start=1):
        wanted = float(index * 1000)
        if row.sort_order != wanted:
            row.sort_order = wanted
            changed.append(row)
    if changed:
        E9ScopeItem.objects.bulk_update(changed, ["sort_order"])
    return renumber_scope(project, scope_key, user)
