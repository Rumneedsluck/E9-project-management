# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from . import tracker
from .models import E9ProjectProfile, E9ScopeItem

PROFILE_FIELDS = [
    "client_name",
    "site_address",
    "city",
    "work_order_number",
    "status",
    "priority",
    "start_date",
    "deadline",
    "client_contact",
    "site_contact",
    "work_order_date",
    "site_timings",
    "target_site_audit",
    "target_pre_press",
    "target_material",
    "target_delivered",
    "target_installation",
    "target_sign_off",
]


class E9ProjectProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = E9ProjectProfile
        fields = [*PROFILE_FIELDS, "updated_at"]
        read_only_fields = ["updated_at"]

    def validate(self, attrs):
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        deadline = attrs.get("deadline", getattr(self.instance, "deadline", None))
        if start_date and deadline and deadline < start_date:
            raise serializers.ValidationError({"deadline": "The deadline cannot be before the start date."})
        return attrs


def default_profile_data():
    """Profile values shown for a Plane project that has no E9 profile yet."""
    data = {field: E9ProjectProfile._meta.get_field(field).get_default() for field in PROFILE_FIELDS}
    data["updated_at"] = None
    return data


ITEM_EDITABLE_FIELDS = [
    "boq_item_no",
    "floor_area",
    "floor_plan_ref",
    "description",
    "site_audit_status",
    "height_in",
    "width_in",
    "qty",
    "unit_override",
    "photo_link",
    "site_issue",
    "issue_resolved",
    "pre_press",
    "jc_no",
    "production_status",
    "material_status",
    "quality_check",
    "qc_done_by",
    "dc_nos",
    "dispatch_status",
    "installation_status",
    "installation_date",
    "installed_by",
    "client_sign_off",
    "remarks",
    "sort_order",
]


class E9ScopeItemSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(read_only=True)
    unit = serializers.CharField(read_only=True)
    area_sqft = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, allow_null=True)
    current_stage = serializers.CharField(read_only=True)

    class Meta:
        model = E9ScopeItem
        fields = [
            "id",
            "scope",
            "item_number",
            "item_code",
            "unit",
            "area_sqft",
            "current_stage",
            *ITEM_EDITABLE_FIELDS,
            "updated_at",
        ]
        read_only_fields = ["id", "scope", "item_number", "updated_at"]

    def validate(self, attrs):
        scope = self.instance.scope if self.instance else self.context.get("scope")
        issue = attrs.get("site_issue")
        if scope and issue and issue not in tracker.SITE_ISSUES[scope]:
            raise serializers.ValidationError({"site_issue": f"'{issue}' is not a site issue for this scope."})
        for field in ("height_in", "width_in", "qty"):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Cannot be negative."})
        return attrs
