# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Import an E9 Excel tracker (E9_TRACKER_A23 layout) into a project.

Reads "Project Info", the nine scope sheets and the site-visit list. Formulas in
the workbook (item codes, sq ft, current stage) are not needed: the website
works those out itself. Existing values on the project are never overwritten;
only empty fields are filled.
"""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import openpyxl
from django.db import models, transaction

from . import tracker
from .models import E9Attachment, E9ProjectProfile, E9ScopeItem
from .services import ensure_floors, ensure_scopes, record


class ImportProblem(Exception):
    """The file cannot be imported; the message is shown to the person."""


SHEET_TO_SCOPE = {label.lower(): key for key, (label, _prefix, _unit) in tracker.SCOPES.items()}

PROJECT_INFO_FIELDS = {
    "client (company)": "client_name",
    "site address": "site_address",
    "city": "city",
    "client contact (name & phone)": "client_contact",
    "site / facility contact (name & phone)": "site_contact",
    "work order / po no.": "work_order_number",
    "work order date": "work_order_date",
    "project start date": "start_date",
    "final handover deadline": "deadline",
    "site timings / restrictions": "site_timings",
    "1 · site audit complete": "target_site_audit",
    "2 · pre-press done (sent for production)": "target_pre_press",
    "3 · production done & material received": "target_material",
    "4 · delivered to site": "target_delivered",
    "5 · installation complete": "target_installation",
    "6 · client sign-off": "target_sign_off",
}
DATE_FIELDS = {
    "work_order_date",
    "start_date",
    "deadline",
    "target_site_audit",
    "target_pre_press",
    "target_material",
    "target_delivered",
    "target_installation",
    "target_sign_off",
}

# scope-sheet column header (lower case, spaces squeezed, "(auto)" removed) -> item field
COLUMNS = {
    "#": "number",
    "boq item no.": "boq_item_no",
    "floor / area": "floor_area",
    "floor plan (link / ref)": "floor_plan_ref",
    "description": "description",
    "site audit status": "site_audit_status",
    "height (in)": "height_in",
    "width (in)": "width_in",
    "qty (nos.)": "qty",
    "site issue": "site_issue",
    "issue resolved?": "issue_resolved",
    "pre-press": "pre_press",
    "jc no.": "jc_no",
    "production status": "production_status",
    "material status": "material_status",
    "quality check": "quality_check",
    "qc done by": "qc_done_by",
    "dc no(s). (comma-separated)": "dc_nos",
    "dc qty (comma-separated)": "dc_qty",
    "production height (in)": "production_height_in",
    "production width (in)": "production_width_in",
    "production quantity": "production_qty",
    "certified height (in)": "certified_height_in",
    "certified width (in)": "certified_width_in",
    "certified qty (nos)": "certified_qty",
    "dispatch status": "dispatch_status",
    "installation status": "installation_status",
    "installation date": "installation_date",
    "installed by (team)": "installed_by",
    "client sign-off": "client_sign_off",
    "remarks": "remarks",
    "unit": "unit",
}
CHOICES = {
    "site_audit_status": tracker.SITE_AUDIT_STATUS,
    "issue_resolved": tracker.ISSUE_RESOLVED,
    "pre_press": tracker.PRE_PRESS,
    "production_status": tracker.PRODUCTION_STATUS,
    "material_status": tracker.MATERIAL_STATUS,
    "quality_check": tracker.QUALITY_CHECK,
    "dispatch_status": tracker.DISPATCH_STATUS,
    "installation_status": tracker.INSTALLATION_STATUS,
    "client_sign_off": tracker.CLIENT_SIGN_OFF,
}
NUMBER_FIELDS = {
    "height_in",
    "width_in",
    "qty",
    "production_height_in",
    "production_width_in",
    "production_qty",
    "certified_height_in",
    "certified_width_in",
    "certified_qty",
}
TEXT_LIMITS = {
    "boq_item_no": 60,
    "floor_area": 255,
    "floor_plan_ref": 500,
    "jc_no": 60,
    "qc_done_by": 120,
    "dc_nos": 255,
    "dc_qty": 255,
    "installed_by": 255,
}
FILLED_FIELDS = ("floor_area", "description", "height_in", "width_in", "qty")


def _header(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip().lower()
    return text.replace("(auto)", "").strip()


def _text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, (datetime, date)):
        return value.strftime("%d %b %Y")
    return str(value).strip()


def _date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _text(value)
    for pattern in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y", "%d %b %Y", "%d-%b-%y"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None


def _number(value):
    if value in (None, ""):
        return None
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None
    return number if number >= 0 else None


def _read_project_info(workbook, warnings):
    values, visits = {}, []
    if "Project Info" not in workbook.sheetnames:
        warnings.append("No 'Project Info' sheet: project details were not imported.")
        return values, visits, ""
    sheet = workbook["Project Info"]
    coordinator = ""
    in_visits = False
    for row in sheet.iter_rows(min_row=1, max_row=min(sheet.max_row, 80), max_col=6, values_only=True):
        label = _header(row[1] if len(row) > 1 else "")
        if "site audit report" in _header(row[2] if len(row) > 2 else ""):
            in_visits = True  # the header row of the site-visit list
            continue
        if label.startswith("final report link"):
            in_visits = False
        if in_visits:
            name = _text(row[2] if len(row) > 2 else "")
            if label or name:
                visits.append(
                    {
                        "label": _text(row[1])[:120],
                        "name": name[:255],
                        "version": _text(row[3] if len(row) > 3 else "") if len(row) > 3 else "",
                        "sent_on": _date(row[4]) if len(row) > 4 else None,
                    }
                )
            continue
        value = row[2] if len(row) > 2 else None
        if label == "e9 project owner / coordinator":
            coordinator = _text(value)
        field = PROJECT_INFO_FIELDS.get(label)
        if field and value not in (None, ""):
            values[field] = _date(value) if field in DATE_FIELDS else _text(value)
    return values, visits, coordinator


def _read_scope_sheet(sheet, scope_key, warnings):
    header_row = None
    for index, row in enumerate(sheet.iter_rows(min_row=1, max_row=12, values_only=True), start=1):
        if any(_header(cell) == "item code" for cell in row):
            header_row = index
            columns = {position: COLUMNS.get(_header(cell)) for position, cell in enumerate(row)}
            break
    if header_row is None:
        warnings.append(f"'{sheet.title}': header row not found, sheet skipped.")
        return []
    rows = []
    for row in sheet.iter_rows(min_row=header_row + 1, max_row=sheet.max_row, values_only=True):
        values = {}
        for position, cell in enumerate(row):
            field = columns.get(position)
            if field and cell not in (None, ""):
                values[field] = cell
        record_values = {}
        for field, raw in values.items():
            if field in NUMBER_FIELDS:
                number = _number(raw)
                if number is not None:
                    record_values[field] = number
            elif field == "installation_date":
                record_values[field] = _date(raw)
            else:
                record_values[field] = _text(raw)
        if not any(record_values.get(field) not in (None, "") for field in FILLED_FIELDS):
            continue  # empty ready-made row
        rows.append(record_values)
    return rows


def _clean_item(values, scope_key, sheet_title, warnings):
    """Turn one sheet row into E9ScopeItem fields; unknown dropdown words fall back to the default."""
    item = {}
    label = values.get("description") or values.get("floor_area") or ""
    for field, value in values.items():
        if field in ("number", "unit"):
            continue
        if field in CHOICES:
            if value not in CHOICES[field]:
                option = field.replace("_", " ")
                warnings.append(f"{sheet_title} '{label}': '{value}' is not a {option} option, skipped.")
                continue
        if field == "site_issue" and value not in tracker.site_issues_for(scope_key):
            warnings.append(f"{sheet_title} '{label}': site issue '{value}' kept as 'Other'.")
            value = "Other"
        if field in TEXT_LIMITS:
            value = value[: TEXT_LIMITS[field]]
        item[field] = value
    unit = str(values.get("unit", "")).strip().lower().replace(" ", "")
    if unit in ("sqft", "nos"):
        item["unit_override"] = unit
    if item.get("site_issue") and item["site_issue"] != "No issues" and "issue_resolved" not in item:
        item["issue_resolved"] = "No"
    return item


BOQ_COLUMNS = {
    "boq item no.": "line_no",
    "boq item no": "line_no",
    "scope": "scope",
    "description": "description",
    "unit": "unit",
    "boq qty": "qty",
    "remarks": "remarks",
    "rate": "rate",
}


def _read_boq_sheet(workbook, warnings):
    sheet = next((ws for ws in workbook.worksheets if ws.title.strip().lower() == "boq"), None)
    if sheet is None:
        return []
    columns = None
    header_row = None
    for index, row in enumerate(sheet.iter_rows(min_row=1, max_row=12, values_only=True), start=1):
        headers = [_header(cell) for cell in row]
        if "boq item no." in headers or "boq item no" in headers:
            columns = {position: BOQ_COLUMNS.get(header) for position, header in enumerate(headers)}
            header_row = index
            break
    if columns is None:
        warnings.append("'BOQ': header row not found, sheet skipped.")
        return []
    lines = []
    for row in sheet.iter_rows(min_row=header_row + 1, max_row=sheet.max_row, values_only=True):
        values = {columns.get(position): cell for position, cell in enumerate(row) if columns.get(position)}
        line_no = _text(values.get("line_no"))[:60]
        if not line_no or line_no.startswith("="):
            continue
        unit_text = _text(values.get("unit")).lower()
        unit = "sqft" if "sq" in unit_text else "nos"
        if unit_text and "sq" not in unit_text and not unit_text.startswith("no"):
            warnings.append(f"BOQ {line_no}: unit '{values.get('unit')}' is counted as Nos.")
        lines.append(
            {
                "line_no": line_no,
                "scope_label": _text(values.get("scope")),
                "description": _text(values.get("description")),
                "unit": unit,
                "qty": _number(values.get("qty")) or Decimal("0"),
                "rate": _number(values.get("rate")),
                "remarks": _text(values.get("remarks")),
            }
        )
    return lines


def _save_boq(project, lines, scopes, user):
    """Put the BOQ sheet's lines on the project's original PO. Lines already there are left alone."""
    if not lines:
        return 0
    from .models import E9BoqLine, E9POKind, E9PurchaseOrder

    po = E9PurchaseOrder.objects.filter(project=project, kind=E9POKind.ORIGINAL).order_by("created_at").first()
    if po is None:
        po = E9PurchaseOrder(
            project=project, workspace_id=project.workspace_id, kind=E9POKind.ORIGINAL, title="Original BOQ / PO"
        )
        po.save(created_by_id=user.id)
    by_label = {scope.label.lower(): key for key, scope in scopes.items()}
    taken = E9BoqLine.objects.filter(project=project).values_list("line_no", flat=True)
    existing = {line_no.upper() for line_no in taken}
    order = E9BoqLine.objects.filter(project=project).count() * 1000
    added = 0
    for line in lines:
        if line["line_no"].upper() in existing:
            continue
        existing.add(line["line_no"].upper())
        order += 1000
        E9BoqLine(
            project=project,
            workspace_id=project.workspace_id,
            po=po,
            line_no=line["line_no"],
            scope=by_label.get(line["scope_label"].lower(), ""),
            description=line["description"] or line["scope_label"],
            unit=line["unit"],
            qty=line["qty"],
            rate=line["rate"],
            remarks=line["remarks"],
            sort_order=order,
        ).save(created_by_id=user.id)
        added += 1
    return added


# ---------------------------------------------------------------------------
# Reprints & Extras, Snag List, JC Log and DC Log sheets
# ---------------------------------------------------------------------------


def _read_table(workbook, title, must_have, mapping, max_rows=2000):
    """Rows of a log sheet as {field: value}. The header row is the one containing `must_have`."""
    sheet = next((ws for ws in workbook.worksheets if ws.title.strip().lower() == title), None)
    if sheet is None:
        return []
    columns = None
    header_row = 0
    for index, row in enumerate(sheet.iter_rows(min_row=1, max_row=12, values_only=True), start=1):
        headers = [_header(cell) for cell in row]
        if must_have in headers:
            columns = {position: mapping.get(header) for position, header in enumerate(headers)}
            header_row = index
            break
    if columns is None:
        return []
    rows = []
    for row in sheet.iter_rows(
        min_row=header_row + 1, max_row=min(sheet.max_row, header_row + max_rows), values_only=True
    ):
        values = {}
        for position, cell in enumerate(row):
            field = columns.get(position)
            if field and cell not in (None, "") and not (isinstance(cell, str) and cell.startswith("=")):
                values[field] = cell
        if values:
            rows.append(values)
    return rows


REPRINT_COLUMNS = {
    "date": "reprint_date",
    "item code": "code",
    "type": "kind",
    "caused by": "cause",
    "reason": "reason",
    "description": "description",
    "pieces": "pieces",
    "reprint height (in) (tile)": "reprint_height_in",
    "reprint width (in) (tile)": "reprint_width_in",
    "jc no.": "jc_no",
    "approved by client?": "approved",
    "remarks": "remarks",
}
SNAG_COLUMNS = {
    "date raised": "raised_on",
    "item code": "code",
    "snag reason": "reason",
    "snag details": "details",
    "priority": "priority",
    "raised by": "raised_by",
    "assigned to": "assigned_to",
    "target date": "target_date",
    "status": "status",
    "date closed": "closed_on",
    "remarks": "remarks",
}
JC_COLUMNS = {
    "jc no.": "number",
    "jc date": "jc_date",
    "vendor": "vendor",
    "expected date": "expected_date",
    "received?": "received",
    "received date": "received_date",
    "e-proof sent on": "eproof_sent_on",
}
DC_COLUMNS = {
    "dc no.": "number",
    "dc date": "dc_date",
    "dispatched from": "dispatched_from",
    "sent by": "sent_by",
    "vehicle / transporter": "vehicle",
    "invoice no.": "invoice_no",
    "invoice date": "invoice_date",
    "e9 sign-off": "e9_signoff",
    "client sign-off": "client_signoff",
    "client signatory (name)": "client_signatory",
    "status": "status",
    "remarks": "notes",
}
LOG_DATE_FIELDS = {
    "reprint_date",
    "raised_on",
    "target_date",
    "closed_on",
    "jc_date",
    "expected_date",
    "received_date",
    "eproof_sent_on",
    "dc_date",
    "invoice_date",
}


def _clean_row(values):
    out = {}
    for field, raw in values.items():
        if field in LOG_DATE_FIELDS:
            out[field] = _date(raw)
        elif field in ("pieces", "reprint_height_in", "reprint_width_in"):
            out[field] = _number(raw)
        else:
            out[field] = _text(raw)
    return out


def _save_logs(project, workbook, items_by_code, user, warnings, report):
    """Reprints & Extras, Snag List and the typed details of the JC / DC logs."""
    from .models import E9BoqLine, E9Challan, E9JobCard, E9Reprint, E9Snag

    scopes = {scope.key: scope for scope in ensure_scopes(project)}

    def unit_of(item):
        scope = scopes.get(item.scope)
        mode = scope.unit_mode if scope else "either"
        return tracker.item_unit(mode, item.height_in, item.width_in, item.unit_override)

    # Reprints & Extras
    added = 0
    for row in (_clean_row(r) for r in _read_table(workbook, "reprints & extras", "caused by", REPRINT_COLUMNS)):
        code = row.get("code", "").upper()
        item = items_by_code.get(code)
        if not code:
            continue
        if item is None:
            warnings.append(f"Reprints & Extras: item code '{code}' not found, row skipped.")
            continue
        kind = "extra" if row.get("kind", "").lower().startswith("extra") else "reprint"
        cause = {"client": "client", "site": "site"}.get(row.get("cause", "").lower(), "e9")
        height = row.get("reprint_height_in") or item.height_in
        width = row.get("reprint_width_in") or item.width_in
        reprint = E9Reprint(
            project=project,
            workspace_id=project.workspace_id,
            item=item,
            boq_line=E9BoqLine.objects.filter(project=project, line_no__iexact=item.boq_item_no.strip()).first()
            if item.boq_item_no
            else None,
            kind=kind,
            cause=cause,
            reason=row.get("reason", ""),
            description=row.get("description", ""),
            pieces=row.get("pieces"),
            reprint_height_in=row.get("reprint_height_in"),
            reprint_width_in=row.get("reprint_width_in"),
            jc_no=row.get("jc_no", "")[:60],
            approved=row.get("approved", "") if row.get("approved", "") in ("Yes", "Pending", "No") else "",
            remarks=row.get("remarks", ""),
            reprint_date=row.get("reprint_date"),
        )
        reprint.qty = tracker.reprint_measure(unit_of(item), reprint.pieces, height, width)
        reprint.save(created_by_id=user.id)
        added += 1
    report["reprints"] = added

    # Snag List
    added = 0
    for row in (_clean_row(r) for r in _read_table(workbook, "snag list", "snag reason", SNAG_COLUMNS)):
        code = row.get("code", "").upper()
        if not code and not row.get("reason") and not row.get("details"):
            continue  # ready-made row with only the defaults
        item = items_by_code.get(code)
        if code and item is None:
            warnings.append(f"Snag List: item code '{code}' not found, snag kept without an item.")
        status = row.get("status", "Open")
        E9Snag(
            project=project,
            workspace_id=project.workspace_id,
            item=item,
            raised_on=row.get("raised_on"),
            reason=row.get("reason", "")[:80],
            details=row.get("details", ""),
            priority=row.get("priority", "Medium") if row.get("priority") in tracker.SNAG_PRIORITY else "Medium",
            raised_by=row.get("raised_by", "")[:120],
            assigned_to=row.get("assigned_to", "")[:120],
            target_date=row.get("target_date"),
            status=status if status in tracker.SNAG_STATUS else "Open",
            closed_on=row.get("closed_on"),
            remarks=row.get("remarks", ""),
            sort_order=(added + 1) * 1000,
        ).save(created_by_id=user.id)
        added += 1
    report["snags"] = added

    # JC / DC log details (the numbers themselves come from the item rows)
    for title, must, mapping, model, key in (
        ("jc log", "vendor", JC_COLUMNS, E9JobCard, "job_cards"),
        ("dc log", "dispatched from", DC_COLUMNS, E9Challan, "challans"),
    ):
        saved = 0
        for row in (_clean_row(r) for r in _read_table(workbook, title, must, mapping)):
            number = row.pop("number", "").strip()[:60]
            details = {field: value for field, value in row.items() if value not in (None, "")}
            # rows that only carry the template's default words are skipped
            meaningful = {k: v for k, v in details.items() if v not in ("Pending", "Dispatched")}
            if not number or not meaningful:
                continue
            entry = model.objects.filter(project=project, number__iexact=number).first() or model(
                project=project, workspace_id=project.workspace_id, number=number
            )
            for field, value in details.items():
                if field == "received" and value not in ("Pending", "Partly", "Yes", "No"):
                    value = {"partial": "Partly", "received": "Yes"}.get(str(value).lower(), "Pending")
                if field == "status" and value not in ("Dispatched", "Delivered at Site", "Returned"):
                    continue
                if field in ("e9_signoff", "client_signoff") and value not in ("Pending", "Signed", "Returned"):
                    continue
                setattr(entry, field, value[:120] if isinstance(value, str) and field != "notes" else value)
            entry.save(created_by_id=user.id) if entry._state.adding else entry.save()
            saved += 1
        report[key] = saved


def import_tracker(project, upload, user):
    try:
        workbook = openpyxl.load_workbook(upload, data_only=True, read_only=False)
    except Exception as error:  # noqa: BLE001 - any unreadable file gets the same friendly message
        raise ImportProblem("This file could not be read as an Excel tracker (.xlsx).") from error

    warnings = []
    info, visits, coordinator = _read_project_info(workbook, warnings)
    boq_lines = _read_boq_sheet(workbook, warnings)
    sheets = {}
    for sheet in workbook.worksheets:
        scope_key = SHEET_TO_SCOPE.get(sheet.title.strip().lower())
        if scope_key:
            sheets[scope_key] = (sheet.title, _read_scope_sheet(sheet, scope_key, warnings))
    if not sheets:
        raise ImportProblem("No scope sheets (Wall Graphics, Glass Film, ...) were found in this file.")

    report = {"items": {}, "floors": [], "project_fields": [], "site_visits": 0, "coordinator": coordinator}
    with transaction.atomic():
        scopes = {scope.key: scope for scope in ensure_scopes(project, enabled_keys=set(), user=user)}

        # Project info: fill only empty fields
        profile = E9ProjectProfile.all_objects.filter(project=project).first()
        if profile is None:
            profile = E9ProjectProfile(project=project, workspace_id=project.workspace_id)
        profile.deleted_at = None
        for field, value in info.items():
            if value not in (None, "") and getattr(profile, field) in (None, ""):
                setattr(profile, field, value)
                report["project_fields"].append(field)
        profile.save(created_by_id=user.id) if profile._state.adding else profile.save()

        floors = []
        for scope_key, (title, rows) in sheets.items():
            if not rows:
                continue
            scope = scopes[scope_key]
            if not scope.enabled:
                scope.enabled = True
                scope.save()
            existing = E9ScopeItem.all_objects.filter(project=project, scope=scope_key)
            taken = set(existing.values_list("item_number", flat=True))
            next_number = (existing.aggregate(models.Max("item_number"))["item_number__max"] or 0) + 1
            order = existing.aggregate(models.Max("sort_order"))["sort_order__max"] or 0
            created = []
            for position, values in enumerate(rows, start=1):
                number = values.get("number")
                try:
                    number = int(number)
                except (TypeError, ValueError):
                    number = position
                if number < 1 or number in taken:
                    number = max(next_number, max(taken, default=0) + 1)
                taken.add(number)
                next_number = max(next_number, number + 1)
                order += 1000
                fields = _clean_item(values, scope_key, title, warnings)
                created.append(
                    E9ScopeItem(
                        project=project,
                        workspace_id=project.workspace_id,
                        scope=scope_key,
                        item_number=number,
                        sort_order=order,
                        created_by_id=user.id,
                        **fields,
                    )
                )
                if fields.get("floor_area"):
                    floors.append(fields["floor_area"])
            E9ScopeItem.objects.bulk_create(created)
            report["items"][scope.label] = len(created)

        report["floors"] = [floor.name for floor in ensure_floors(project, floors, user)]

        for visit in visits:
            name = visit["name"]
            E9Attachment(
                project=project,
                workspace_id=project.workspace_id,
                kind="site_audit",
                name="" if name.startswith("http") else name,
                link=name if name.startswith("http") else "",
                label=visit["label"],
                version=visit["version"] if visit["version"] in ("Draft", "Final") else "",
                sent_on=visit["sent_on"],
            ).save(created_by_id=user.id)
            report["site_visits"] += 1

        report["boq_lines"] = _save_boq(project, boq_lines, scopes, user)

        from .services import item_code

        items_by_code = {item_code(item, scopes).upper(): item for item in E9ScopeItem.objects.filter(project=project)}
        _save_logs(project, workbook, items_by_code, user, warnings, report)

        total = sum(report["items"].values())
        record(
            project,
            user,
            "import",
            "imported",
            None,
            getattr(upload, "name", "Excel tracker"),
            new=(
                f"{total} item(s), {len(report['floors'])} floor(s), {report['site_visits']} site visit(s), "
                f"{report['boq_lines']} BOQ line(s)"
            ),
        )
    report["warnings"] = warnings[:50]
    return report
