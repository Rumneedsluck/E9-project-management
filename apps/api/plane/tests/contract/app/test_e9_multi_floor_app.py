# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import Project, ProjectMember
from plane.e9.services import split_floors


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Fictional Plaza", identifier="FP", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


def url(workspace, project, path=""):
    return f"/api/workspaces/{workspace.slug}/e9/projects/{project.id}/{path}"


@pytest.mark.contract
class TestItemsOnSeveralFloors:
    def test_split_floors(self):
        assert split_floors("7th Floor, 8th Floor") == ["7th Floor", "8th Floor"]
        assert split_floors("  Ground ;Terrace,, ") == ["Ground", "Terrace"]
        assert split_floors("") == [] and split_floors(None) == []

    @pytest.mark.django_db
    def test_each_floor_is_listed_and_a_floor_jmc_covers_the_item(self, session_client, workspace, project):
        item = session_client.post(url(workspace, project, "items/"), {"scope": "wall_graphics"}, format="json").data[0]
        session_client.patch(
            url(workspace, project, f"items/{item['id']}/"),
            {"floor_area": "7th Floor, 8th Floor", "description": "Long wall"},
            format="json",
        )
        floors = [floor["name"] for floor in session_client.get(url(workspace, project, "floors/")).data]
        assert floors == ["7th Floor", "8th Floor"]  # not one odd "7th Floor, 8th Floor" floor

        cert = session_client.post(
            url(workspace, project, "certifications/"), {"floor": "8th Floor"}, format="json"
        ).data
        readiness = cert["certifications"][0]["readiness"]
        assert readiness["rows"] == 1  # the item sits on the 8th floor too
        assert "7th Floor" in cert["floors"] and "8th Floor" in cert["floors"]


@pytest.mark.contract
class TestFloorsIgnoreCapitals:
    @pytest.mark.django_db
    def test_seventh_floor_and_seventh_Floor_are_one_floor(self, session_client, workspace, project):
        from plane.e9.models import E9Floor
        from plane.e9.services import ensure_floors

        ensure_floors(project, ["7th Floor", "7th floor", "8th Floor"])
        ensure_floors(project, ["7TH FLOOR"])
        assert sorted(E9Floor.objects.filter(project=project).values_list("name", flat=True)) == [
            "7th Floor",
            "8th Floor",
        ]
