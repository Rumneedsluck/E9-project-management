# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""A later step means the earlier steps are done (made-up data only)."""

from types import SimpleNamespace

import pytest

from plane.e9 import tracker


def item(**values):
    base = dict(
        site_audit_status="Not Started",
        pre_press="Not Started",
        production_status="Not Started",
        material_status="",
        quality_check="Pending",
        dispatch_status="Not Dispatched",
        installation_status="Not Started",
        client_sign_off="Pending",
    )
    base.update(values)
    return SimpleNamespace(**base)


@pytest.mark.unit
class TestLaterStepCountsEarlierSteps:
    def test_an_installed_item_counts_as_produced_received_checked_and_delivered(self):
        installed = item(installation_status="Installation Done")
        for step in ("measured", "pre_press", "production", "material", "qc", "delivered", "installed"):
            assert tracker.reached(installed, step), step
        assert not tracker.reached(installed, "signed_off")

    def test_a_signed_off_item_counts_as_installed(self):
        assert tracker.reached(item(client_sign_off="Signed Off"), "installed")

    def test_a_row_still_in_production_has_reached_nothing(self):
        working = item(production_status="In Production")
        assert tracker.furthest_step(working) == -1
        assert not tracker.reached(working, "production")
