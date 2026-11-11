# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, User, WorkspaceMember
from plane.e9.models import E9Announcement, E9ChangeLog, E9ProjectProfile


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


def sign_jmc(client, workspace, project, **fields):
    body = {"jmc_date": "2026-01-05", "done_on": "2026-01-06", "client_signatory": "Site manager", **fields}
    response = client.post(url(workspace, project, "certifications/"), body, format="json")
    assert response.status_code == 201, response.data
    return response.data


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
            {"item": items[0]["id"], "cause": "e9", "qty": "1", "reason": "Colour mismatch"},
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
        self.cert = sign_jmc(client, workspace, project)["certifications"][0]["id"]
        return po, line_id

    @pytest.mark.django_db
    def test_four_stages_in_order(self, session_client, workspace, project):
        po, line_id = self._bill(session_client, workspace, project)
        bills_url = url(workspace, project, "bills/")
        # 12 installed but only 10 approved: unapproved extra cannot be certified
        response = session_client.post(
            bills_url,
            {"po": po, "certification": self.cert, "lines": [{"boq_line": line_id, "certified_qty": "12"}]},
            format="json",
        )
        assert response.status_code == 400 and "amended" in response.data["lines"]
        # a PI cannot come before certification
        response = session_client.post(
            bills_url,
            {
                "po": po,
                "certification": self.cert,
                "pi_number": "PI-1",
                "pi_date": "2026-11-10",
                "lines": [{"boq_line": line_id, "certified_qty": "10"}],
            },
            format="json",
        )
        assert response.status_code == 400 and "Certification" in response.data["pi_number"]

        data = session_client.post(
            bills_url,
            {"po": po, "certification": self.cert, "lines": [{"boq_line": line_id, "certified_qty": "10"}]},
            format="json",
        ).data
        bill = data["bills"][0]
        assert bill["stage"] == 0 and bill["certified_amount"] == "10000.00"
        detail = bills_url + f"{bill['id']}/"

        steps = [
            # the signed JMC already filled the sign-off date; next is handing it to Accounts
            ({"cert_to_accounts_on": "2026-11-06"}, 1),
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
            bills_url,
            {"po": po, "certification": self.cert, "lines": [{"boq_line": line_id, "certified_qty": "6"}]},
            format="json",
        )
        response = session_client.post(
            bills_url,
            {"po": po, "certification": self.cert, "lines": [{"boq_line": line_id, "certified_qty": "5"}]},
            format="json",
        )
        assert response.status_code == 400
        response = session_client.post(
            bills_url,
            {"po": po, "certification": self.cert, "lines": [{"boq_line": line_id, "certified_qty": "4"}]},
            format="json",
        )
        assert response.status_code == 201

    @pytest.mark.django_db
    def test_summary_lists_bill_stage(self, session_client, workspace, project):
        po, line_id = self._bill(session_client, workspace, project)
        session_client.post(
            url(workspace, project, "bills/"),
            {
                "po": po,
                "certification": self.cert,
                "cert_signed_on": "2026-11-05",
                "cert_to_accounts_on": "2026-11-06",
                "lines": [{"boq_line": line_id, "certified_qty": "10"}],
            },
            format="json",
        )
        summary = session_client.get(f"/api/workspaces/{workspace.slug}/e9/summary/").data["projects"]
        assert summary[0]["bills"][0]["stage"] == 1
        assert summary[0]["bills"][0]["amount"] == "10000.00"
        assert summary[0]["cert_state"] == "certified"


@pytest.mark.contract
class TestCertification:
    @pytest.mark.django_db
    def test_billing_waits_for_the_signed_jmc(self, session_client, workspace, project):
        po, line_id = setup_boq(session_client, workspace, project, qty="10")
        make_signages(session_client, workspace, project, count=3)
        bills_url = url(workspace, project, "bills/")
        body = {"po": po, "lines": [{"boq_line": line_id, "certified_qty": "3"}]}
        response = session_client.post(bills_url, body, format="json")
        assert response.status_code == 400 and "JMC" in response.data["error"]
        assert session_client.get(bills_url).data["billing_open"] is False

        # a JMC that is measured but not signed yet does not open billing
        cert = session_client.post(
            url(workspace, project, "certifications/"), {"jmc_date": "2026-01-05"}, format="json"
        ).data["certifications"][0]
        assert session_client.post(bills_url, body, format="json").status_code == 400

        session_client.patch(url(workspace, project, f"certifications/{cert['id']}/"), {"done_on": "2026-01-07"})
        response = session_client.post(bills_url, {**body, "certification": cert["id"]}, format="json")
        assert response.status_code == 201, response.data
        bill = response.data["bills"][0]
        assert bill["certification_label"] == "Whole project" and bill["cert_signed_on"] == "2026-01-07"
        # once billed, the JMC can't be undone or deleted
        detail = url(workspace, project, f"certifications/{cert['id']}/")
        assert session_client.patch(detail, {"done_on": ""}, format="json").status_code == 400
        assert session_client.delete(detail).status_code == 400

    @pytest.mark.django_db
    def test_a_signed_floor_jmc_opens_part_billing_and_bills_need_a_jmc(self, session_client, workspace, project):
        po, line_id = setup_boq(session_client, workspace, project, qty="10")
        make_signages(session_client, workspace, project, count=2)
        data = sign_jmc(session_client, workspace, project, floor="2nd Floor")
        assert data["billing_open"] is True and data["state"] == "part_certified"
        bills_url = url(workspace, project, "bills/")
        body = {"po": po, "lines": [{"boq_line": line_id, "certified_qty": "2"}]}
        response = session_client.post(bills_url, body, format="json")
        assert response.status_code == 400 and "certification" in response.data
        cert = data["certifications"][0]["id"]
        response = session_client.post(bills_url, {**body, "certification": cert}, format="json")
        assert response.status_code == 201
        assert response.data["bills"][0]["certification_label"] == "2nd Floor"
        assert response.data["bills"][0]["stage"] == 0  # next: give it to Accounts

    @pytest.mark.django_db
    def test_floor_and_scope_jmcs_and_project_state(self, session_client, workspace, project):
        profile = E9ProjectProfile.objects.create(project=project, workspace=workspace)
        rows = make_signages(session_client, workspace, project, count=2)
        for row in rows:
            session_client.patch(
                url(workspace, project, f"items/{row['id']}/"),
                {"floor_area": "3rd Floor", "certified_qty": "1"},
                format="json",
            )

        def project_state():
            listing = session_client.get(f"/api/workspaces/{workspace.slug}/e9/projects/").data
            return next(item["cert_state"] for item in listing if item["id"] == str(project.id))

        assert project_state() == "in_progress"
        profile.status = "sign_off"
        profile.save()
        assert project_state() == "jmc_pending"

        data = sign_jmc(session_client, workspace, project, floor="3rd Floor", scope="internal_signages")
        cert = data["certifications"][0]
        assert cert["label"] == "3rd Floor · Internal Signages"
        assert cert["readiness"] == {"rows": 2, "certified": 2, "installed": 0}
        assert "3rd Floor" in data["floors"]
        assert project_state() == "part_certified"

        # same floor + scope twice is refused, signed before measured is refused
        response = session_client.post(
            url(workspace, project, "certifications/"),
            {"floor": "3rd floor", "scope": "internal_signages"},
            format="json",
        )
        assert response.status_code == 400
        response = session_client.post(
            url(workspace, project, "certifications/"),
            {"jmc_date": "2026-01-10", "done_on": "2026-01-02"},
            format="json",
        )
        assert response.status_code == 400 and "done_on" in response.data

        sign_jmc(session_client, workspace, project)
        assert project_state() == "certified"

    @pytest.mark.django_db
    def test_members_cannot_certify(self, session_client, workspace, project):
        member = member_client(workspace, project, 15)
        response = member.post(url(workspace, project, "certifications/"), {"jmc_date": "2026-01-05"}, format="json")
        assert response.status_code == 403
        assert member.get(url(workspace, project, "certifications/")).status_code == 200


@pytest.mark.contract
class TestProgress:
    @pytest.mark.django_db
    def test_project_list_reports_installed_share_by_sq_ft(self, session_client, workspace, project):
        walls = session_client.post(
            url(workspace, project, "items/"), {"scope": "wall_graphics", "count": 2}, format="json"
        ).data
        # 144 x 144 in = 144 sq ft each; the first is installed
        for index, row in enumerate(walls):
            body = {"height_in": "144", "width_in": "144", "qty": "1"}
            if index == 0:
                body["installation_status"] = "Installation Done"
            session_client.patch(url(workspace, project, f"items/{row['id']}/"), body, format="json")
        make_signages(session_client, workspace, project, count=1, qty_each=4)
        listing = session_client.get(f"/api/workspaces/{workspace.slug}/e9/projects/").data
        progress = next(item["tracker"] for item in listing if item["id"] == str(project.id))
        assert progress["rows"] == 3
        assert progress["sqft_total"] == "288.00" and progress["sqft_done"] == "144.00"
        assert progress["nos_total"] == "4.00" and progress["nos_done"] == "0.00"
        assert progress["percent"] == 50


@pytest.mark.contract
class TestAmendedBoq:
    @pytest.mark.django_db
    def test_amended_qty_replaces_the_original(self, session_client, workspace, project):
        _, line_id = setup_boq(session_client, workspace, project, qty="10")
        make_signages(session_client, workspace, project, count=12)
        row, _ = line(session_client, workspace, project)
        assert row["allowed"] == "10.00" and row["is_amended"] is False and row["status"] == "excess"
        session_client.patch(
            url(workspace, project, f"boq/lines/{line_id}/"),
            {"amended_qty": "12", "amended_note": "Rev-2 BOQ mail 4 Nov"},
            format="json",
        )
        row, _ = line(session_client, workspace, project)
        assert row["allowed"] == "12.00" and row["qty"] == "10.00" and row["amended_qty"] == "12.00"
        assert row["is_amended"] is True and row["status"] == "ok"
        # clearing it goes back to the original
        session_client.patch(url(workspace, project, f"boq/lines/{line_id}/"), {"amended_qty": ""}, format="json")
        row, _ = line(session_client, workspace, project)
        assert row["allowed"] == "10.00" and row["amended_qty"] is None


@pytest.mark.contract
class TestSafetyRules:
    @pytest.mark.django_db
    def test_scripted_links_and_bad_ids_are_refused_cleanly(self, session_client, workspace, project):
        # a javascript: link in a PO / certification / photo link is refused ...
        po = session_client.post(
            url(workspace, project, "boq/pos/"), {"kind": "original", "link": "javascript:alert(1)"}, format="json"
        )
        assert po.status_code == 400 and "link" in po.data
        cert = session_client.post(
            url(workspace, project, "certifications/"), {"link": "data:text/html,<b>x</b>"}, format="json"
        )
        assert cert.status_code == 400 and "link" in cert.data
        row = make_signages(session_client, workspace, project, count=1)[0]
        photo = session_client.patch(
            url(workspace, project, f"items/{row['id']}/"), {"photo_link": "javascript:alert(1)"}, format="json"
        )
        assert photo.status_code == 400
        # ... a plain address is accepted (and a bare one gets https://)
        ok = session_client.post(
            url(workspace, project, "boq/pos/"),
            {"kind": "original", "link": "drive.google.com/file/d/1"},
            format="json",
        )
        assert ok.status_code == 201 and ok.data["pos"][0]["link"] == "https://drive.google.com/file/d/1"
        # a malformed id means 'not found', never a server error
        bad = session_client.post(
            url(workspace, project, "boq/lines/"), {"po": "not-an-id", "line_no": "X"}, format="json"
        )
        assert bad.status_code == 400


@pytest.mark.contract
class TestAnnouncements:
    @pytest.mark.django_db
    def test_only_admins_post_and_old_ones_hide(self, session_client, workspace, project):
        base = f"/api/workspaces/{workspace.slug}/e9/announcements/"
        member = member_client(workspace, project, 15)
        assert member.post(base, {"title": "Hi"}, format="json").status_code == 403
        assert session_client.post(base, {"title": ""}, format="json").status_code == 400
        assert session_client.post(base, {"title": "Old", "ends_on": "2020-01-01"}, format="json").status_code == 400
        session_client.post(base, {"title": "Site visit Friday", "important": True}, format="json")
        data = member.get(base).data
        assert data["can_post"] is False and data["announcements"][0]["title"] == "Site visit Friday"
        E9Announcement.objects.update(ends_on="2020-01-01")
        assert member.get(base).data["announcements"] == []
        E9Announcement.objects.update(ends_on=None)
        announcement_id = data["announcements"][0]["id"]
        assert member.delete(base + f"{announcement_id}/").status_code == 403
        assert session_client.delete(base + f"{announcement_id}/").data["announcements"] == []


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
        # two DCs on one row and no DC Qty typed: the split is unknown until the quantities are typed
        assert dcs == {"3500": (2, "2.00"), "3501": (1, "0")}

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


@pytest.mark.contract
class TestTemplateColumns:
    def _wall(self, client, workspace, project, **fields):
        row = client.post(url(workspace, project, "items/"), {"scope": "wall_graphics"}, format="json").data[0]
        body = {"description": "Wall 1", "height_in": "120", "width_in": "144", **fields}
        return client.patch(url(workspace, project, f"items/{row['id']}/"), body, format="json")

    @pytest.mark.django_db
    def test_production_size_dispatch_balance_and_certified(self, session_client, workspace, project):
        # measured 120 x 144 in = 120 sq ft; production 122 x 146 = 123.69 sq ft
        response = self._wall(
            session_client,
            workspace,
            project,
            production_height_in="122",
            production_width_in="146",
            dc_nos="3500, 3501",
            dc_qty="100, 20",
            certified_height_in="120",
            certified_width_in="140",
        )
        assert response.status_code == 200, response.data
        item = response.data
        assert item["area_sqft"] == "120.00" and item["production_measure"] == "123.69"
        assert item["wastage"] == "3.69"
        assert item["dispatched"] == "120.00" and item["balance"] == "3.69"
        assert item["certified_measure"] == "116.67"
        assert item["dc_list"] == [{"dc": "3500", "qty": "100.00"}, {"dc": "3501", "qty": "20.00"}]

        bad = session_client.patch(
            url(workspace, project, f"items/{item['id']}/"), {"dc_qty": "100, abc"}, format="json"
        )
        assert bad.status_code == 400

    @pytest.mark.django_db
    def test_dc_log_shows_part_quantities_per_dc(self, session_client, workspace, project):
        self._wall(session_client, workspace, project, dc_nos="3500, 3501", dc_qty="100, 20")
        self._wall(session_client, workspace, project, dc_nos="3500", dispatch_status="Dispatched")
        challans = {dc["number"]: dc for dc in session_client.get(url(workspace, project, "logs/")).data["challans"]}
        assert challans["3500"]["count"] == 2 and challans["3500"]["sqft"] == "220.00"  # 100 + the whole of W2
        assert challans["3501"]["sqft"] == "20.00"
        sent = {row["code"]: (row["sent"], row["partial"]) for row in challans["3500"]["items"]}
        assert sent == {"W1": ("100.00", True), "W2": ("120.00", False)}

    @pytest.mark.django_db
    def test_reprint_qty_from_item_tile_and_pieces(self, session_client, workspace, project):
        item = self._wall(session_client, workspace, project).data
        data = session_client.post(
            url(workspace, project, "reprints/"),
            {
                "item": item["id"],
                "kind": "reprint",
                "cause": "e9",
                "reason": "Print defect",
                "reprint_width_in": "48",
                "pieces": "2",
            },
            format="json",
        ).data
        reprint = data["reprints"][0]
        # one 120 x 48 tile = 40 sq ft, two pieces = 80 sq ft
        assert reprint["qty"] == "80.00" and reprint["size_used"] == "120.00 × 48.00 in"
        assert reprint["item_code"] == "W1" and reprint["unit"] == "sqft"
        listing = session_client.get(url(workspace, project, "items/")).data["items"]
        assert listing[0]["resent"] == "Reprint x1"

    @pytest.mark.django_db
    def test_snag_list(self, session_client, workspace, project):
        item = self._wall(session_client, workspace, project).data
        data = session_client.post(
            url(workspace, project, "snags/"),
            {"item": item["id"], "reason": "Peeling / bubbles", "priority": "High", "assigned_to": "Team A"},
            format="json",
        ).data
        snag = data["snags"][0]
        assert data["open"] == 1 and snag["item_code"] == "W1" and snag["status"] == "Open" and snag["days_open"] == 0
        data = session_client.patch(
            url(workspace, project, f"snags/{snag['id']}/"), {"status": "Closed"}, format="json"
        ).data
        assert data["open"] == 0 and data["snags"][0]["closed_on"]
        guest = member_client(workspace, project, 5)
        assert guest.post(url(workspace, project, "snags/"), {"reason": "Other"}, format="json").status_code == 403
