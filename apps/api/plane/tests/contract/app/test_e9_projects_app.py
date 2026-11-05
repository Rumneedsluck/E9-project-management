# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, User, WorkspaceMember
from plane.e9.models import E9ProjectProfile


def list_url(slug):
    return f"/api/workspaces/{slug}/e9/projects/"


def detail_url(slug, project_id):
    return f"/api/workspaces/{slug}/e9/projects/{project_id}/"


def make_user(email):
    user = User.objects.create(email=email, username=email.split("@")[0])
    user.set_password("password-123")
    user.save()
    return user


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Sample Site", identifier="SMP", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def workspace_member(workspace):
    """A normal workspace member (not an admin)."""
    user = make_user("member@example.com")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return user


@pytest.mark.contract
class TestE9ProjectList:
    @pytest.mark.django_db
    def test_lists_project_with_default_profile(self, session_client, workspace, project):
        response = session_client.get(list_url(workspace.slug))

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        item = response.data[0]
        assert item["id"] == str(project.id)
        assert item["can_edit"] is True
        assert item["e9"]["status"] == "awarded"
        assert item["e9"]["priority"] == "medium"
        assert item["work_items"] == {"total": 0, "completed": 0}

    @pytest.mark.django_db
    def test_member_only_sees_their_projects(self, workspace, project, workspace_member):
        client = client_for(workspace_member)
        assert client.get(list_url(workspace.slug)).data == []

        ProjectMember.objects.create(project=project, member=workspace_member, role=15)
        response = client.get(list_url(workspace.slug))
        assert [item["id"] for item in response.data] == [str(project.id)]
        assert response.data[0]["can_edit"] is False

    @pytest.mark.django_db
    def test_workspace_admin_sees_all_projects(self, session_client, workspace):
        other = Project.objects.create(name="Other Site", identifier="OTH", workspace=workspace)

        response = session_client.get(list_url(workspace.slug))
        assert str(other.id) in [item["id"] for item in response.data]

    @pytest.mark.django_db
    def test_outsider_is_forbidden(self, workspace, project):
        outsider = make_user("outsider@example.com")
        response = client_for(outsider).get(list_url(workspace.slug))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_archived_projects_are_hidden(self, session_client, workspace, project):
        from django.utils import timezone

        project.archived_at = timezone.now()
        project.save()
        assert session_client.get(list_url(workspace.slug)).data == []


@pytest.mark.contract
class TestE9ProjectDetail:
    @pytest.mark.django_db
    def test_patch_creates_then_updates_profile(self, session_client, workspace, project):
        payload = {
            "client_name": "Fictional Corp",
            "city": "Bengaluru",
            "status": "installation",
            "priority": "high",
            "start_date": "2026-11-01",
            "deadline": "2026-11-30",
        }
        response = session_client.patch(detail_url(workspace.slug, project.id), payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["e9"]["client_name"] == "Fictional Corp"
        assert response.data["e9"]["status"] == "installation"
        assert E9ProjectProfile.objects.filter(project=project).count() == 1

        response = session_client.patch(detail_url(workspace.slug, project.id), {"status": "sign_off"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["e9"]["status"] == "sign_off"
        assert response.data["e9"]["client_name"] == "Fictional Corp"
        assert E9ProjectProfile.objects.filter(project=project).count() == 1

        response = session_client.get(detail_url(workspace.slug, project.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["e9"]["deadline"] == "2026-11-30"

    @pytest.mark.django_db
    def test_revives_soft_deleted_profile(self, session_client, workspace, project):
        from django.utils import timezone

        E9ProjectProfile.objects.create(project=project, workspace=workspace, client_name="Old")
        E9ProjectProfile.all_objects.filter(project=project).update(deleted_at=timezone.now())

        response = session_client.patch(detail_url(workspace.slug, project.id), {"city": "Pune"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["e9"]["city"] == "Pune"
        assert E9ProjectProfile.objects.filter(project=project).count() == 1

    @pytest.mark.django_db
    def test_invalid_values_are_rejected(self, session_client, workspace, project):
        url = detail_url(workspace.slug, project.id)

        assert session_client.patch(url, {"status": "nope"}, format="json").status_code == 400
        assert session_client.patch(url, {"priority": "urgent!"}, format="json").status_code == 400
        response = session_client.patch(url, {"start_date": "2026-12-10", "deadline": "2026-12-01"}, format="json")
        assert response.status_code == 400
        assert "deadline" in response.data

    @pytest.mark.django_db
    def test_project_member_cannot_edit(self, workspace, project, workspace_member):
        ProjectMember.objects.create(project=project, member=workspace_member, role=15)
        client = client_for(workspace_member)

        response = client.patch(detail_url(workspace.slug, project.id), {"status": "completed"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        # ...but can still view it
        assert client.get(detail_url(workspace.slug, project.id)).status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_non_member_cannot_view(self, workspace, project, workspace_member):
        response = client_for(workspace_member).get(detail_url(workspace.slug, project.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.unit
class TestE9DemoSetup:
    @pytest.mark.django_db
    def test_demo_setup_is_repeatable(self, monkeypatch):
        from django.core.management import call_command

        from plane.db.models import Workspace

        monkeypatch.setenv("SECRET_KEY", "test-secret")
        call_command("e9_demo_setup", "--email", "owner@example.com", "--password", "Demo-pass-123")
        call_command("e9_demo_setup", "--email", "owner@example.com", "--password", "Demo-pass-123")

        workspace = Workspace.objects.get(slug="e9-creative")
        assert Project.objects.filter(workspace=workspace).count() == 7
        assert E9ProjectProfile.objects.filter(workspace=workspace).count() == 7
        owner = User.objects.get(email="owner@example.com")
        assert owner.check_password("Demo-pass-123")
        assert WorkspaceMember.objects.get(workspace=workspace, member=owner).role == 20
        # E9 is invitation-only: public sign-up is switched off
        from plane.license.models import InstanceConfiguration

        assert InstanceConfiguration.objects.get(key="ENABLE_SIGNUP").value == "0"


@pytest.mark.unit
class TestE9DemoClear:
    @pytest.mark.django_db
    def test_clear_removes_only_demo_data(self, monkeypatch):
        from django.core.management import call_command

        from plane.db.models import Workspace

        monkeypatch.setenv("SECRET_KEY", "test-secret")
        call_command("e9_demo_setup", "--email", "owner@example.com", "--password", "Demo-pass-123")
        workspace = Workspace.objects.get(slug="e9-creative")
        owner = User.objects.get(email="owner@example.com")
        real = Project.objects.create(name="Example Client Bangalore", identifier="BTB", workspace=workspace)

        # dry run changes nothing
        call_command("e9_demo_clear")
        assert Project.objects.filter(workspace=workspace).count() == 8

        call_command("e9_demo_clear", "--yes")
        assert list(Project.objects.filter(workspace=workspace)) == [real]
        assert WorkspaceMember.objects.filter(workspace=workspace).count() == 1
        assert WorkspaceMember.objects.get(workspace=workspace).member == owner
        assert not User.objects.get(email="kavya.rao@example.com").is_active
        assert User.objects.get(email="owner@example.com").is_active

        # running it again is harmless
        call_command("e9_demo_clear", "--yes")
        assert list(Project.objects.filter(workspace=workspace)) == [real]
