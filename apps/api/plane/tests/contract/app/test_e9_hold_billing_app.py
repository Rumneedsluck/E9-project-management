# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import io
from datetime import date, timedelta

import openpyxl
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from plane.db.models import Project, ProjectMember
from plane.e9.models import E9ProjectScope, E9ScopeItem


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Fictional Plaza", identifier="FP", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


def url(workspace, project, path=""):
    return f"/api/workspaces/{workspace.slug}/e9/projects/{project.id}/{path}"


def make_signages(client, workspace, project, count):
    rows = client.post(
        url(workspace, project, "items/"), {"scope": "internal_signages", "count": count}, format="json"
    ).data
    for row in rows:
        client.patch(
            url(workspace, project, f"items/{row['id']}/"),
            {"description": "Door sign", "qty": "1", "boq_item_no": "BO1"},
            format="json",
        )
    return rows


def patch(client, workspace, project, item, **fields):
    response = client.patch(url(workspace, project, f"items/{item['id']}/"), fields, format="json")
    assert response.status_code == 200, response.data
    return response.data


def setup_boq(client, workspace, project, qty="100"):
    po = client.post(url(workspace, project, "boq/pos/"), {"kind": "original", "number": "PO-1"}, format="json")
    client.post(
        url(workspace, project, "boq/lines/"),
        {
            "po": po.data["pos"][0]["id"],
            "line_no": "BO1",
            "scope": "internal_signages",
            "description": "Signages",
            "unit": "nos",
            "qty": qty,
            "rate": "1000",
        },
        format="json",
    )


def boq_line(client, workspace, project):
    return client.get(url(workspace, project, "boq/")).data["lines"][0]


@pytest.mark.contract
class TestHoldAndCancelRules:
    @pytest.mark.django_db
    def test_held_items_stay_in_totals_without_progress_and_cancelled_leave_every_number(
        self, session_client, workspace, project
    ):
        setup_boq(session_client, workspace, project)
        items = make_signages(session_client, workspace, project, 4)
        for item in items:
            patch(session_client, workspace, project, item, installation_status="Installation Done")
        held = patch(session_client, workspace, project, items[1], hold_status="On Hold", hold_reason="Site not ready")
        cancelled = patch(session_client, workspace, project, items[2], hold_status="Cancelled")
        assert held["current_stage"] == "On Hold" and cancelled["current_stage"] == "Cancelled"

        listing = session_client.get(f"/api/workspaces/{workspace.slug}/e9/projects/").data
        row = next(entry for entry in listing if entry["id"] == str(project.id))
        # 3 items count (cancelled one is gone); the held one is in the total but not in "done"
        assert row["tracker"]["rows"] == 3
        assert row["tracker"]["nos_total"] == "3.00" and row["tracker"]["nos_done"] == "2.00"

        line = boq_line(session_client, workspace, project)
        assert line["on_tracker"] == "3.00"  # cancelled leaves, held stays
        assert line["installed"] == "2.00"  # held shows no progress

        # releasing the held item brings its progress back
        patch(session_client, workspace, project, items[1], hold_status="")
        assert boq_line(session_client, workspace, project)["installed"] == "3.00"

    @pytest.mark.django_db
    def test_bad_values_are_refused(self, session_client, workspace, project):
        item = make_signages(session_client, workspace, project, 1)[0]
        bad = session_client.patch(
            url(workspace, project, f"items/{item['id']}/"), {"hold_status": "Parked"}, format="json"
        )
        assert bad.status_code == 400
        bad = session_client.patch(
            url(workspace, project, f"items/{item['id']}/"), {"bill_when": "Whenever"}, format="json"
        )
        assert bad.status_code == 400


@pytest.mark.contract
class TestBillWhen:
    @pytest.mark.django_db
    def test_items_bill_when_signed_off_or_delivered(self, session_client, workspace, project):
        setup_boq(session_client, workspace, project)
        items = make_signages(session_client, workspace, project, 3)
        for item in items:
            patch(session_client, workspace, project, item, installation_status="Installation Done")
        # installed alone is no longer enough
        assert boq_line(session_client, workspace, project)["billable_now"] == "0.00"

        patch(session_client, workspace, project, items[0], client_sign_off="Signed Off")
        assert boq_line(session_client, workspace, project)["billable_now"] == "1.00"

        # one item can override the scope: bill that one on delivery
        patch(session_client, workspace, project, items[1], bill_when="Delivered", dispatch_status="Delivered at Site")
        assert boq_line(session_client, workspace, project)["billable_now"] == "2.00"

        # the certified quantity is what counts when typed
        patch(session_client, workspace, project, items[0], certified_qty="3")
        assert boq_line(session_client, workspace, project)["billable_now"] == "4.00"

    @pytest.mark.django_db
    def test_scope_setting_switches_the_whole_scope_to_delivery(self, session_client, workspace, project):
        setup_boq(session_client, workspace, project)
        items = make_signages(session_client, workspace, project, 2)
        patch(session_client, workspace, project, items[0], dispatch_status="Delivered at Site")
        patch(session_client, workspace, project, items[1], client_sign_off="Signed Off")
        assert boq_line(session_client, workspace, project)["billable_now"] == "1.00"  # signed off

        scopes = session_client.get(url(workspace, project, "scopes/")).data
        assert all(scope["bill_when"] == "Signed off" for scope in scopes)
        for scope in scopes:
            if scope["key"] == "internal_signages":
                scope["bill_when"] = "Delivered"
        saved = session_client.put(url(workspace, project, "scopes/"), {"scopes": scopes}, format="json")
        assert saved.status_code == 200, saved.data
        assert E9ProjectScope.objects.get(project=project, key="internal_signages").bill_when == "Delivered"
        assert boq_line(session_client, workspace, project)["billable_now"] == "1.00"  # now the delivered one

        scopes[0]["bill_when"] = "Sometime"
        assert (
            session_client.put(url(workspace, project, "scopes/"), {"scopes": scopes}, format="json").status_code == 400
        )

    @pytest.mark.django_db
    def test_held_items_bill_only_with_bill_now_and_production_done_and_cancelled_never(
        self, session_client, workspace, project
    ):
        setup_boq(session_client, workspace, project)
        items = make_signages(session_client, workspace, project, 3)
        for item in items:
            patch(session_client, workspace, project, item, client_sign_off="Signed Off")
        assert boq_line(session_client, workspace, project)["billable_now"] == "3.00"
        patch(session_client, workspace, project, items[0], hold_status="On Hold")
        patch(session_client, workspace, project, items[1], hold_status="Cancelled")
        # only the untouched signed-off item bills; the held one needs Bill now + production
        assert boq_line(session_client, workspace, project)["billable_now"] == "1.00"

        patch(session_client, workspace, project, items[0], bill_now="Yes")
        assert boq_line(session_client, workspace, project)["billable_now"] == "1.00"  # production not done yet
        patch(session_client, workspace, project, items[0], production_status="Production Done")
        assert boq_line(session_client, workspace, project)["billable_now"] == "2.00"
        # the cancelled item never bills, even with Bill now = Yes
        patch(session_client, workspace, project, items[1], bill_now="Yes", production_status="Production Done")
        assert boq_line(session_client, workspace, project)["billable_now"] == "2.00"


@pytest.mark.contract
class TestHoldReportAndHealth:
    @pytest.mark.django_db
    def test_hold_lists_report_and_health_check(self, session_client, workspace, project):
        setup_boq(session_client, workspace, project)
        items = make_signages(session_client, workspace, project, 4)
        long_ago = (date.today() - timedelta(days=10)).isoformat()
        patch(
            session_client,
            workspace,
            project,
            items[0],
            hold_status="On Hold",
            hold_reason="Item replaced by another scope",
            hold_since=long_ago,
            bill_now="Yes",
        )
        patch(session_client, workspace, project, items[1], hold_status="On Hold", hold_reason="Site not ready")
        patch(session_client, workspace, project, items[2], hold_status="Cancelled", hold_reason="Cancelled by client")
        patch(session_client, workspace, project, items[3], installation_status="Installation Done")

        lists = session_client.get(url(workspace, project, "hold/")).data
        assert [row["code"] for row in lists["held"]] == ["IS1", "IS2"]
        assert lists["held"][0]["days"] == 10 and lists["held"][0]["replacement"] == "missing"
        assert [row["code"] for row in lists["cancelled"]] == ["IS3"]
        assert "Site not ready" in lists["reasons"]

        # replaced-by pointing at a real item code is fine
        patch(session_client, workspace, project, items[0], replaced_by="is4")
        assert session_client.get(url(workspace, project, "hold/")).data["held"][0]["replacement"] == "ok"

        health = session_client.get(url(workspace, project, "health/")).data
        by_key = {check["key"]: check for check in health["checks"]}
        assert by_key["replacement"]["count"] == 0
        # Bill now = Yes on a held row whose production is not done
        assert by_key["bill_now"]["count"] == 1 and by_key["bill_now"]["items"][0]["code"] == "IS1"
        assert health["problems"] == 1 and health["on_hold"] == 2 and health["cancelled"] == 1

        report = session_client.get(url(workspace, project, "report/")).data
        assert report["headline"]["items"] == 3 and report["headline"]["on_hold"] == 2
        assert report["headline"]["cancelled"] == 1 and report["headline"]["percent_installed"] == 33
        scope = next(row for row in report["by_scope"] if row["scope"] == "internal_signages")
        assert scope["items"] == 3 and scope["installed"] == 1 and scope["on_hold"] == 2
        assert report["billing"]["billable_items"] == 0 and len(report["stages"]) == 6

    @pytest.mark.django_db
    def test_guests_without_access_get_not_found(self, workspace, project):
        from rest_framework.test import APIClient

        anonymous = APIClient()
        for path in ("hold/", "health/", "report/"):
            assert anonymous.get(url(workspace, project, path)).status_code in (401, 403)


def tracker_workbook():
    """A small workbook with the template's new columns (made-up data)."""
    workbook = openpyxl.Workbook()
    walls = workbook.active
    walls.title = "Wall Graphics"
    headers = [
        "#",
        "Item Code",
        "BOQ Item No.",
        "Floor / Area",
        "Description",
        "Height (in)",
        "Width (in)",
        "Qty (Nos.)",
        "On Hold /\nCancelled?",
        "Reason",
        "Since\n(date)",
        "Replaced by\n(item code) / note",
        "Bill now?\n(hold / hand-over)",
        "Bill when?\n(blank = scope default)",
    ]
    for column, header in enumerate(headers, start=1):
        walls.cell(6, column, header)
    rows = [
        [1, None, "BO1", "Lobby", "Wall one", 100, 50, 1, None, None, None, None, None, None],
        [
            2,
            None,
            "BO1",
            "Lobby",
            "Wall two",
            100,
            50,
            1,
            "On Hold",
            "Site not ready",
            date(2026, 11, 1),
            None,
            "Yes",
            "Delivered",
        ],
        [
            3,
            None,
            "BO1",
            "Lobby",
            "Wall three",
            100,
            50,
            1,
            "Cancelled",
            "Cancelled by client",
            date(2026, 11, 2),
            "see W1",
            None,
            None,
        ],
        [4, None, "BO1", "Lobby", "Wall four", 100, 50, 1, "Parked", None, None, None, "Maybe", "Someday"],
    ]
    for row_number, values in enumerate(rows, start=7):
        for column, value in enumerate(values, start=1):
            if value is not None:
                walls.cell(row_number, column, value)
    billing = workbook.create_sheet("Billing")
    billing["A4"], billing["J4"] = "Scope", "Bill when? (scope default)"
    billing["A5"], billing["J5"] = "Wall Graphics", "Delivered"
    billing["A6"], billing["J6"] = "Glass Film", "Signed off"
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


@pytest.mark.contract
class TestImportReadsHoldAndBilling:
    @pytest.mark.django_db
    def test_import_reads_hold_cancel_and_bill_when(self, session_client, workspace, project):
        upload = SimpleUploadedFile("tracker.xlsx", tracker_workbook())
        response = session_client.post(url(workspace, project, "import/"), {"file": upload}, format="multipart")
        assert response.status_code == 201, response.data
        assert response.data["on_hold"] == 1 and response.data["cancelled"] == 1
        # 'Parked' / 'Maybe' / 'Someday' are not options: skipped with a warning, the row still imports
        assert any("Parked" in warning for warning in response.data["warnings"])

        rows = {item.description: item for item in E9ScopeItem.objects.filter(project=project)}
        assert rows["Wall one"].hold_status == "" and rows["Wall four"].hold_status == ""
        held = rows["Wall two"]
        assert (held.hold_status, held.hold_reason, held.bill_now, held.bill_when) == (
            "On Hold",
            "Site not ready",
            "Yes",
            "Delivered",
        )
        assert held.hold_since == date(2026, 11, 1)
        assert rows["Wall three"].hold_status == "Cancelled" and rows["Wall three"].replaced_by == "see W1"
        assert E9ProjectScope.objects.get(project=project, key="wall_graphics").bill_when == "Delivered"
        assert E9ProjectScope.objects.get(project=project, key="glass_film").bill_when == "Signed off"
