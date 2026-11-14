# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""A project's 6-digit access code: members and guests type it, admins never need it, the server enforces it."""

# ruff: noqa: F811
import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from plane.db.models import User
from plane.e9.models import E9ChangeLog, E9ProjectProfile
from plane.tests.contract.app.test_e9_boq_billing_app import (
    member_client,
    project,  # noqa: F401  (fixture)
    setup_boq,
    url,
)

GUEST, MEMBER = 5, 15
CODE = "482915"


@pytest.fixture(autouse=True)
def _clean_tries():
    cache.clear()
    yield
    cache.clear()


def set_code(client, workspace, project, code=CODE):
    return client.put(url(workspace, project, "access-code/"), {"code": code}, format="json")


@pytest.mark.contract
class TestSettingTheCode:
    @pytest.mark.django_db
    def test_only_admins_set_it_and_it_is_six_digits_stored_as_a_hash(self, session_client, workspace, project):
        member = member_client(workspace, project, MEMBER)
        assert set_code(member, workspace, project).status_code == 403
        for bad in ("12345", "1234567", "12ab56", " 482915"):
            assert set_code(session_client, workspace, project, bad).status_code == 400
        assert set_code(session_client, workspace, project).data == {"has_access_code": True}
        stored = E9ProjectProfile.objects.get(project=project).access_code_hash
        assert stored and CODE not in stored
        history = " ".join(E9ChangeLog.objects.filter(project=project).values_list("new_value", flat=True))
        assert CODE not in history

    @pytest.mark.django_db
    def test_the_hash_never_reaches_the_screen_and_removing_the_code_opens_the_project(
        self, session_client, workspace, project
    ):
        set_code(session_client, workspace, project)
        listing = session_client.get(f"/api/workspaces/{workspace.slug}/e9/projects/").data
        assert "access_code_hash" not in str(listing)
        member = member_client(workspace, project, MEMBER)
        assert member.get(url(workspace, project, "items/")).status_code == 423
        assert set_code(session_client, workspace, project, "").data == {"has_access_code": False}
        assert member.get(url(workspace, project, "items/")).status_code == 200


@pytest.mark.contract
class TestTheLock:
    @pytest.mark.django_db
    def test_without_a_code_nothing_changes(self, session_client, workspace, project):
        member = member_client(workspace, project, MEMBER)
        assert member.get(url(workspace, project, "items/")).status_code == 200

    @pytest.mark.django_db
    def test_members_and_guests_are_locked_out_of_every_page_but_admins_are_not(
        self, session_client, workspace, project
    ):
        setup_boq(session_client, workspace, project)
        set_code(session_client, workspace, project)
        member = member_client(workspace, project, MEMBER)
        guest = member_client(workspace, project, GUEST)
        for client in (member, guest):
            for page in ("items/", "boq/", "bills/", "logs/", "snags/", "history/", "attachments/", "report/"):
                response = client.get(url(workspace, project, page))
                assert response.status_code == 423, page
                assert response.json()["locked"] is True
        for page in ("items/", "boq/", "bills/"):
            assert session_client.get(url(workspace, project, page)).status_code == 200

    @pytest.mark.django_db
    def test_the_project_itself_still_answers_so_the_code_box_can_show(self, session_client, workspace, project):
        set_code(session_client, workspace, project)
        member = member_client(workspace, project, MEMBER)
        mine = member.get(url(workspace, project)).json()
        assert mine["access_locked"] is True and mine["has_access_code"] is True
        assert session_client.get(url(workspace, project)).json()["access_locked"] is False
        # but nothing can be changed on a locked project
        assert member.patch(url(workspace, project), {"client_name": "X"}, format="json").status_code == 423

    @pytest.mark.django_db
    def test_a_wrong_code_is_counted_and_five_wrong_ones_pause_the_person(self, session_client, workspace, project):
        set_code(session_client, workspace, project)
        member = member_client(workspace, project, MEMBER)
        first = member.post(url(workspace, project, "unlock/"), {"code": "000000"}, format="json")
        assert first.status_code == 400 and first.json()["tries_left"] == 4
        for _ in range(4):
            member.post(url(workspace, project, "unlock/"), {"code": "000000"}, format="json")
        paused = member.post(url(workspace, project, "unlock/"), {"code": CODE}, format="json")
        assert paused.status_code == 429  # even the right code waits
        assert member.get(url(workspace, project, "items/")).status_code == 423

    @pytest.mark.django_db
    def test_the_right_code_opens_it_for_that_login_only(self, session_client, workspace, project):
        set_code(session_client, workspace, project)
        member = member_client(workspace, project, MEMBER)
        assert member.post(url(workspace, project, "unlock/"), {"code": CODE}, format="json").status_code == 200
        assert member.get(url(workspace, project, "items/")).status_code == 200
        assert member.get(url(workspace, project)).json()["access_locked"] is False
        # a new login (new session) is asked again
        user = User.objects.get(email=f"user{MEMBER}@example.com")
        again = APIClient()
        again.force_authenticate(user=user)
        assert again.get(url(workspace, project, "items/")).status_code == 423
