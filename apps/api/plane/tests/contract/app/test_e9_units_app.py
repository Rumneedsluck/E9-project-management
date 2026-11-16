# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Sizes typed in inches, feet or mm; sq ft, Nos and running length (rft / rmt). Made-up data only."""

from decimal import Decimal
from types import SimpleNamespace

import pytest

from plane.db.models import Project, ProjectMember
from plane.e9 import tracker


def row(**values):
    base = dict(
        scope="custom_border",
        sort_order=1000,
        item_number=1,
        is_part=False,
        height_in=None,
        width_in=None,
        qty=None,
        production_height_in=None,
        production_width_in=None,
        production_qty=None,
        certified_height_in=None,
        certified_width_in=None,
        certified_qty=None,
        dc_nos="",
        dc_qty="",
        dispatch_status="Not Dispatched",
    )
    base.update(values)
    item = SimpleNamespace(**base)
    tracker.fold_parts([item])
    return item


def to_inches(value, unit):
    return Decimal(value) * tracker.SIZE_UNITS[unit]


@pytest.mark.unit
class TestTypedUnitsGiveTheSameSqFt:
    def test_one_wall_typed_in_inches_feet_or_mm_is_the_same_sq_ft(self):
        # 8 ft x 10 ft wall = 80 sq ft, whichever unit the person measures in
        typed = {"in": ("96", "120"), "ft": ("8", "10"), "mm": ("2438.4", "3048")}
        areas = {
            unit: tracker.item_area_sqft(to_inches(height, unit), to_inches(width, unit), 1)
            for unit, (height, width) in typed.items()
        }
        assert areas == {"in": Decimal("80.00"), "ft": Decimal("80.00"), "mm": Decimal("80.00")}

    def test_each_unit_follows_its_own_formula(self):
        # feet x feet = sq ft; inches x inches / 144 = sq ft; mm x mm / 92,903.04 = sq ft
        assert tracker.item_area_sqft(to_inches(3, "ft"), to_inches(4, "ft"), 1) == Decimal("12.00")
        assert tracker.item_area_sqft(to_inches(36, "in"), to_inches(48, "in"), 1) == Decimal("12.00")
        assert tracker.item_area_sqft(to_inches(1000, "mm"), to_inches(1000, "mm"), 1) == Decimal("10.76")


@pytest.mark.unit
class TestRunningLength:
    def test_running_length_is_width_times_qty_and_height_is_ignored(self):
        strip = row(height_in=Decimal(1), width_in=Decimal(120), qty=Decimal(2))  # 1in high, 10ft long, 2 strips
        assert tracker.measured(strip, "rft") == Decimal("20.00")
        assert tracker.measured(strip, "rmt") == Decimal("6.10")  # 240in = 6.096 m
        taller = row(height_in=Decimal(12), width_in=Decimal(120), qty=Decimal(2))
        assert tracker.measured(taller, "rft") == tracker.measured(strip, "rft")

    def test_the_same_length_typed_in_mm_feet_or_inches(self):
        for width in (to_inches(3048, "mm"), to_inches(10, "ft"), to_inches(120, "in")):
            assert tracker.measured(row(width_in=width, qty=Decimal(1)), "rft") == Decimal("10.00")

    def test_production_wastage_and_certified_in_running_feet(self):
        strip = row(
            width_in=Decimal(120),
            qty=Decimal(1),
            production_width_in=Decimal(126),  # 6in extra for joints
            certified_width_in=Decimal(118),
        )
        assert tracker.production_measure(strip, "rft") == Decimal("10.50")
        assert tracker.wastage(strip, "rft") == Decimal("0.50")
        assert tracker.certified_measure(strip, "rft") == Decimal("9.83")

    def test_a_part_adds_only_its_production_length(self):
        main = row(width_in=Decimal(240), qty=Decimal(1), production_width_in=Decimal(120), production_qty=Decimal(1))
        piece = row(sort_order=2000, item_number=2, is_part=True, production_width_in=Decimal(126))
        tracker.fold_parts([main, piece])
        assert tracker.measured(main, "rft") == Decimal("20.00")
        assert tracker.production_measure(main, "rft") == Decimal("10.00") + Decimal("10.50")

    def test_dispatched_with_no_dc_is_the_full_length(self):
        strip = row(width_in=Decimal(120), qty=Decimal(3), dispatch_status="Dispatched")
        assert tracker.dispatched(strip, "rft") == Decimal("30.00")

    def test_each_running_length_item_counts_once_in_work_done(self):
        done = row(
            floor_area="1st",
            description="Strip A",
            width_in=Decimal(120),
            qty=Decimal(4),
            unit_override="",
            installation_status="Installation Done",
            hold_status="",
        )
        todo = row(
            sort_order=2000,
            item_number=2,
            floor_area="1st",
            description="Strip B",
            width_in=Decimal(120),
            qty=Decimal(1),
            unit_override="",
            installation_status="Not Started",
            hold_status="",
        )
        result = tracker.progress([done, todo], {"custom_border": "rft"})
        assert result["percent"] == 50  # 1 of 2 items, not weighted by length
        assert result["rft_total"] == "50.00" and result["rft_done"] == "40.00"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Fictional Arcade", identifier="FA", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


def url(workspace, project, path=""):
    return f"/api/workspaces/{workspace.slug}/e9/projects/{project.id}/{path}"


@pytest.mark.django_db
class TestRunningLengthScopeAndBoq:
    def test_a_running_feet_scope_measures_and_checks_against_a_running_feet_boq_line(
        self, session_client, workspace, project
    ):
        rows = [
            {key: entry[key] for key in ("key", "label", "prefix", "unit_mode", "enabled", "size_unit")}
            for entry in session_client.get(url(workspace, project, "scopes/")).data
        ]
        rows.append({"label": "Border Strip", "prefix": "BS", "unit_mode": "rft", "enabled": True, "size_unit": "ft"})
        saved = session_client.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json")
        assert saved.status_code == 200, saved.data
        scope = next(entry for entry in saved.data if entry["label"] == "Border Strip")
        assert scope["unit_mode"] == "rft"

        po = session_client.post(
            url(workspace, project, "boq/pos/"), {"kind": "original", "number": "PO-1"}, format="json"
        )
        session_client.post(
            url(workspace, project, "boq/lines/"),
            {
                "po": po.data["pos"][0]["id"],
                "line_no": "BO7",
                "scope": scope["key"],
                "description": "Border strip",
                "unit": "rft",
                "qty": "25",
            },
            format="json",
        )
        made = session_client.post(
            url(workspace, project, "items/"), {"scope": scope["key"], "count": 1}, format="json"
        )
        item = session_client.patch(
            url(workspace, project, f"items/{made.data[0]['id']}/"),
            {"description": "Lobby border", "height_in": "1", "width_in": "120", "qty": "3", "boq_item_no": "BO7"},
            format="json",
        ).data
        assert item["unit"] == "rft" and item["length"] == "30.00"  # 10 ft x 3

        boq = session_client.get(url(workspace, project, "boq/")).data
        line = next(entry for entry in boq["lines"] if entry["line_no"] == "BO7")
        assert line["unit"] == "rft"
        assert Decimal(line["on_tracker"]) == Decimal("30.00")
        assert line["status"] != "ok"  # 30 rft on the tracker against 25 rft allowed


@pytest.mark.django_db
class TestProductionFollowsTheSite:
    def _item(self, client, workspace, project, **values):
        made = client.post(url(workspace, project, "items/"), {"scope": "glass_film", "count": 1}, format="json")
        return client.patch(
            url(workspace, project, f"items/{made.data[0]['id']}/"), {"description": "Glass", **values}, format="json"
        ).data

    def test_a_production_qty_that_matched_the_site_qty_moves_with_it(self, session_client, workspace, project):
        item = self._item(
            session_client,
            workspace,
            project,
            height_in="48",
            width_in="78",
            qty="1",
            production_height_in="48",
            production_width_in="78",
            production_qty="1",
            dc_nos="2684",
            dispatch_status="Dispatched",
        )
        assert item["dispatched"] == "26.00"
        item = session_client.patch(url(workspace, project, f"items/{item['id']}/"), {"qty": "3"}, format="json").data
        assert Decimal(item["production_qty"]) == 3
        assert item["area_sqft"] == "78.00" and item["dispatched"] == "78.00" and item["balance"] == "0.00"

    def test_a_production_qty_typed_differently_is_left_alone(self, session_client, workspace, project):
        item = self._item(
            session_client, workspace, project, height_in="48", width_in="78", qty="2", production_qty="5"
        )
        item = session_client.patch(url(workspace, project, f"items/{item['id']}/"), {"qty": "3"}, format="json").data
        assert Decimal(item["production_qty"]) == 5
