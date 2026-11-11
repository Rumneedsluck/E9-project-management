# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from decimal import Decimal

from rest_framework import serializers

from .safety import clean_link
from . import tracker
from .models import E9Attachment, E9ChangeLog, E9Floor, E9ProjectProfile, E9ProjectScope, E9ScopeItem
from .services import item_code

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
    "hidden_columns",
]

# Tracker columns that can be hidden on a project (the item code is always shown)
HIDEABLE_COLUMNS = [
    "boq_item_no",
    "current_stage",
    "floor_area",
    "floor_plan_ref",
    "description",
    "site_audit_status",
    "size",
    "photos",
    "site_issue",
    "pre_press",
    "jc_no",
    "production_size",
    "production_status",
    "material_status",
    "quality_check",
    "qc_done_by",
    "dc_nos",
    "dc_qty",
    "dispatch_status",
    "installation_status",
    "installation_date",
    "installed_by",
    "installed_photo",
    "certified",
    "client_sign_off",
    "remarks",
    "resent",
]


class E9ProjectProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = E9ProjectProfile
        fields = [*PROFILE_FIELDS, "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_hidden_columns(self, value):
        if not isinstance(value, list) or any(column not in HIDEABLE_COLUMNS for column in value):
            raise serializers.ValidationError("Unknown column.")
        return list(dict.fromkeys(value))

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
    "production_height_in",
    "production_width_in",
    "production_qty",
    "production_status",
    "material_status",
    "quality_check",
    "qc_done_by",
    "dc_nos",
    "dc_qty",
    "dispatch_status",
    "installation_status",
    "installation_date",
    "installed_by",
    "certified_height_in",
    "certified_width_in",
    "certified_qty",
    "client_sign_off",
    "remarks",
    "hold_status",
    "hold_reason",
    "hold_since",
    "replaced_by",
    "bill_now",
    "bill_when",
    "sort_order",
]


class E9ScopeItemSerializer(serializers.ModelSerializer):
    """Needs context["scopes"] = {key: E9ProjectScope} to work out codes and units."""

    item_code = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()
    area_sqft = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, allow_null=True)
    current_stage = serializers.CharField(read_only=True)
    production_measure = serializers.SerializerMethodField()
    wastage = serializers.SerializerMethodField()
    dispatched = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    certified_measure = serializers.SerializerMethodField()
    dc_list = serializers.SerializerMethodField()
    resent = serializers.SerializerMethodField()

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
            "production_measure",
            "wastage",
            "dispatched",
            "balance",
            "certified_measure",
            "dc_list",
            "resent",
            *ITEM_EDITABLE_FIELDS,
            "updated_at",
        ]
        read_only_fields = ["id", "scope", "item_number", "updated_at"]

    def validate_photo_link(self, value):
        return _safe_link(value)

    def _scopes(self):
        return self.context.get("scopes", {})

    def get_item_code(self, item):
        return item_code(item, self._scopes())

    def get_unit(self, item):
        scope = self._scopes().get(item.scope)
        mode = scope.unit_mode if scope else tracker.SCOPES.get(item.scope, ("", "", "either"))[2]
        return tracker.item_unit(mode, item.height_in, item.width_in, item.unit_override)

    @staticmethod
    def _text(value):
        return None if value is None else str(value.quantize(Decimal("0.01")))

    def get_production_measure(self, item):
        return self._text(tracker.production_measure(item, self.get_unit(item)))

    def get_wastage(self, item):
        return self._text(tracker.wastage(item, self.get_unit(item)))

    def get_dispatched(self, item):
        return self._text(tracker.dispatched(item, self.get_unit(item)))

    def get_balance(self, item):
        return self._text(tracker.balance_to_send(item, self.get_unit(item)))

    def get_certified_measure(self, item):
        return self._text(tracker.certified_measure(item, self.get_unit(item)))

    def get_dc_list(self, item):
        return [{"dc": dc, "qty": self._text(qty)} for dc, qty in tracker.dc_breakdown(item, self.get_unit(item))]

    def get_resent(self, item):
        counts = self.context.get("resent")
        if counts is None:
            from .models import E9Reprint

            counts = {}
            for kind in E9Reprint.objects.filter(item=item).values_list("kind", flat=True):
                counts.setdefault(str(item.id), {}).setdefault(kind, 0)
                counts[str(item.id)][kind] += 1
        parts = counts.get(str(item.id), {})
        return " · ".join(
            f"{'Reprint' if kind == 'reprint' else 'Extra'} x{count}" for kind, count in sorted(parts.items())
        )

    def validate(self, attrs):
        scope = self.instance.scope if self.instance else self.context.get("scope")
        issue = attrs.get("site_issue")
        if scope and issue and issue not in tracker.site_issues_for(scope):
            raise serializers.ValidationError({"site_issue": f"'{issue}' is not a site issue for this scope."})
        if attrs.get("dc_qty"):
            bad = [part for part in tracker.split_list(attrs["dc_qty"]) if tracker.to_decimal(part) is None]
            if bad:
                raise serializers.ValidationError({"dc_qty": "Type numbers only, separated by commas, e.g. 100, 50."})
        for field in (
            "height_in",
            "width_in",
            "qty",
            "production_height_in",
            "production_width_in",
            "production_qty",
            "certified_height_in",
            "certified_width_in",
            "certified_qty",
        ):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Cannot be negative."})
        return attrs


class E9ProjectScopeSerializer(serializers.ModelSerializer):
    class Meta:
        model = E9ProjectScope
        fields = ["key", "label", "prefix", "unit_mode", "is_standard", "enabled", "sort_order", "bill_when"]
        read_only_fields = ["key", "is_standard"]


class E9FloorSerializer(serializers.ModelSerializer):
    class Meta:
        model = E9Floor
        fields = ["id", "name", "sort_order", "status", "target_date", "notes"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give the floor a name.")
        return value


def _safe_link(value):
    cleaned = clean_link(value)
    if cleaned is None:
        raise serializers.ValidationError("Use a web address that starts with http:// or https://.")
    return cleaned


class E9AttachmentSerializer(serializers.ModelSerializer):
    has_file = serializers.SerializerMethodField()

    def validate_link(self, value):
        return _safe_link(value)

    class Meta:
        model = E9Attachment
        fields = [
            "id",
            "item",
            "kind",
            "ref_id",
            "name",
            "size",
            "content_type",
            "link",
            "label",
            "version",
            "sent_on",
            "has_file",
            "created_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "item",
            "kind",
            "ref_id",
            "size",
            "content_type",
            "has_file",
            "created_at",
            "created_by",
        ]

    def get_has_file(self, attachment):
        return bool(attachment.file)

    def validate_version(self, value):
        if value not in ("", "Draft", "Final"):
            raise serializers.ValidationError("Use Draft or Final.")
        return value


class E9ChangeLogSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = E9ChangeLog
        fields = [
            "id",
            "entity",
            "entity_id",
            "entity_label",
            "action",
            "field",
            "field_label",
            "old_value",
            "new_value",
            "created_at",
            "actor",
        ]

    def get_actor(self, change):
        user = change.created_by
        if user is None:
            return None
        name = f"{user.first_name} {user.last_name}".strip() or user.display_name or user.email
        return {"id": str(user.id), "name": name}
