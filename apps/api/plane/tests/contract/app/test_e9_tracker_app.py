# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from decimal import Decimal
from types import SimpleNamespace

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, User, WorkspaceMember
from plane.e9 import tracker
from plane.e9.models import E9ScopeItem


def items_url(slug, project_id):
    return f"/api/workspaces/{slug}/e9/projects/{project_id}/items/"


def item_url(slug, project_id, item_id):
    return f"/api/workspaces/{slug}/e9/projects/{project_id}/items/{item_id}/"


def make_member(workspace, project, email, workspace_role, project_role=None):
    user = User.objects.create(email=email, username=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=workspace_role)
    if project_role:
        ProjectMember.objects.create(project=project, member=user, role=project_role)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Fictional Site", identifier="FS", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


def blank_item(**values):
    defaults = {
        "site_audit_status": "Not Started",
        "pre_press": "Not Started",
        "production_status": "Not Started",
        "material_status": "",
        "quality_check": "Pending",
        "dispatch_status": "Not Dispatched",
        "installation_status": "Not Started",
        "client_sign_off": "Pending",
    }
    return SimpleNamespace(**{**defaults, **values})


@pytest.mark.unit
class TestTrackerRules:
    def test_area_matches_template_formula(self):
        # 114 x 116.5 in, 1 no -> 92.23 sq ft (sample wall W1)
        assert tracker.item_area_sqft(Decimal("114"), Decimal("116.5"), None) == Decimal("92.23")
        assert tracker.item_area_sqft(Decimal("108"), Decimal("240"), Decimal("2")) == Decimal("360.00")
        assert tracker.item_area_sqft(None, Decimal("240"), None) is None

    def test_units(self):
        assert tracker.item_unit("sqft", None, None) == "sqft"
        assert tracker.item_unit("nos", Decimal("10"), Decimal("10")) == "nos"
        assert tracker.item_unit("either", Decimal("10"), Decimal("10")) == "sqft"
        assert tracker.item_unit("either", None, None) == "nos"
        assert tracker.item_unit("either", Decimal("10"), Decimal("10"), "nos") == "nos"

    @pytest.mark.parametrize(
        "values,expected",
        [
            ({}, "Not Started"),
            ({"site_audit_status": "Measured"}, "Measured"),
            ({"pre_press": "In Progress"}, "In Pre-Press"),
            ({"pre_press": "Sent for Production"}, "Sent for Production"),
            ({"material_status": "JC Raised"}, "Material Ordered"),
            ({"material_status": "JC Raised", "production_status": "In Production"}, "In Production"),
            ({"production_status": "Production Done"}, "Production Done"),
            ({"material_status": "Partial Received"}, "Material Partial"),
            ({"material_status": "Material Received"}, "Material Received"),
            ({"quality_check": "Passed"}, "QC Passed"),
            ({"dispatch_status": "Partially Dispatched"}, "Dispatched"),
            ({"dispatch_status": "Delivered at Site"}, "Delivered at Site"),
            ({"installation_status": "In Progress"}, "Installing"),
            ({"installation_status": "Installation Done"}, "Installed"),
            ({"installation_status": "Installation Done", "client_sign_off": "Signed Off"}, "Handed Over"),
        ],
    )
    def test_current_stage_follows_template(self, values, expected):
        assert tracker.current_stage(blank_item(**values)) == expected


@pytest.mark.contract
class TestTrackerItemsAPI:
    @pytest.mark.django_db
    def test_add_rows_gets_sequential_codes(self, session_client, workspace, project):
        url = items_url(workspace.slug, project.id)
        response = session_client.post(url, {"scope": "wall_graphics", "count": 3}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert [row["item_code"] for row in response.data] == ["W1", "W2", "W3"]

        response = session_client.post(url, {"scope": "glass_film"}, format="json")
        assert response.data[0]["item_code"] == "GF1"

        # deleting W3 does not let its code be reused
        w3 = E9ScopeItem.objects.get(project=project, scope="wall_graphics", item_number=3)
        assert session_client.delete(item_url(workspace.slug, project.id, w3.id)).status_code == 204
        response = session_client.post(url, {"scope": "wall_graphics"}, format="json")
        assert response.data[0]["item_code"] == "W4"

        listing = session_client.get(url)
        assert listing.data["can_edit"] is True
        assert sorted(row["item_code"] for row in listing.data["items"]) == ["GF1", "W1", "W2", "W4"]

    @pytest.mark.django_db
    def test_edit_row_updates_area_and_stage(self, session_client, workspace, project):
        created = session_client.post(
            items_url(workspace.slug, project.id), {"scope": "wall_graphics"}, format="json"
        ).data[0]
        response = session_client.patch(
            item_url(workspace.slug, project.id, created["id"]),
            {"height_in": "114", "width_in": "116.5", "site_audit_status": "Measured", "floor_area": "4th Floor"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["area_sqft"] == "92.23"
        assert response.data["unit"] == "sqft"
        assert response.data["current_stage"] == "Measured"

    @pytest.mark.django_db
    def test_rejects_bad_values(self, session_client, workspace, project):
        url = items_url(workspace.slug, project.id)
        assert session_client.post(url, {"scope": "bogus"}, format="json").status_code == 400
        assert session_client.post(url, {"scope": "frames", "count": 500}, format="json").status_code == 400
        item = session_client.post(url, {"scope": "frames"}, format="json").data[0]
        detail = item_url(workspace.slug, project.id, item["id"])
        # a wall-only issue is not allowed on a frame
        assert session_client.patch(detail, {"site_issue": "Needs oil primer"}, format="json").status_code == 400
        assert session_client.patch(detail, {"pre_press": "Maybe"}, format="json").status_code == 400
        assert session_client.patch(detail, {"qty": "-2"}, format="json").status_code == 400
        assert session_client.patch(detail, {"site_issue": "Wall surface uneven"}, format="json").status_code == 200

    @pytest.mark.django_db
    def test_project_member_can_update_but_guest_cannot(self, session_client, workspace, project):
        url = items_url(workspace.slug, project.id)
        item = session_client.post(url, {"scope": "wall_graphics"}, format="json").data[0]
        detail = item_url(workspace.slug, project.id, item["id"])

        member = make_member(workspace, project, "site@example.com", 15, 15)
        assert member.patch(detail, {"installation_status": "In Progress"}, format="json").status_code == 200

        guest = make_member(workspace, project, "client@example.com", 5, 5)
        listing = guest.get(url)
        assert listing.status_code == 200
        assert listing.data["can_edit"] is False
        assert guest.patch(detail, {"installation_status": "Installation Done"}, format="json").status_code == 403
        assert guest.post(url, {"scope": "wall_graphics"}, format="json").status_code == 403
        assert guest.delete(detail).status_code == 403

    @pytest.mark.django_db
    def test_outsiders_cannot_see_items(self, session_client, workspace, project):
        url = items_url(workspace.slug, project.id)
        session_client.post(url, {"scope": "wall_graphics"}, format="json")
        stranger = make_member(workspace, project, "other@example.com", 15)  # not on this project
        assert stranger.get(url).status_code == 404

    @pytest.mark.django_db
    def test_project_info_fields_round_trip(self, session_client, workspace, project):
        response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/e9/projects/{project.id}/",
            {"client_contact": "Ms Example, 98xxxxxx", "target_site_audit": "2026-11-10"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["e9"]["client_contact"] == "Ms Example, 98xxxxxx"
        assert response.data["e9"]["target_site_audit"] == "2026-11-10"
