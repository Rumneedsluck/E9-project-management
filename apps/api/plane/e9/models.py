# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models

from plane.db.models.base import BaseModel


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

    class Meta:
        verbose_name = "E9 Project Profile"
        verbose_name_plural = "E9 Project Profiles"
        db_table = "e9_project_profiles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"E9 profile <{self.project_id}>"
