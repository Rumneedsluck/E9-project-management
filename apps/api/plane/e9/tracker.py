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
