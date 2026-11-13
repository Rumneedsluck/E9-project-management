# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Admin-only billing fields, no money for guests, and bills limited to what their JMC covers."""

# ruff: noqa: F811
import pytest

from plane.tests.contract.app.test_e9_boq_billing_app import (
    make_signages,
    member_client,
    project,  # noqa: F401  (fixture)
    setup_boq,
    sign_jmc,
    url,
)

GUEST, MEMBER = 5, 15


def _one_row(client, workspace, project):
    return client.post(url(workspace, project, "items/"), {"scope": "wall_graphics", "count": 1}, format="json").data[0]


@pytest.mark.contract
class TestBillingFieldsAreAdminOnly:
    @pytest.mark.django_db
    def test_a_member_can_edit_the_tracker_but_not_billing_fields(self, session_client, workspace, project):
        row = _one_row(session_client, workspace, project)
        member = member_client(workspace, project, MEMBER)
        item_url = url(workspace, project, f"items/{row['id']}/")
        assert member.patch(item_url, {"description": "Lobby wall"}, format="json").status_code == 200
        for field, value in [
            ("bill_now", "Yes"),
            ("bill_when", "Delivered"),
            ("certified_qty", "5"),
            ("certified_height_in", "10"),
            ("hold_status", "On Hold"),
        ]:
            response = member.patch(item_url, {field: value}, format="json")
            assert response.status_code == 403, field
            assert "admin" in response.data["error"].lower()

    @pytest.mark.django_db
    def test_bulk_changes_are_blocked_too_and_nothing_is_saved(self, session_client, workspace, project):
        row = _one_row(session_client, workspace, project)
        member = member_client(workspace, project, MEMBER)
        body = {
            "changes": [
                {"id": row["id"], "data": {"description": "Changed"}},
                {"id": row["id"], "data": {"bill_now": "Yes"}},
            ]
        }
        assert member.post(url(workspace, project, "items/bulk/"), body, format="json").status_code == 403
        listed = session_client.get(url(workspace, project, "items/")).data["items"][0]
        assert listed["description"] != "Changed"

    @pytest.mark.django_db
    def test_an_admin_can_change_them_and_the_list_says_who_may(self, session_client, workspace, project):
        row = _one_row(session_client, workspace, project)
        response = session_client.patch(
            url(workspace, project, f"items/{row['id']}/"), {"bill_now": "Yes", "certified_qty": "2"}, format="json"
        )
        assert response.status_code == 200
        assert session_client.get(url(workspace, project, "items/")).data["can_bill"] is True
        member = member_client(workspace, project, MEMBER)
        assert member.get(url(workspace, project, "items/")).data["can_bill"] is False


@pytest.mark.contract
class TestGuestsSeeNoMoney:
    @pytest.mark.django_db
    def test_guests_get_no_rates_pos_or_bills(self, session_client, workspace, project):
        setup_boq(session_client, workspace, project)
        guest = member_client(workspace, project, GUEST)
        data = guest.get(url(workspace, project, "boq/")).data
        assert data["pos"] == [] and data["bills"] == []
        assert data["lines"] and all(row["rate"] is None for row in data["lines"])
        assert guest.get(url(workspace, project, "bills/")).status_code == 403
        owner_data = session_client.get(url(workspace, project, "boq/")).data
        assert owner_data["pos"] and owner_data["lines"][0]["rate"] is not None

    @pytest.mark.django_db
    def test_the_company_billing_summary_leaves_projects_a_guest_may_only_view(
        self, session_client, workspace, project
    ):
        po, _ = setup_boq(session_client, workspace, project, qty="10")
        make_signages(session_client, workspace, project, count=1)
        sign_jmc(session_client, workspace, project)
        guest = member_client(workspace, project, GUEST)
        assert guest.get(f"/api/workspaces/{workspace.slug}/e9/summary/").data["projects"] == []
        assert session_client.get(f"/api/workspaces/{workspace.slug}/e9/summary/").data["projects"]


@pytest.mark.contract
class TestBillIsLimitedToItsJmc:
    @pytest.mark.django_db
    def test_a_floor_jmc_bill_cannot_certify_more_than_that_floor_holds(self, session_client, workspace, project):
        po, line_id = setup_boq(session_client, workspace, project, qty="10")
        rows = make_signages(session_client, workspace, project, count=4)
        for index, row in enumerate(rows):
            session_client.patch(
                url(workspace, project, f"items/{row['id']}/"),
                {
                    "floor_area": "1st Floor" if index < 2 else "2nd Floor",
                    "installation_status": "Installation Done",
                    "client_sign_off": "Signed Off",
                },
                format="json",
            )
        cert = sign_jmc(session_client, workspace, project, floor="2nd Floor")["certifications"][0]["id"]
        bills = url(workspace, project, "bills/")
        too_many = {"po": po, "certification": cert, "lines": [{"boq_line": line_id, "certified_qty": "3"}]}
        response = session_client.post(bills, too_many, format="json")
        assert response.status_code == 400 and "JMC" in str(response.data)
        just_right = {**too_many, "lines": [{"boq_line": line_id, "certified_qty": "2"}]}
        assert session_client.post(bills, just_right, format="json").status_code == 201
