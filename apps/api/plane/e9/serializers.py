# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .models import E9ProjectProfile

PROFILE_FIELDS = [
    "client_name",
    "site_address",
    "city",
    "work_order_number",
    "status",
    "priority",
    "start_date",
    "deadline",
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
