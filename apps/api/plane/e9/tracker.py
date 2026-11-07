# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The E9 site-tracker rules, taken from the E9_TRACKER_A23 Excel template.

Dropdown words are copied exactly from the template's "Lists" sheet, because
the team (and the dashboard counts) rely on those exact words. Keep this file
in sync with apps/web/components/e9/tracker/constants.ts.
"""

from decimal import ROUND_HALF_UP, Decimal

# scope key -> (label, item-code prefix, unit rule)
#   "sqft": counts in square feet from Height x Width (inches)
#   "nos":  counts in numbers (Qty); Height / Width are notes only
#   "either": square feet when a size is given, otherwise Nos (template rule for Non-Tender / Others)
SCOPES = {
    "wall_graphics": ("Wall Graphics", "W", "sqft"),
    "glass_film": ("Glass Film", "GF", "sqft"),
    "internal_signages": ("Internal Signages", "IS", "nos"),
    "external_signages": ("External Signages", "ES", "nos"),
    "3d_items": ("3D Items", "3D", "nos"),
    "frames": ("Frames", "FR", "nos"),
    "hand_paintings": ("Hand Paintings", "HP", "sqft"),
    "non_tender": ("Non-Tender Items", "NT", "either"),
    "others": ("Others", "OT", "either"),
}

SCOPE_CHOICES = [(key, value[0]) for key, value in SCOPES.items()]

_COMMON_ISSUES_TAIL = ["Size differs from drawing", "Access / permission needed", "Other"]
SITE_ISSUES = {
    "wall_graphics": [
        "No issues",
        "Needs oil primer",
        "Surface unprepared",
        "Existing graphics to be peeled off",
        "Uneven / damaged wall",
        "Obstruction (switch, pipe, fixture)",
        *_COMMON_ISSUES_TAIL,
    ],
    "glass_film": [
        "No issues",
        "Existing film to be peeled off",
        "Glass needs cleaning",
        "Cracked / damaged glass",
        "Obstruction (fixture, blind, furniture)",
        *_COMMON_ISSUES_TAIL,
    ],
    "internal_signages": [
        "No issues",
        "Surface unprepared",
        "Existing signage / graphics to be removed",
        "Obstruction (switch, pipe, fixture)",
        *_COMMON_ISSUES_TAIL,
    ],
    "external_signages": [
        "No issues",
        "Permission / approval needed",
        "Scaffolding / lift required",
        "Power / wiring point not available",
        "Surface unprepared",
        "Existing signage to be removed",
        *_COMMON_ISSUES_TAIL,
    ],
    "hand_paintings": [
        "No issues",
        "Surface unprepared",
        "Needs oil primer / base coat",
        "Existing paint / graphics to be removed",
        "Uneven / damaged wall",
        "Obstruction (switch, pipe, fixture)",
        *_COMMON_ISSUES_TAIL,
    ],
    "frames": [
        "No issues",
        "Wall not suitable for drilling / fixing",
        "Wall surface uneven",
        "Obstruction (switch, pipe, fixture)",
        *_COMMON_ISSUES_TAIL,
    ],
}
# 3D Items, Non-Tender and Others share the Internal Signages list in the template
for _scope in ("3d_items", "non_tender", "others"):
    SITE_ISSUES[_scope] = SITE_ISSUES["internal_signages"]
ALL_SITE_ISSUES = sorted({issue for issues in SITE_ISSUES.values() for issue in issues})
# Scopes the team adds themselves use the general list
GENERIC_SITE_ISSUES = SITE_ISSUES["internal_signages"]


def site_issues_for(scope_key):
    return SITE_ISSUES.get(scope_key, GENERIC_SITE_ISSUES)


FLOOR_STATUS = ["Not Started", "In Progress", "Handed Over"]

SITE_AUDIT_STATUS = ["Not Started", "Visit Scheduled", "Measured", "Re-measure Needed"]
ISSUE_RESOLVED = ["Yes", "No", "N/A"]
PRE_PRESS = ["Not Started", "In Progress", "Artwork received but not sent to production", "Sent for Production"]
PRODUCTION_STATUS = ["Not Started", "In Production", "Production Done"]
MATERIAL_STATUS = ["", "JC Raised", "Partial Received", "Material Received"]  # blank until a JC is raised
QUALITY_CHECK = ["Pending", "Passed", "Needs Revision"]
DISPATCH_STATUS = ["Not Dispatched", "Partially Dispatched", "Dispatched", "Delivered at Site"]
INSTALLATION_STATUS = ["Not Started", "In Progress", "Installation Done"]
CLIENT_SIGN_OFF = ["Pending", "Signed Off", "Rework Required"]
UNIT_OVERRIDE = ["", "sqft", "nos"]


def item_unit(unit_mode, height, width, unit_override=""):
    """'sqft' or 'nos' for an item. unit_mode is the scope's setting: sqft, nos or either."""
    rule = unit_mode if unit_mode in ("sqft", "nos", "either") else "either"
    if rule != "either":
        return rule
    if unit_override in ("sqft", "nos"):
        return unit_override
    return "sqft" if height and width else "nos"


def item_area_sqft(height, width, qty):
    """Total area in sq ft = H x W / 144 x Qty (Qty defaults to 1), rounded to 2 places like the template."""
    if not height or not width:
        return None
    quantity = Decimal(qty) if qty else Decimal(1)
    area = Decimal(height) * Decimal(width) / Decimal(144) * quantity
    return area.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def current_stage(item):
    """The template's 'Current Stage (auto)' formula, checked from the latest stage backwards."""
    if item.client_sign_off == "Signed Off":
        return "Handed Over"
    if item.installation_status == "Installation Done":
        return "Installed"
    if item.installation_status == "In Progress":
        return "Installing"
    if item.dispatch_status == "Delivered at Site":
        return "Delivered at Site"
    if item.dispatch_status in ("Dispatched", "Partially Dispatched"):
        return "Dispatched"
    if item.quality_check == "Passed":
        return "QC Passed"
    if item.material_status == "Material Received":
        return "Material Received"
    if item.material_status == "Partial Received":
        return "Material Partial"
    if item.production_status == "Production Done":
        return "Production Done"
    if item.production_status == "In Production":
        return "In Production"
    if item.material_status == "JC Raised":
        return "Material Ordered"
    if item.pre_press == "Sent for Production":
        return "Sent for Production"
    if item.pre_press == "Artwork received but not sent to production":
        return "Artwork Received"
    if item.pre_press == "In Progress":
        return "In Pre-Press"
    if item.site_audit_status == "Measured":
        return "Measured"
    return "Not Started"


# ---------------------------------------------------------------------------
# Production size, dispatch and certified quantity (template columns P–T, AB–AG, AK–AN)
# ---------------------------------------------------------------------------

DISPATCHED_DONE = ("Dispatched", "Delivered at Site")
REPRINT_REASONS = [
    "File changed by client",
    "Design change",
    "Print defect",
    "Production mistake",
    "Application fault",
    "Wrong size / re-measure",
    "Site not ready",
    "Damaged in transit",
    "Client wants more",
    "Quantity revised by client",
]
SNAG_REASONS = [
    "Scratch / damage",
    "Peeling / bubbles",
    "Wrong size",
    "Colour mismatch",
    "Misaligned / not straight",
    "Missing item",
    "Artwork / spelling error",
    "Damaged by others",
    "Cleaning pending",
    "Fixing / adhesive issue",
    "Other",
]
SNAG_PRIORITY = ["High", "Medium", "Low"]
SNAG_STATUS = ["Open", "In Progress", "Fixed - Awaiting Client", "Closed"]


def split_list(text):
    """'3500, 3501 / 3502' -> ['3500', '3501', '3502']"""
    return [part.strip() for part in (text or "").replace(";", ",").replace("/", ",").split(",") if part.strip()]


def to_decimal(value):
    try:
        number = Decimal(str(value).strip())
        return number.quantize(Decimal("0.01")) if number.is_finite() else None
    except Exception:  # noqa: BLE001 - anything that is not a number counts as blank
        return None


def measured(item, unit):
    """Site-measured quantity: sq ft for sq-ft items, Nos otherwise."""
    if unit == "sqft":
        return item_area_sqft(item.height_in, item.width_in, item.qty) or Decimal(0)
    return Decimal(item.qty) if item.qty else Decimal(1)


def production_measure(item, unit):
    """What we send for production. Uses the production size when typed, else the measured size."""
    if unit == "sqft":
        area = item_area_sqft(item.production_height_in, item.production_width_in, item.production_qty)
        if area is not None:
            return area
        return measured(item, unit)
    if item.production_qty is not None:
        return Decimal(item.production_qty)
    return measured(item, unit)


def wastage(item, unit):
    """Production area minus measured area (only when a production size is typed)."""
    if unit != "sqft":
        return None
    area = item_area_sqft(item.production_height_in, item.production_width_in, item.production_qty)
    if area is None:
        return None
    return (area - measured(item, unit)).quantize(Decimal("0.01"))


def dc_breakdown(item, unit):
    """[(dc number, quantity sent or None)] in the order typed. One DC and no quantity = all of it."""
    dcs = split_list(item.dc_nos)
    quantities = [to_decimal(part) for part in split_list(item.dc_qty)]
    rows = []
    for index, dc in enumerate(dcs):
        qty = quantities[index] if index < len(quantities) else None
        if qty is None and len(dcs) == 1:
            # one DC and no quantity typed: the whole item went on it
            qty = production_measure(item, unit)
        rows.append((dc, qty))
    return rows


def dispatched(item, unit):
    return sum((qty for _, qty in dc_breakdown(item, unit) if qty is not None), Decimal(0))


def balance_to_send(item, unit):
    total = production_measure(item, unit)
    if not total:
        return None
    return max(Decimal(0), total - dispatched(item, unit))


def certified_measure(item, unit):
    """Joint measurement: certified H × W (× Qty) for sq ft, certified Qty for Nos. None if not certified."""
    if unit == "sqft":
        area = item_area_sqft(item.certified_height_in, item.certified_width_in, item.certified_qty)
        if area is not None:
            return area
        return Decimal(item.certified_qty) if item.certified_qty is not None else None
    return Decimal(item.certified_qty) if item.certified_qty is not None else None


def reprint_measure(unit, pieces, height, width):
    """Reprints & Extras 'Qty (BOQ unit)': tile size × pieces for sq ft, pieces for Nos."""
    count = Decimal(pieces) if pieces else Decimal(1)
    if unit == "sqft" and height and width:
        return (Decimal(height) * Decimal(width) / Decimal(144) * count).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    return count


def progress(items, unit_modes):
    """Work done (installed) for a list of tracker rows.

    Sq-ft scopes count area, Nos scopes count quantity, like the Excel dashboard.
    percent: by sq ft when the project has sq-ft rows, otherwise by Nos.
    unit_modes: {scope key: "sqft" | "nos" | "either"}
    """
    totals = {
        "rows": 0,
        "sqft_total": Decimal(0),
        "sqft_done": Decimal(0),
        "nos_total": Decimal(0),
        "nos_done": Decimal(0),
    }
    for item in items:
        if not (item.floor_area.strip() or item.description.strip() or item.height_in or item.width_in or item.qty):
            continue
        mode = unit_modes.get(item.scope) or SCOPES.get(item.scope, ("", "", "either"))[2]
        unit = item_unit(mode, item.height_in, item.width_in, item.unit_override)
        amount = measured(item, unit)
        done = item.installation_status == "Installation Done"
        totals["rows"] += 1
        totals[f"{unit}_total"] += amount
        if done:
            totals[f"{unit}_done"] += amount
    if totals["sqft_total"] > 0:
        percent = totals["sqft_done"] / totals["sqft_total"] * 100
    elif totals["nos_total"] > 0:
        percent = totals["nos_done"] / totals["nos_total"] * 100
    else:
        percent = Decimal(0)
    return {
        "rows": totals["rows"],
        "sqft_total": str(totals["sqft_total"].quantize(Decimal("0.01"))),
        "sqft_done": str(totals["sqft_done"].quantize(Decimal("0.01"))),
        "nos_total": str(totals["nos_total"].quantize(Decimal("0.01"))),
        "nos_done": str(totals["nos_done"].quantize(Decimal("0.01"))),
        "percent": int(percent.quantize(Decimal("1"), rounding=ROUND_HALF_UP)),
    }
