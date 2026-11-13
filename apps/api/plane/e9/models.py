# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.db.models import Q

from plane.db.models.base import BaseModel

from . import tracker


class E9ProjectStatus(models.TextChoices):
    """Where an awarded signage/branding job currently is.

    Mirrors the stages used in the E9 project trackers:
    site audit -> pre-press -> production & material -> delivery -> installation -> client sign-off.
    """

    AWARDED = "awarded", "Awarded"
    SITE_AUDIT = "site_audit", "Site Audit"
    PRE_PRESS = "pre_press", "Pre-Press"
    PRODUCTION = "production", "Production & Material"
    DELIVERY = "delivery", "Delivery"
    INSTALLATION = "installation", "Installation"
    SIGN_OFF = "sign_off", "Client Sign-off"
    COMPLETED = "completed", "Completed"
    ON_HOLD = "on_hold", "On Hold"


class E9ProjectPriority(models.TextChoices):
    HIGH = "high", "High"
    MEDIUM = "medium", "Medium"
    LOW = "low", "Low"


# Columns the team never uses: hidden on every project (anyone can show them again from the Columns button)
DEFAULT_HIDDEN_COLUMNS = ["current_stage", "qc_done_by", "installed_by"]


def default_hidden_columns():
    return list(DEFAULT_HIDDEN_COLUMNS)


class E9ProjectProfile(BaseModel):
    """E9 business details attached to a Plane project (one profile per project).

    Plane's own Project still owns the name, code, description, coordinator
    (project_lead) and team (project members). This table only adds what Plane
    does not have: client, site, status, priority and dates.
    """

    project = models.OneToOneField("db.Project", on_delete=models.CASCADE, related_name="e9_profile")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_project_profiles")
    client_name = models.CharField(max_length=255, blank=True, default="")
    site_address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    work_order_number = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(max_length=32, choices=E9ProjectStatus.choices, default=E9ProjectStatus.AWARDED)
    priority = models.CharField(max_length=16, choices=E9ProjectPriority.choices, default=E9ProjectPriority.MEDIUM)
    start_date = models.DateField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True, help_text="Final handover deadline")
    # Project Info (from the tracker template)
    client_contact = models.CharField(max_length=255, blank=True, default="")
    site_contact = models.CharField(max_length=255, blank=True, default="")
    work_order_date = models.DateField(null=True, blank=True)
    site_timings = models.TextField(blank=True, default="", help_text="Site timings / restrictions")
    # Stage target dates: drive the red "overdue" highlighting on the tracker
    target_site_audit = models.DateField(null=True, blank=True)
    target_pre_press = models.DateField(null=True, blank=True)
    target_material = models.DateField(null=True, blank=True)
    target_delivered = models.DateField(null=True, blank=True)
    target_installation = models.DateField(null=True, blank=True)
    target_sign_off = models.DateField(null=True, blank=True)
    # Tracker columns this project does not use (their data is kept)
    hidden_columns = models.JSONField(default=default_hidden_columns, blank=True)
    # Billing normally waits for the signed JMC; an admin can open it early for running bills
    allow_part_billing = models.BooleanField(default=False)

    class Meta:
        verbose_name = "E9 Project Profile"
        verbose_name_plural = "E9 Project Profiles"
        db_table = "e9_project_profiles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"E9 profile <{self.project_id}>"


def _choices(values):
    return [(value, value or "—") for value in values]


class E9ScopeItem(BaseModel):
    """One row on a tracker scope sheet (a wall, a glass panel, a signage, a frame...)."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_scope_items")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_scope_items")
    # key of one of the project's E9ProjectScope rows (standard like "wall_graphics", or a custom one)
    scope = models.CharField(max_length=40)
    item_number = models.PositiveIntegerField(help_text="W1 -> 1. Never reused within a project and scope.")
    sort_order = models.FloatField(default=65535)
    # A wall made of several pieces stays ONE item: the extra pieces are "part" rows. A part belongs to the
    # nearest non-part row above it, is not counted as an item and takes no W-number.
    is_part = models.BooleanField(default=False)

    # Item details
    boq_item_no = models.CharField(max_length=60, blank=True, default="")
    floor_area = models.CharField(max_length=255, blank=True, default="")
    floor_plan_ref = models.CharField(max_length=500, blank=True, default="")
    description = models.TextField(blank=True, default="")
    # 1 · Site audit
    site_audit_status = models.CharField(
        max_length=40, choices=_choices(tracker.SITE_AUDIT_STATUS), default="Not Started"
    )
    height_in = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    width_in = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    qty = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    unit_override = models.CharField(max_length=8, choices=_choices(tracker.UNIT_OVERRIDE), blank=True, default="")
    photo_link = models.CharField(max_length=1000, blank=True, default="")
    site_issue = models.CharField(max_length=80, choices=_choices(tracker.ALL_SITE_ISSUES), default="No issues")
    issue_resolved = models.CharField(max_length=8, choices=_choices(tracker.ISSUE_RESOLVED), default="N/A")
    # 2 · Pre-press
    pre_press = models.CharField(max_length=60, choices=_choices(tracker.PRE_PRESS), default="Not Started")
    jc_no = models.CharField(max_length=60, blank=True, default="")
    # Production size (what we send) – blank = same as the measured size
    production_height_in = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    production_width_in = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    production_qty = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    # 3 · Production & material
    production_status = models.CharField(
        max_length=40, choices=_choices(tracker.PRODUCTION_STATUS), default="Not Started"
    )
    material_status = models.CharField(max_length=40, choices=_choices(tracker.MATERIAL_STATUS), blank=True, default="")
    # 4 · Quality & dispatch
    quality_check = models.CharField(max_length=40, choices=_choices(tracker.QUALITY_CHECK), default="Pending")
    qc_done_by = models.CharField(max_length=120, blank=True, default="")
    dc_nos = models.CharField(max_length=255, blank=True, default="", help_text="Comma-separated DC numbers")
    dc_qty = models.CharField(
        max_length=255, blank=True, default="", help_text="Quantity sent on each DC, same order as DC numbers"
    )
    dispatch_status = models.CharField(
        max_length=40, choices=_choices(tracker.DISPATCH_STATUS), default="Not Dispatched"
    )
    # 5 · Installation
    installation_status = models.CharField(
        max_length=40, choices=_choices(tracker.INSTALLATION_STATUS), default="Not Started"
    )
    installation_date = models.DateField(null=True, blank=True)
    installed_by = models.CharField(max_length=255, blank=True, default="")
    # Certified (joint measurement)
    certified_height_in = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    certified_width_in = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    certified_qty = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    # 6 · Handover
    client_sign_off = models.CharField(max_length=40, choices=_choices(tracker.CLIENT_SIGN_OFF), default="Pending")
    remarks = models.TextField(blank=True, default="")
    # On hold / cancelled / billing. Held items stay in the totals but add no progress;
    # cancelled ones leave every number.
    hold_status = models.CharField(max_length=12, choices=_choices(tracker.HOLD_STATUS), blank=True, default="")
    hold_reason = models.CharField(max_length=80, blank=True, default="")
    hold_since = models.DateField(null=True, blank=True)
    replaced_by = models.CharField(max_length=255, blank=True, default="", help_text="Item code / note")
    bill_now = models.CharField(
        max_length=3, choices=_choices(tracker.BILL_NOW), blank=True, default="", help_text="Held item billed now?"
    )
    bill_when = models.CharField(
        max_length=12,
        choices=_choices(tracker.BILL_WHEN),
        blank=True,
        default="",
        help_text="Signed off / Delivered. Blank = the scope's setting.",
    )

    class Meta:
        verbose_name = "E9 Scope Item"
        verbose_name_plural = "E9 Scope Items"
        db_table = "e9_scope_items"
        ordering = ("scope", "sort_order", "item_number")
        indexes = [models.Index(fields=["project", "scope"], name="e9_item_project_scope_idx")]
        constraints = [
            models.UniqueConstraint(fields=["project", "scope", "item_number"], name="e9_item_unique_code_per_project")
        ]

    def __str__(self):
        return f"{self.scope} #{self.item_number}"

    @property
    def area_sqft(self):
        own = tracker.item_area_sqft(self.height_in, self.width_in, self.qty)
        areas = [
            own,
            *(tracker.item_area_sqft(part.height_in, part.width_in, part.qty) for part in tracker.parts_of(self)),
        ]
        typed = [area for area in areas if area is not None]
        return sum(typed, Decimal(0)) if typed else None

    @property
    def current_stage(self):
        return tracker.current_stage(self)


class E9UnitMode(models.TextChoices):
    SQFT = "sqft", "Size (H x W -> sq ft)"
    NOS = "nos", "Numbers only (Nos)"
    EITHER = "either", "Either (sq ft if a size is typed, else Nos)"


class E9ProjectScope(BaseModel):
    """A scope sheet that a project uses: one of the 9 standard ones, or one the team added."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_scopes")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_scopes")
    key = models.CharField(max_length=40)
    label = models.CharField(max_length=80)
    prefix = models.CharField(max_length=6, help_text="Item code prefix, e.g. W -> W1, W2")
    unit_mode = models.CharField(max_length=8, choices=E9UnitMode.choices, default=E9UnitMode.SQFT)
    # What the Height / Width columns of this sheet are typed in. Stored data is always inches.
    size_unit = models.CharField(max_length=4, choices=tracker.SIZE_UNIT_CHOICES, default="in")
    is_standard = models.BooleanField(default=False)
    enabled = models.BooleanField(default=True)
    sort_order = models.FloatField(default=65535)
    bill_when = models.CharField(
        max_length=12,
        choices=_choices(tracker.SCOPE_BILL_WHEN),
        default="Signed off",
        help_text="When items of this scope can be billed: Signed off or Delivered",
    )

    class Meta:
        verbose_name = "E9 Project Scope"
        verbose_name_plural = "E9 Project Scopes"
        db_table = "e9_project_scopes"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "key"], condition=Q(deleted_at__isnull=True), name="e9_scope_unique_key"
            ),
            models.UniqueConstraint(
                fields=["project", "prefix"], condition=Q(deleted_at__isnull=True), name="e9_scope_unique_prefix"
            ),
        ]

    def __str__(self):
        return f"{self.label} <{self.project_id}>"


class E9FloorStatus(models.TextChoices):
    NOT_STARTED = "Not Started", "Not Started"
    IN_PROGRESS = "In Progress", "In Progress"
    HANDED_OVER = "Handed Over", "Handed Over"


class E9Floor(BaseModel):
    """A floor / area of the site. Items are grouped by it for floor-wise totals."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_floors")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_floors")
    name = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)
    status = models.CharField(max_length=20, choices=E9FloorStatus.choices, default=E9FloorStatus.NOT_STARTED)
    target_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "E9 Floor"
        verbose_name_plural = "E9 Floors"
        db_table = "e9_floors"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"], condition=Q(deleted_at__isnull=True), name="e9_floor_unique_name"
            )
        ]

    def __str__(self):
        return self.name


def e9_upload_root():
    """Where uploaded photos and PDFs are kept (outside the code, never committed to git)."""
    return getattr(
        settings,
        "E9_UPLOAD_ROOT",
        os.environ.get("E9_UPLOAD_ROOT") or os.path.join(os.path.dirname(settings.BASE_DIR), "e9_uploads"),
    )


def e9_storage():
    return FileSystemStorage(location=e9_upload_root())


def e9_upload_path(instance, filename):
    extension = os.path.splitext(filename)[1].lower()[:10]
    return f"{instance.project_id}/{uuid.uuid4().hex}{extension}"


class E9AttachmentKind(models.TextChoices):
    PHOTO = "photo", "Photo"
    SITE_AUDIT = "site_audit", "Site audit report"
    DC_SCAN = "dc_scan", "Signed DC"
    DOCUMENT = "document", "Document"
    PO = "po", "PO / BOQ document"
    MAIL = "mail", "Client mail / approval"
    CERTIFICATE = "certificate", "Signed certification sheet"
    PI = "pi", "Proforma invoice"
    WCC = "wcc", "Work completion certificate"
    SNAG = "snag", "Snag photo"
    INSTALL_PHOTO = "install_photo", "Installed photo"
    JMC = "jmc", "Signed JMC (joint measurement certificate)"


class E9Attachment(BaseModel):
    """A photo or PDF: item photos, site audit reports, signed DCs. Either a stored file or an outside link."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_attachments")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_attachments")
    item = models.ForeignKey(E9ScopeItem, on_delete=models.CASCADE, related_name="attachments", null=True, blank=True)
    kind = models.CharField(max_length=20, choices=E9AttachmentKind.choices, default=E9AttachmentKind.PHOTO)
    file = models.FileField(storage=e9_storage, upload_to=e9_upload_path, max_length=255, blank=True)
    name = models.CharField(max_length=255, blank=True, default="")
    size = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=120, blank=True, default="")
    link = models.CharField(max_length=1000, blank=True, default="")
    # site audit reports
    label = models.CharField(max_length=120, blank=True, default="", help_text="e.g. Visit 1 - 12 Nov")
    version = models.CharField(max_length=10, blank=True, default="", help_text="Draft or Final")
    sent_on = models.DateField(null=True, blank=True, help_text="Sent to pre-press on")
    # the PO, amendment, bill or DC this file belongs to (kind says which)
    ref_id = models.UUIDField(null=True, blank=True)

    class Meta:
        verbose_name = "E9 Attachment"
        verbose_name_plural = "E9 Attachments"
        db_table = "e9_attachments"
        ordering = ("created_at",)

    def __str__(self):
        return self.name or str(self.id)


class E9ChangeLog(BaseModel):
    """History: who changed what, and when (created_by / created_at come from BaseModel)."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_changes")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_changes")
    entity = models.CharField(max_length=20, help_text="item, project, scope, floor, attachment, import")
    entity_id = models.UUIDField(null=True, blank=True)
    entity_label = models.CharField(max_length=255, blank=True, default="")
    action = models.CharField(max_length=20, help_text="created, updated, deleted, uploaded, imported")
    field = models.CharField(max_length=60, blank=True, default="")
    field_label = models.CharField(max_length=80, blank=True, default="")
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "E9 Change Log"
        verbose_name_plural = "E9 Change Log"
        db_table = "e9_change_log"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["project", "-created_at"], name="e9_change_project_idx")]

    def __str__(self):
        return f"{self.entity_label} {self.action} {self.field}"


# ---------------------------------------------------------------------------
# BOQ, POs, amendments, reprints, JC / DC logs and billing
# ---------------------------------------------------------------------------


class E9POKind(models.TextChoices):
    ORIGINAL = "original", "Original BOQ / PO"
    NEW = "new", "New PO"


class E9PurchaseOrder(BaseModel):
    """The client's BOQ / PO. A project starts with the original one; a new PO for other work is another row."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_pos")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_pos")
    kind = models.CharField(max_length=10, choices=E9POKind.choices, default=E9POKind.ORIGINAL)
    number = models.CharField(max_length=80, blank=True, default="", help_text="PO / work order number")
    title = models.CharField(max_length=160, blank=True, default="")
    po_date = models.DateField(null=True, blank=True)
    link = models.CharField(max_length=1000, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "E9 Purchase Order"
        verbose_name_plural = "E9 Purchase Orders"
        db_table = "e9_purchase_orders"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return self.title or self.number or "PO"


class E9AmendmentStatus(models.TextChoices):
    REQUESTED = "requested", "Mail received - waiting for confirmation"
    CONFIRMED = "confirmed", "Confirmed (amended BOQ / PO)"
    REJECTED = "rejected", "Not going ahead"


class E9Amendment(BaseModel):
    """Extra quantity or new lines asked for by mail. Counts only once it is confirmed."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_amendments")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_amendments")
    po = models.ForeignKey(E9PurchaseOrder, on_delete=models.CASCADE, related_name="amendments")
    reference = models.CharField(max_length=160, blank=True, default="", help_text="Amended PO no. / mail subject")
    requested_on = models.DateField(null=True, blank=True)
    confirmed_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=E9AmendmentStatus.choices, default=E9AmendmentStatus.REQUESTED)
    mail_link = models.CharField(max_length=1000, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "E9 BOQ Amendment"
        verbose_name_plural = "E9 BOQ Amendments"
        db_table = "e9_boq_amendments"
        ordering = ("created_at",)

    def __str__(self):
        return self.reference or "Amendment"


class E9BoqUnit(models.TextChoices):
    SQFT = "sqft", "Sq Ft"
    NOS = "nos", "Nos"


class E9BoqLine(BaseModel):
    """One BOQ line, e.g. BO1 Wall Graphics 1,200 sq ft. Tracker rows point at it through their BOQ No."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_boq_lines")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_boq_lines")
    po = models.ForeignKey(E9PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    # set when the line was added by an amendment (then it counts only once that amendment is confirmed)
    amendment = models.ForeignKey(
        E9Amendment, on_delete=models.CASCADE, related_name="new_lines", null=True, blank=True
    )
    line_no = models.CharField(max_length=60, help_text="BOQ Item No., e.g. BO1")
    scope = models.CharField(max_length=40, blank=True, default="")
    description = models.TextField(blank=True, default="")
    unit = models.CharField(max_length=6, choices=E9BoqUnit.choices, default=E9BoqUnit.NOS)
    qty = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # client sent an amended BOQ for this line: the new quantity replaces qty (blank = same as original)
    amended_qty = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    amended_note = models.CharField(max_length=255, blank=True, default="", help_text="Amended BOQ ref / mail")
    rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    remarks = models.TextField(blank=True, default="")
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "E9 BOQ Line"
        verbose_name_plural = "E9 BOQ Lines"
        db_table = "e9_boq_lines"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "line_no"], condition=Q(deleted_at__isnull=True), name="e9_boq_unique_line_no"
            )
        ]

    def __str__(self):
        return self.line_no


class E9AmendmentChange(BaseModel):
    """'+5 on BO3' inside an amendment."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_amendment_changes")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_amendment_changes")
    amendment = models.ForeignKey(E9Amendment, on_delete=models.CASCADE, related_name="changes")
    boq_line = models.ForeignKey(E9BoqLine, on_delete=models.CASCADE, related_name="amendment_changes")
    qty_change = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        verbose_name = "E9 BOQ Amendment Change"
        verbose_name_plural = "E9 BOQ Amendment Changes"
        db_table = "e9_boq_amendment_changes"
        ordering = ("created_at",)


class E9ReprintCause(models.TextChoices):
    E9 = "e9", "E9"
    CLIENT = "client", "Client"
    SITE = "site", "Site"


class E9ReprintKind(models.TextChoices):
    REPRINT = "reprint", "Reprint"
    EXTRA = "extra", "Extra (Amended PO)"


class E9Reprint(BaseModel):
    """A reprint. Our own mistakes are only reprints; client changes are billed."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_reprints")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_reprints")
    boq_line = models.ForeignKey(E9BoqLine, on_delete=models.SET_NULL, related_name="reprints", null=True, blank=True)
    item = models.ForeignKey(E9ScopeItem, on_delete=models.SET_NULL, related_name="reprints", null=True, blank=True)
    kind = models.CharField(max_length=10, choices=E9ReprintKind.choices, default=E9ReprintKind.REPRINT)
    cause = models.CharField(max_length=10, choices=E9ReprintCause.choices, default=E9ReprintCause.E9)
    qty = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="In the BOQ line's unit")
    reason = models.TextField(blank=True, default="")
    description = models.TextField(blank=True, default="")
    pieces = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    reprint_height_in = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    reprint_width_in = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    jc_no = models.CharField(max_length=60, blank=True, default="")
    approved = models.CharField(
        max_length=10, blank=True, default="", help_text="Approved by client? Yes / Pending / No"
    )
    remarks = models.TextField(blank=True, default="")
    reprint_date = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name = "E9 Reprint"
        verbose_name_plural = "E9 Reprints"
        db_table = "e9_reprints"
        ordering = ("-created_at",)


class E9JobCard(BaseModel):
    """Details typed on the JC log. The JC numbers and their items come from the tracker rows."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_job_cards")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_job_cards")
    number = models.CharField(max_length=60)
    jc_date = models.DateField(null=True, blank=True)
    vendor = models.CharField(max_length=120, blank=True, default="")
    expected_date = models.DateField(null=True, blank=True)
    received = models.CharField(max_length=10, blank=True, default="Pending")
    received_date = models.DateField(null=True, blank=True)
    eproof_sent_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "E9 Job Card"
        verbose_name_plural = "E9 Job Cards"
        db_table = "e9_job_cards"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "number"], condition=Q(deleted_at__isnull=True), name="e9_jc_unique_number"
            )
        ]


class E9Challan(BaseModel):
    """Details typed on the DC log. The DC numbers and their items come from the tracker rows."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_challans")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_challans")
    number = models.CharField(max_length=60)
    dc_date = models.DateField(null=True, blank=True)
    dispatched_from = models.CharField(max_length=120, blank=True, default="")
    sent_by = models.CharField(max_length=120, blank=True, default="")
    vehicle = models.CharField(max_length=120, blank=True, default="")
    invoice_no = models.CharField(max_length=80, blank=True, default="")
    invoice_date = models.DateField(null=True, blank=True)
    e9_signoff = models.CharField(max_length=10, blank=True, default="Pending")
    client_signoff = models.CharField(max_length=10, blank=True, default="Pending")
    client_signatory = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(
        max_length=20, blank=True, default="Dispatched", help_text="Dispatched / Delivered / Returned"
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "E9 Delivery Challan"
        verbose_name_plural = "E9 Delivery Challans"
        db_table = "e9_challans"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "number"], condition=Q(deleted_at__isnull=True), name="e9_dc_unique_number"
            )
        ]


class E9Bill(BaseModel):
    """Billing for one PO, in 4 stages: certification -> proforma invoice -> PI signed & submitted -> WCC."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_bills")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_bills")
    po = models.ForeignKey(E9PurchaseOrder, on_delete=models.CASCADE, related_name="bills")
    certification = models.ForeignKey(
        "E9Certification", on_delete=models.SET_NULL, related_name="bills", null=True, blank=True
    )
    title = models.CharField(max_length=160, blank=True, default="")
    # 1 · Certification
    cert_number = models.CharField(max_length=80, blank=True, default="")
    cert_signed_on = models.DateField(null=True, blank=True, help_text="Client signed the certification sheet")
    cert_to_accounts_on = models.DateField(null=True, blank=True, help_text="Given to Accounts")
    # 2 · Proforma invoice
    pi_number = models.CharField(max_length=80, blank=True, default="")
    pi_date = models.DateField(null=True, blank=True)
    pi_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    # 3 · PI signed & submitted
    pi_signed_on = models.DateField(null=True, blank=True)
    pi_submitted_on = models.DateField(null=True, blank=True)
    # 4 · Work completion certificate
    wcc_number = models.CharField(max_length=80, blank=True, default="")
    wcc_date = models.DateField(null=True, blank=True)
    wcc_acknowledged_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "E9 Bill"
        verbose_name_plural = "E9 Bills"
        db_table = "e9_bills"
        ordering = ("created_at",)

    def __str__(self):
        return self.title or "Bill"


class E9BillLine(BaseModel):
    """Certified quantity of one BOQ line on a bill."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_bill_lines")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_bill_lines")
    bill = models.ForeignKey(E9Bill, on_delete=models.CASCADE, related_name="lines")
    boq_line = models.ForeignKey(E9BoqLine, on_delete=models.CASCADE, related_name="bill_lines")
    certified_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        verbose_name = "E9 Bill Line"
        verbose_name_plural = "E9 Bill Lines"
        db_table = "e9_bill_lines"
        ordering = ("created_at",)


class E9SnagStatus(models.TextChoices):
    OPEN = "Open", "Open"
    IN_PROGRESS = "In Progress", "In Progress"
    FIXED = "Fixed - Awaiting Client", "Fixed - Awaiting Client"
    CLOSED = "Closed", "Closed"


class E9Snag(BaseModel):
    """A defect found at handover (the template's Snag List)."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_snags")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_snags")
    item = models.ForeignKey(E9ScopeItem, on_delete=models.SET_NULL, related_name="snags", null=True, blank=True)
    raised_on = models.DateField(null=True, blank=True)
    reason = models.CharField(max_length=80, blank=True, default="")
    details = models.TextField(blank=True, default="")
    priority = models.CharField(max_length=10, blank=True, default="Medium")
    raised_by = models.CharField(max_length=120, blank=True, default="")
    assigned_to = models.CharField(max_length=120, blank=True, default="")
    target_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=E9SnagStatus.choices, default=E9SnagStatus.OPEN)
    closed_on = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default="")
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "E9 Snag"
        verbose_name_plural = "E9 Snags"
        db_table = "e9_snags"
        ordering = ("sort_order", "created_at")


class E9Certification(BaseModel):
    """A JMC (joint measurement certificate) signed with the client.

    Whole project when floor and scope are blank; otherwise one floor and/or one scope
    (for running bills on big jobs). Billing opens once a certification is done.
    """

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="e9_certifications")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_certifications")
    floor = models.CharField(max_length=255, blank=True, default="", help_text="Blank = every floor")
    scope = models.CharField(max_length=40, blank=True, default="", help_text="Blank = every scope")
    jmc_number = models.CharField(max_length=80, blank=True, default="")
    jmc_date = models.DateField(null=True, blank=True, help_text="Joint measurement done on")
    client_signatory = models.CharField(max_length=120, blank=True, default="")
    done_on = models.DateField(null=True, blank=True, help_text="Signed JMC received = certification done")
    link = models.CharField(max_length=1000, blank=True, default="", help_text="Link to the signed JMC")
    notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "E9 Certification"
        verbose_name_plural = "E9 Certifications"
        db_table = "e9_certifications"
        ordering = ("created_at",)

    @property
    def is_whole(self):
        return not self.floor and not self.scope

    def __str__(self):
        scope = ""
        if self.scope:
            scope = (
                E9ProjectScope.objects.filter(project_id=self.project_id, key=self.scope)
                .values_list("label", flat=True)
                .first()
                or self.scope
            )
        return " · ".join(part for part in [self.floor, scope] if part) or "Whole project"


class E9Announcement(BaseModel):
    """Notice for the whole team on Home and the Dashboard. Only workspace admins post."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="e9_announcements")
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True, default="")
    important = models.BooleanField(default=False)
    ends_on = models.DateField(null=True, blank=True, help_text="Hidden after this day")

    class Meta:
        verbose_name = "E9 Announcement"
        verbose_name_plural = "E9 Announcements"
        db_table = "e9_announcements"
        ordering = ("-created_at",)

    def __str__(self):
        return self.title
