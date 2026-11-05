# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, User, WorkspaceMember
from plane.e9.models import E9ChangeLog


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Fictional Plaza", identifier="FP", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


def url(workspace, project, path=""):
    return f"/api/workspaces/{workspace.slug}/e9/projects/{project.id}/{path}"


def member_client(workspace, project, role):
    user = User.objects.create(email=f"user{role}@example.com", username=f"user{role}")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, role=role)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def make_signages(client, workspace, project, count, qty_each=1, boq_no="BO1"):
    rows = client.post(
        url(workspace, project, "items/"), {"scope": "internal_signages", "count": count}, format="json"
    ).data
    for row in rows:
        client.patch(
            url(workspace, project, f"items/{row['id']}/"),
            {"description": "Door sign", "qty": str(qty_each), "boq_item_no": boq_no},
            format="json",
        )
    return rows


def setup_boq(client, workspace, project, qty="100"):
    data = client.post(url(workspace, project, "boq/pos/"), {"kind": "original", "number": "PO-1"}, format="json").data
    po = data["pos"][0]["id"]
    data = client.post(
        url(workspace, project, "boq/lines/"),
        {
            "po": po,
            "line_no": "BO1",
            "scope": "internal_signages",
            "description": "Signages",
            "unit": "nos",
            "qty": qty,
            "rate": "1000",
        },
        format="json",
    ).data
    return po, data["lines"][0]["id"]


def line(client, workspace, project, line_no="BO1"):
    data = client.get(url(workspace, project, "boq/")).data
    return next(row for row in data["lines"] if row["line_no"] == line_no), data


@pytest.mark.contract
class TestBoqExtra:
    @pytest.mark.django_db
    def test_production_over_boq_is_red_until_a_confirmed_amendment_covers_it(self, session_client, workspace, project):
        po, line_id = setup_boq(session_client, workspace, project)
        make_signages(session_client, workspace, project, count=21, qty_each=5)  # 105 Nos on the tracker

        row, data = line(session_client, workspace, project)
        assert row["allowed"] == "100.00" and row["on_tracker"] == "105.00"
        assert row["status"] == "excess" and row["unapproved_extra"] == "5.00"
        assert data["totals"]["excess_lines"] == 1

        # client mail received, not confirmed yet -> amber
        data = session_client.post(
            url(workspace, project, "boq/amendments/"),
            {
                "po": po,
                "reference": "Mail: 5 more door signs",
                "status": "requested",
                "changes": [{"boq_line": line_id, "qty_change": "5"}],
            },
            format="json",
        ).data
        row = next(r for r in data["lines"] if r["line_no"] == "BO1")
        assert row["status"] == "pending" and row["pending"] == "5.00" and row["unapproved_extra"] == "0.00"

        # confirmed -> amended BOQ allows 105
        amendment = data["pos"][0]["amendments"][0]["id"]
        session_client.patch(
            url(workspace, project, f"boq/amendments/{amendment}/"), {"status": "confirmed"}, format="json"
        )
        row, _ = line(session_client, workspace, project)
        assert row["allowed"] == "105.00" and row["status"] == "ok"

    @pytest.mark.django_db
    def test_new_po_and_amendment_lines(self, session_client, workspace, project):
        setup_boq(session_client, workspace, project)
        data = session_client.post(
            url(workspace, project, "boq/pos/"), {"kind": "new", "number": "PO-2"}, format="json"
        ).data
        new_po = next(po for po in data["pos"] if po["kind"] == "new")
        assert new_po["title"] == "New PO PO-2"
        data = session_client.post(
            url(workspace, project, "boq/lines/"),
            {"po": new_po["id"], "line_no": "BO1", "unit": "nos", "qty": "3"},
            format="json",
        )
        assert data.status_code == 400  # BOQ numbers are unique per project

        # a new line asked for by mail counts only once confirmed
        data = session_client.post(
            url(workspace, project, "boq/amendments/"), {"po": new_po["id"], "status": "requested"}, format="json"
        ).data
        amendment = data["pos"][1]["amendments"][0]["id"]
        session_client.post(
            url(workspace, project, "boq/lines/"),
            {"po": new_po["id"], "amendment": amendment, "line_no": "BO2", "unit": "sqft", "qty": "40"},
            format="json",
        )
        row, _ = line(session_client, workspace, project, "BO2")
        assert row["allowed"] == "0.00" and row["pending"] == "40.00"

    @pytest.mark.django_db
    def test_rows_with_unknown_boq_no_are_listed(self, session_client, workspace, project):
        setup_boq(session_client, workspace, project)
        make_signages(session_client, workspace, project, count=2, boq_no="BO9")
        make_signages(session_client, workspace, project, count=1, boq_no="")
        data = session_client.get(url(workspace, project, "boq/")).data
        groups = {group["boq_no"]: group["count"] for group in data["unlinked"]}
        assert groups == {"BO9": 2, "": 1}

        summary = session_client.get(f"/api/workspaces/{workspace.slug}/e9/summary/").data["projects"]
        assert summary[0]["unlinked"][0]["boq_no"] == "BO9" and summary[0]["missing_boq_no"] == 1

    @pytest.mark.django_db
    def test_reprints_internal_not_billable_client_billable(self, session_client, workspace, project):
        _, line_id = setup_boq(session_client, workspace, project, qty="10")
        items = make_signages(session_client, workspace, project, count=10)
        for item in items:
            session_client.patch(
                url(workspace, project, f"items/{item['id']}/"),
                {"installation_status": "Installation Done"},
                format="json",
            )
        member = member_client(workspace, project, 15)
        response = member.post(
            url(workspace, project, "reprints/"),
            {"item": items[0]["id"], "cause": "internal", "qty": "1", "reason": "Colour mismatch"},
            format="json",
        )
        assert response.status_code == 201, response.data
        member.post(
            url(workspace, project, "reprints/"),
            {"boq_line": line_id, "cause": "client", "qty": "2", "reason": "Client changed the text"},
            format="json",
        )
        row, _ = line(session_client, workspace, project)
        assert row["internal_reprints"] == "1.00" and row["client_reprints"] == "2.00"
        assert row["status"] == "ok"  # our reprints are not extra production
        assert row["billable_now"] == "12.00" and row["max_billable"] == "12.00"

    @pytest.mark.django_db
    def test_only_admins_change_boq(self, session_client, workspace, project):
        setup_boq(session_client, workspace, project)
        member = member_client(workspace, project, 15)
        assert member.post(url(workspace, project, "boq/pos/"), {"kind": "new"}, format="json").status_code == 403
        assert member.get(url(workspace, project, "boq/")).status_code == 200


@pytest.mark.contract
class TestBilling:
    def _bill(self, client, workspace, project):
        po, line_id = setup_boq(client, workspace, project, qty="10")
        items = make_signages(client, workspace, project, count=12)
        for item in items:
            client.patch(
                url(workspace, project, f"items/{item['id']}/"),
                {"installation_status": "Installation Done"},
                format="json",
            )
        return po, line_id

    @pytest.mark.django_db
    def test_four_stages_in_order(self, session_client, workspace, project):
        po, line_id = self._bill(session_client, workspace, project)
        bills_url = url(workspace, project, "bills/")
        # 12 installed but only 10 approved: unapproved extra cannot be certified
        response = session_client.post(
            bills_url, {"po": po, "lines": [{"boq_line": line_id, "certified_qty": "12"}]}, format="json"
        )
        assert response.status_code == 400 and "amended" in response.data["lines"]
        # a PI cannot come before certification
        response = session_client.post(
            bills_url,
            {
                "po": po,
                "pi_number": "PI-1",
                "pi_date": "2026-11-10",
                "lines": [{"boq_line": line_id, "certified_qty": "10"}],
            },
            format="json",
        )
        assert response.status_code == 400 and "Certification" in response.data["pi_number"]

        data = session_client.post(
            bills_url, {"po": po, "lines": [{"boq_line": line_id, "certified_qty": "10"}]}, format="json"
        ).data
        bill = data["bills"][0]
        assert bill["stage"] == 0 and bill["certified_amount"] == "10000.00"
        detail = bills_url + f"{bill['id']}/"

        steps = [
            ({"cert_to_accounts_on": "2026-11-06"}, 400),  # needs the client's sign-off first
            ({"cert_signed_on": "2026-11-05", "cert_to_accounts_on": "2026-11-06"}, 1),
            ({"pi_number": "PI-77", "pi_date": "2026-11-08", "pi_amount": "11800"}, 2),
            ({"wcc_date": "2026-11-12"}, 400),  # WCC only after the PI is signed and submitted
            ({"pi_signed_on": "2026-11-09", "pi_submitted_on": "2026-11-10"}, 3),
            ({"wcc_number": "WCC-1", "wcc_date": "2026-11-12", "wcc_acknowledged_on": "2026-11-14"}, 4),
        ]
        for body, expected in steps:
            response = session_client.patch(detail, body, format="json")
            if expected == 400:
                assert response.status_code == 400, body
            else:
                assert response.status_code == 200, response.data
                assert response.data["bills"][0]["stage"] == expected

        # certified quantities are locked once with Accounts, and a PI'd bill can't be deleted
        response = session_client.patch(detail, {"lines": [{"boq_line": line_id, "certified_qty": "5"}]}, format="json")
        assert response.status_code == 400
        assert session_client.delete(detail).status_code == 400
        assert E9ChangeLog.objects.filter(project=project, entity="bill", field="pi_number").exists()

    @pytest.mark.django_db
    def test_second_bill_cannot_recertify_the_same_quantity(self, session_client, workspace, project):
        po, line_id = self._bill(session_client, workspace, project)
        bills_url = url(workspace, project, "bills/")
        session_client.post(
            bills_url, {"po": po, "lines": [{"boq_line": line_id, "certified_qty": "6"}]}, format="json"
        )
        response = session_client.post(
            bills_url, {"po": po, "lines": [{"boq_line": line_id, "certified_qty": "5"}]}, format="json"
        )
        assert response.status_code == 400
        response = session_client.post(
            bills_url, {"po": po, "lines": [{"boq_line": line_id, "certified_qty": "4"}]}, format="json"
        )
        assert response.status_code == 201

    @pytest.mark.django_db
    def test_summary_lists_bill_stage(self, session_client, workspace, project):
        po, line_id = self._bill(session_client, workspace, project)
        session_client.post(
            url(workspace, project, "bills/"),
            {
                "po": po,
                "cert_signed_on": "2026-11-05",
                "cert_to_accounts_on": "2026-11-06",
                "lines": [{"boq_line": line_id, "certified_qty": "10"}],
            },
            format="json",
        )
        summary = session_client.get(f"/api/workspaces/{workspace.slug}/e9/summary/").data["projects"]
        assert summary[0]["bills"][0]["stage"] == 1
        assert summary[0]["excess"][0]["line_no"] == "BO1"  # 12 on the tracker vs 10 allowed


@pytest.mark.contract
class TestLogs:
    @pytest.mark.django_db
    def test_jc_and_dc_logs_fill_from_tracker(self, session_client, workspace, project):
        rows = make_signages(session_client, workspace, project, count=3, qty_each=2)
        for row, jc, dcs in zip(rows, ["UE7377", "UE7377", "UE7400"], ["3500", "3500, 3501", ""]):
            session_client.patch(
                url(workspace, project, f"items/{row['id']}/"), {"jc_no": jc, "dc_nos": dcs}, format="json"
            )
        data = session_client.get(url(workspace, project, "logs/")).data
        jcs = {jc["number"]: jc["count"] for jc in data["job_cards"]}
        assert jcs == {"UE7377": 2, "UE7400": 1}
        dcs = {dc["number"]: (dc["count"], dc["nos"]) for dc in data["challans"]}
        assert dcs == {"3500": (2, "4.00"), "3501": (1, "2.00")}

        member = member_client(workspace, project, 15)
        response = member.put(
            url(workspace, project, "logs/jc/"),
            {"number": "UE7377", "vendor": "I Media", "received": "Yes"},
            format="json",
        )
        assert response.status_code == 200
        jc = next(jc for jc in response.data["job_cards"] if jc["number"] == "UE7377")
        assert jc["vendor"] == "I Media" and jc["received"] == "Yes" and jc["count"] == 2
        guest = member_client(workspace, project, 5)
        assert guest.put(url(workspace, project, "logs/dc/"), {"number": "3500"}, format="json").status_code == 403
