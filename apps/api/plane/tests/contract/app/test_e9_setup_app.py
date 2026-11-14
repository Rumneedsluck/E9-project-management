# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import io
import json
from datetime import date

import openpyxl
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, User, WorkspaceMember
from plane.e9.models import E9Attachment, E9ChangeLog, E9Floor, E9ProjectProfile, E9ScopeItem


@pytest.fixture(autouse=True)
def upload_root(settings, tmp_path):
    settings.E9_UPLOAD_ROOT = str(tmp_path / "uploads")


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Fictional Tower", identifier="FT", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


def url(workspace, project, path=""):
    return f"/api/workspaces/{workspace.slug}/e9/projects/{project.id}/{path}"


def guest_client(workspace, project):
    user = User.objects.create(email="guest@example.com", username="guest")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, role=5)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def scopes_payload(client, workspace, project):
    return [
        {key: row[key] for key in ("key", "label", "prefix", "unit_mode", "enabled", "size_unit")}
        for row in client.get(url(workspace, project, "scopes/")).data
    ]


@pytest.mark.contract
class TestScopes:
    @pytest.mark.django_db
    def test_existing_project_starts_with_nine_standard_scopes(self, session_client, workspace, project):
        rows = session_client.get(url(workspace, project, "scopes/")).data
        assert [row["prefix"] for row in rows] == ["W", "GF", "IS", "ES", "3D", "FR", "HP", "NT", "OT"]
        assert all(row["enabled"] for row in rows)

    @pytest.mark.django_db
    def test_a_sheet_can_be_typed_in_feet_or_mm_and_other_values_are_refused(self, session_client, workspace, project):
        rows = scopes_payload(session_client, workspace, project)
        assert all(row["size_unit"] == "in" for row in rows)  # nothing existing changes
        for row in rows:
            if row["key"] == "wall_graphics":
                row["size_unit"] = "ft"
            if row["key"] == "frames":
                row["size_unit"] = "mm"
        response = session_client.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json")
        assert response.status_code == 200, response.data
        by_key = {row["key"]: row["size_unit"] for row in response.data}
        assert by_key["wall_graphics"] == "ft" and by_key["frames"] == "mm" and by_key["glass_film"] == "in"
        rows[0]["size_unit"] = "yards"
        assert (
            session_client.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json").status_code == 400
        )

    def test_switch_off_add_custom_and_change_unit(self, session_client, workspace, project):
        rows = scopes_payload(session_client, workspace, project)
        for row in rows:
            row["enabled"] = row["key"] in ("wall_graphics", "internal_signages")
            if row["key"] == "wall_graphics":
                row["unit_mode"] = "nos"  # this site counts walls by number
        rows.append({"label": "Acrylic Letters", "prefix": "al", "unit_mode": "sqft", "enabled": True})
        response = session_client.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json")
        assert response.status_code == 200, response.data
        enabled = [row["label"] for row in response.data if row["enabled"]]
        assert enabled == ["Wall Graphics", "Internal Signages", "Acrylic Letters"]
        custom = next(row for row in response.data if row["label"] == "Acrylic Letters")
        assert custom["prefix"] == "AL" and custom["key"].startswith("custom_")

        # a switched-off scope cannot get new rows
        items_url = url(workspace, project, "items/")
        assert session_client.post(items_url, {"scope": "glass_film"}, format="json").status_code == 400
        # the custom scope gets its own codes and unit
        row = session_client.post(items_url, {"scope": custom["key"], "count": 2}, format="json").data
        assert [item["item_code"] for item in row] == ["AL1", "AL2"]
        patched = session_client.patch(
            items_url + f"{row[0]['id']}/", {"height_in": "24", "width_in": "36"}, format="json"
        ).data
        assert patched["unit"] == "sqft" and patched["area_sqft"] == "6.00"
        # walls now count in Nos even with a size
        wall = session_client.post(
            items_url, {"scope": "wall_graphics", "height_in": "120", "width_in": "120"}, format="json"
        )
        assert wall.data[0]["unit"] == "nos"

    @pytest.mark.django_db
    def test_a_scope_keeps_how_it_is_measured_and_made_and_lands_on_the_company_list(
        self, session_client, workspace, project
    ):
        rows = scopes_payload(session_client, workspace, project)
        rows.append(
            {
                "label": "Writing Film",
                "prefix": "WF",
                "unit_mode": "sqft",
                "enabled": True,
                "measure_note": "Glass panel H x W, add 2in each side",
                "production_note": "Supplied as roll, cut on site",
                "notes": "No printing unless the client asks",
            }
        )
        response = session_client.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json")
        assert response.status_code == 200, response.data
        film = next(row for row in response.data if row["label"] == "Writing Film")
        assert film["measure_note"].startswith("Glass panel") and film["production_note"].startswith("Supplied")
        # it is now on the company list, ready for the next project
        listed = session_client.get(f"/api/workspaces/{workspace.slug}/e9/scope-templates/").data
        assert [(row["label"], row["prefix"], row["notes"]) for row in listed] == [
            ("Writing Film", "WF", "No printing unless the client asks")
        ]
        # editing it on the project updates the same company entry (no duplicates, any capitals)
        rows = [{**row, "label": "writing film"} if row["label"] == "Writing Film" else row for row in response.data]
        film_row = next(row for row in rows if row["label"] == "writing film")
        film_row["notes"] = "Printing possible"
        session_client.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json")
        listed = session_client.get(f"/api/workspaces/{workspace.slug}/e9/scope-templates/").data
        assert len(listed) == 1 and listed[0]["notes"] == "Printing possible"
        # standard scopes never go on the company list, even with notes
        assert all(row["label"] != "Wall Graphics" for row in listed)

    @pytest.mark.django_db
    def test_only_workspace_admins_take_a_scope_off_the_company_list(self, session_client, workspace, project):
        rows = scopes_payload(session_client, workspace, project)
        rows.append({"label": "Dinoc", "prefix": "DN", "unit_mode": "sqft", "enabled": True})
        session_client.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json")
        template = session_client.get(f"/api/workspaces/{workspace.slug}/e9/scope-templates/").data[0]
        detail = f"/api/workspaces/{workspace.slug}/e9/scope-templates/{template['id']}/"
        assert guest_client(workspace, project).delete(detail).status_code == 403
        assert session_client.delete(detail).status_code == 204
        assert session_client.get(f"/api/workspaces/{workspace.slug}/e9/scope-templates/").data == []
        # the project keeps its own copy of the scope
        assert any(row["label"] == "Dinoc" for row in session_client.get(url(workspace, project, "scopes/")).data)

    @pytest.mark.django_db
    def test_scope_with_items_cannot_be_removed_or_recoded(self, session_client, workspace, project):
        rows = scopes_payload(session_client, workspace, project)
        rows.append({"label": "Vinyl Stickers", "prefix": "VS", "unit_mode": "either", "enabled": True})
        rows = session_client.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json").data
        custom = next(row for row in rows if row["label"] == "Vinyl Stickers")
        session_client.post(url(workspace, project, "items/"), {"scope": custom["key"]}, format="json")

        payload = [{k: row[k] for k in ("key", "label", "prefix", "unit_mode", "enabled")} for row in rows]
        without_custom = [row for row in payload if row["key"] != custom["key"]]
        assert (
            session_client.put(
                url(workspace, project, "scopes/"), {"scopes": without_custom}, format="json"
            ).status_code
            == 400
        )
        recoded = [dict(row, prefix="VX") if row["key"] == custom["key"] else row for row in payload]
        assert (
            session_client.put(url(workspace, project, "scopes/"), {"scopes": recoded}, format="json").status_code
            == 400
        )
        duplicate = [dict(row, prefix="W") if row["key"] == custom["key"] else row for row in payload]
        assert (
            session_client.put(url(workspace, project, "scopes/"), {"scopes": duplicate}, format="json").status_code
            == 400
        )

    @pytest.mark.django_db
    def test_guest_cannot_change_scopes(self, session_client, workspace, project):
        rows = scopes_payload(session_client, workspace, project)
        guest = guest_client(workspace, project)
        assert guest.put(url(workspace, project, "scopes/"), {"scopes": rows}, format="json").status_code == 403


@pytest.mark.contract
class TestFloors:
    @pytest.mark.django_db
    def test_add_many_floors_rename_and_mark(self, session_client, workspace, project):
        names = ["Ground"] + [f"Floor {n}" for n in range(1, 18)]
        response = session_client.post(url(workspace, project, "floors/"), {"names": names}, format="json")
        assert response.status_code == 201 and len(response.data) == 18

        item = session_client.post(
            url(workspace, project, "items/"), {"scope": "wall_graphics", "floor_area": "Floor 17"}, format="json"
        ).data[0]
        floor = E9Floor.objects.get(project=project, name="Floor 17")
        response = session_client.patch(
            url(workspace, project, f"floors/{floor.id}/"),
            {"name": "17th Floor", "status": "Handed Over", "target_date": "2026-12-01"},
            format="json",
        )
        assert response.status_code == 200
        assert E9ScopeItem.objects.get(pk=item["id"]).floor_area == "17th Floor"
        # floors with items cannot be deleted
        assert session_client.delete(url(workspace, project, f"floors/{floor.id}/")).status_code == 400

    @pytest.mark.django_db
    def test_typing_a_new_floor_on_an_item_creates_it(self, session_client, workspace, project):
        item = session_client.post(url(workspace, project, "items/"), {"scope": "frames"}, format="json").data[0]
        session_client.patch(url(workspace, project, f"items/{item['id']}/"), {"floor_area": "Terrace"}, format="json")
        assert E9Floor.objects.filter(project=project, name="Terrace").exists()


def tiny_png():
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )


@pytest.mark.contract
class TestAttachments:
    @pytest.mark.django_db
    def test_upload_view_and_delete_item_photos(self, session_client, workspace, project):
        item = session_client.post(url(workspace, project, "items/"), {"scope": "wall_graphics"}, format="json").data[0]
        files = [
            SimpleUploadedFile("wall-01.png", tiny_png(), content_type="image/png"),
            SimpleUploadedFile("wall-01b.png", tiny_png(), content_type="image/png"),
        ]
        response = session_client.post(
            url(workspace, project, "attachments/"),
            {"kind": "photo", "item": item["id"], "files": files},
            format="multipart",
        )
        assert response.status_code == 201, response.data
        assert len(response.data) == 2 and response.data[0]["has_file"]

        photo_id = response.data[0]["id"]
        content = session_client.get(url(workspace, project, f"attachments/{photo_id}/file/"))
        assert content.status_code == 200
        assert b"".join(content.streaming_content) == tiny_png()

        listing = session_client.get(url(workspace, project, f"attachments/?item={item['id']}")).data
        assert len(listing) == 2
        assert session_client.delete(url(workspace, project, f"attachments/{photo_id}/")).status_code == 204
        assert E9Attachment.objects.filter(item_id=item["id"]).count() == 1

    @pytest.mark.django_db
    def test_site_audit_pdf_with_version(self, session_client, workspace, project):
        pdf = SimpleUploadedFile("audit.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        response = session_client.post(
            url(workspace, project, "attachments/"),
            {
                "kind": "site_audit",
                "label": "Visit 1 - 12 Nov",
                "version": "Final",
                "sent_on": "2026-11-13",
                "files": [pdf],
            },
            format="multipart",
        )
        assert response.status_code == 201
        assert response.data[0]["version"] == "Final" and response.data[0]["label"] == "Visit 1 - 12 Nov"

    @pytest.mark.django_db
    def test_rejects_other_file_types_and_guests(self, session_client, workspace, project):
        svg = SimpleUploadedFile("x.svg", b"<svg onload=alert(1)>", content_type="image/svg+xml")
        upload_url = url(workspace, project, "attachments/")
        assert session_client.post(upload_url, {"files": svg}, format="multipart").status_code == 400
        disguised = SimpleUploadedFile("x.png", b"<svg onload=alert(1)>", content_type="image/png")
        assert session_client.post(upload_url, {"files": disguised}, format="multipart").status_code == 400
        bad = SimpleUploadedFile("notes.exe", b"MZ", content_type="application/octet-stream")
        response = session_client.post(
            url(workspace, project, "attachments/"), {"kind": "document", "files": [bad]}, format="multipart"
        )
        assert response.status_code == 400
        guest = guest_client(workspace, project)
        photo = SimpleUploadedFile("a.png", tiny_png(), content_type="image/png")
        assert (
            guest.post(url(workspace, project, "attachments/"), {"files": [photo]}, format="multipart").status_code
            == 403
        )


@pytest.mark.contract
class TestHistory:
    @pytest.mark.django_db
    def test_activity_counts_changes_per_day_for_the_heatmap(self, session_client, workspace, project):
        item = session_client.post(url(workspace, project, "items/"), {"scope": "wall_graphics"}, format="json").data[0]
        session_client.patch(
            url(workspace, project, f"items/{item['id']}/"),
            {"installation_status": "In Progress", "remarks": "Night shift"},
            format="json",
        )
        data = session_client.get(url(workspace, project, "activity/")).data
        assert data["total"] >= 2
        assert sum(day["count"] for day in data["days"]) == data["total"]
        assert all(len(day["date"]) == 10 for day in data["days"])
        assert data["from"] < data["to"]

    def test_records_who_changed_what(self, session_client, workspace, project, create_user):
        item = session_client.post(url(workspace, project, "items/"), {"scope": "wall_graphics"}, format="json").data[0]
        session_client.patch(
            url(workspace, project, f"items/{item['id']}/"),
            {"installation_status": "In Progress", "remarks": "Night shift"},
            format="json",
        )
        session_client.patch(
            url(workspace, project, f"items/{item['id']}/"), {"installation_status": "In Progress"}, format="json"
        )
        changes = session_client.get(url(workspace, project, f"history/?entity_id={item['id']}")).data
        install = [change for change in changes if change["field"] == "installation_status"]
        assert len(install) == 1  # saving the same value again is not a change
        assert install[0]["old_value"] == "Not Started" and install[0]["new_value"] == "In Progress"
        assert install[0]["entity_label"] == "W1"
        assert install[0]["actor"]["id"] == str(create_user.id)

        session_client.delete(url(workspace, project, f"items/{item['id']}/"))
        assert E9ChangeLog.objects.filter(project=project, action="deleted", entity_label="W1").exists()

        # project info changes are recorded too, and guests can read the history
        session_client.patch(url(workspace, project), {"client_name": "Example Co"}, format="json")
        session_client.patch(url(workspace, project), {"client_name": "Example Co Ltd"}, format="json")
        guest = guest_client(workspace, project)
        history = guest.get(url(workspace, project, "history/")).data
        assert any(change["field"] == "client_name" and change["new_value"] == "Example Co Ltd" for change in history)


def build_tracker_workbook():
    """A small workbook laid out like the E9 tracker template (made-up data)."""
    workbook = openpyxl.Workbook()
    info = workbook.active
    info.title = "Project Info"
    info["B4"], info["C4"] = "Project / Site Name", "Fictional Tower"
    info["B5"], info["C5"] = "Client (Company)", "Fictional Co"
    info["B7"], info["C7"] = "City", "Pune"
    info["B10"], info["C10"] = "E9 Project Owner / Coordinator", "A. Person"
    info["B14"], info["C14"] = "Final Handover Deadline", date(2026, 12, 20)
    info["B19"], info["C19"] = "1 · Site audit complete", date(2026, 11, 10)
    info["B27"], info["C27"] = "Visit (e.g. Visit 1 – 12 Nov)", "Site audit report PDF link (Drive / URL)"
    info["B28"], info["C28"], info["D28"] = "Visit 1", "audit-visit-1.pdf", "Final"

    headers = [
        "#",
        "Item Code",
        "BOQ Item No.",
        "Current Stage\n(auto)",
        "Floor / Area",
        "Floor Plan\n(link / ref)",
        "Description",
        "Site Audit\nStatus",
        "Height\n(in)",
        "Width\n(in)",
        "Qty\n(Nos.)",
        "Total Area\n(sq ft) (auto)",
        "Photo\n(paste image)",
        "Site Issue",
        "Issue\nResolved?",
        "Pre-Press",
        "JC No.",
        "Installation\nStatus",
    ]
    walls = workbook.create_sheet("Wall Graphics")
    for column, header in enumerate(headers, start=1):
        walls.cell(6, column, header)
    rows = [
        [
            1,
            None,
            "BO1",
            None,
            "4th Floor",
            None,
            "Wall 01",
            "Measured",
            114,
            116.5,
            1,
            None,
            None,
            "No issues",
            "N/A",
            "Not Started",
            None,
            "Not Started",
        ],
        [
            2,
            None,
            "BO1",
            None,
            "5th Floor",
            None,
            "Wall 02",
            "Measured",
            122,
            444,
            1,
            None,
            None,
            "Needs oil primer",
            None,
            "Sent for Production",
            7377,
            "Bogus status",
        ],
        [
            3,
            None,
            None,
            None,
            None,
            None,
            None,
            "Not Started",
            None,
            None,
            None,
            None,
            None,
            "No issues",
            "N/A",
            "Not Started",
            None,
            "Not Started",
        ],
    ]
    for row_index, row in enumerate(rows, start=7):
        for column, value in enumerate(row, start=1):
            walls.cell(row_index, column, value)
    frames = workbook.create_sheet("Frames")
    for column, header in enumerate(headers, start=1):
        frames.cell(6, column, header)
    frames.cell(7, 1, 1)
    frames.cell(7, 5, "Reception")
    frames.cell(7, 7, "A3 frames")
    frames.cell(7, 11, 6)
    workbook.create_sheet("Glass Film").cell(6, 2, "Item Code")
    buffer = io.BytesIO()
    boq = workbook.create_sheet("BOQ", 0)
    boq["A1"] = "BOQ"
    for column, header in enumerate(["#", "BOQ Item No.", "Scope", "Description", "Unit", "BOQ Qty", "Remarks"], 1):
        boq.cell(4, column, header)
    boq.append(["=ROW()-4", "BO1", "Wall Graphics", "Wall graphics", "Sq Ft", 1200, None])
    boq.append(["=ROW()-4", "BO2", "Frames", "A3 frames", "Nos", 10, "Black frame"])
    boq.append(["=ROW()-4", None, None, None, None, None, None])
    workbook.save(buffer)
    return buffer.getvalue()


@pytest.mark.contract
class TestExcelImport:
    @pytest.mark.django_db
    def test_imports_template_layout(self, session_client, workspace, project):
        upload = SimpleUploadedFile("Fictional_Tower.xlsx", build_tracker_workbook())
        response = session_client.post(url(workspace, project, "import/"), {"file": upload}, format="multipart")
        assert response.status_code == 201, response.data
        report = response.data
        assert report["items"] == {"Wall Graphics": 2, "Frames": 1}
        assert report["floors"] == ["4th Floor", "5th Floor", "Reception"]
        assert report["coordinator"] == "A. Person"
        assert report["site_visits"] == 1
        assert any("Bogus status" in warning for warning in report["warnings"])

        listing = session_client.get(url(workspace, project, "items/")).data["items"]
        codes = sorted(item["item_code"] for item in listing)
        assert codes == ["FR1", "W1", "W2"]
        w1 = next(item for item in listing if item["item_code"] == "W1")
        assert w1["area_sqft"] == "92.23" and w1["current_stage"] == "Measured"
        w2 = next(item for item in listing if item["item_code"] == "W2")
        assert w2["jc_no"] == "7377" and w2["issue_resolved"] == "No" and w2["current_stage"] == "Sent for Production"
        frame = next(item for item in listing if item["item_code"] == "FR1")
        assert frame["unit"] == "nos" and frame["qty"] == "6.00"

        profile = E9ProjectProfile.objects.get(project=project)
        assert profile.client_name == "Fictional Co" and profile.deadline == date(2026, 12, 20)
        assert profile.target_site_audit == date(2026, 11, 10)
        # only scopes with rows are switched on
        enabled = [
            row["label"] for row in session_client.get(url(workspace, project, "scopes/")).data if row["enabled"]
        ]
        assert enabled == ["Wall Graphics", "Frames"]
        assert E9ChangeLog.objects.filter(project=project, action="imported").exists()
        # the BOQ sheet lands on the original PO, and the tracker rows count against it
        assert report["boq_lines"] == 2
        boq = session_client.get(url(workspace, project, "boq/")).data
        assert [po["title"] for po in boq["pos"]] == ["Original BOQ / PO"]
        lines = {line["line_no"]: line for line in boq["lines"]}
        assert (
            lines["BO1"]["unit"] == "sqft"
            and lines["BO1"]["qty"] == "1200.00"
            and lines["BO1"]["scope"] == "wall_graphics"
        )
        assert lines["BO2"]["unit"] == "nos" and lines["BO2"]["remarks"] == "Black frame"

    @pytest.mark.django_db
    def test_importing_twice_does_not_clash_codes(self, session_client, workspace, project):
        for _ in range(2):
            upload = SimpleUploadedFile("t.xlsx", build_tracker_workbook())
            assert (
                session_client.post(
                    url(workspace, project, "import/"), {"file": upload}, format="multipart"
                ).status_code
                == 201
            )
        codes = sorted(item.item_number for item in E9ScopeItem.objects.filter(project=project, scope="wall_graphics"))
        assert codes == [1, 2, 3, 4]

    @pytest.mark.django_db
    @pytest.mark.django_db
    def _with_extra_sheets(self, *titles):
        workbook = openpyxl.load_workbook(io.BytesIO(build_tracker_workbook()))
        source = workbook["Wall Graphics"]
        for title in titles:
            sheet = workbook.create_sheet(title)
            for row in source.iter_rows(min_row=6, max_row=7):
                for cell in row:
                    sheet.cell(cell.row - 5, cell.column, cell.value)
        buffer = io.BytesIO()
        workbook.save(buffer)
        return buffer.getvalue()

    def test_extra_sheets_are_asked_about_before_anything_is_saved(self, session_client, workspace, project):
        data = self._with_extra_sheets("Writing Film", "Dinoc")
        upload = SimpleUploadedFile("extra.xlsx", data)
        response = session_client.post(url(workspace, project, "import/"), {"file": upload}, format="multipart")
        assert response.status_code == 409, response.data
        sheets = {row["sheet"]: row for row in response.data["extra_sheets"]}
        assert set(sheets) == {"Writing Film", "Dinoc"}  # Writing Film is no longer folded into Glass Film
        assert sheets["Dinoc"]["suggestion"] == {
            "action": "new",
            "label": "Dinoc",
            "unit_mode": "sqft",  # the sheet has sizes
            "from_company_list": False,
        }
        assert not E9ScopeItem.objects.filter(project=project).exists()  # nothing saved yet

        choices = {
            "Writing Film": {"action": "new", "label": "Writing Film", "unit_mode": "sqft"},
            "Dinoc": {"action": "scope", "key": "glass_film"},
        }
        upload = SimpleUploadedFile("extra.xlsx", data)
        response = session_client.post(
            url(workspace, project, "import/"), {"file": upload, "choices": json.dumps(choices)}, format="multipart"
        )
        assert response.status_code == 201, response.data
        assert response.data["items"]["Writing Film"] == 1
        assert response.data["items"]["Glass Film"] == 1  # Dinoc went where it was told
        film = next(
            row for row in session_client.get(url(workspace, project, "scopes/")).data if row["label"] == "Writing Film"
        )
        assert film["prefix"] == "WF" and film["enabled"] and not film["is_standard"]
        # and Writing Film is now on the company list for the next project
        listed = session_client.get(f"/api/workspaces/{workspace.slug}/e9/scope-templates/").data
        assert [row["label"] for row in listed] == ["Writing Film"]

    def test_an_extra_sheet_can_be_skipped(self, session_client, workspace, project):
        upload = SimpleUploadedFile("extra.xlsx", self._with_extra_sheets("Dinoc"))
        response = session_client.post(
            url(workspace, project, "import/"),
            {"file": upload, "choices": json.dumps({"Dinoc": {"action": "skip"}})},
            format="multipart",
        )
        assert response.status_code == 201, response.data
        assert "Dinoc" not in response.data["items"]
        assert any("Dinoc" in warning for warning in response.data["warnings"])

    def test_part_rows_come_in_as_parts_of_the_wall_above(self, session_client, workspace, project):
        workbook = openpyxl.load_workbook(io.BytesIO(build_tracker_workbook()))
        walls = workbook["Wall Graphics"]
        walls.cell(7, 2, "W1")
        walls.cell(8, 2, "W2")
        # a piece of W1, typed like the template: blank code, "part of" in Current Stage, a site size by mistake
        walls.insert_rows(8)
        for column, value in enumerate(
            [2, None, None, "\u21b3 part of W1", None, None, "Wall 01 - part 2", "Not Started", 99, 99, 1], start=1
        ):
            walls.cell(8, column, value)
        buffer = io.BytesIO()
        workbook.save(buffer)
        upload = SimpleUploadedFile("parts.xlsx", buffer.getvalue())
        response = session_client.post(url(workspace, project, "import/"), {"file": upload}, format="multipart")
        assert response.status_code == 201, response.data
        assert response.data["items"]["Wall Graphics"] == 2 and response.data["parts"] == 1
        listed = session_client.get(url(workspace, project, "items/")).data["items"]
        walls_listed = [row for row in listed if row["scope"] == "wall_graphics"]
        assert [(row["item_code"], row["is_part"], row["part_of"]) for row in walls_listed] == [
            ("W1", False, None),
            ("W1.1", True, "W1"),
            ("W2", False, None),
        ]
        part = walls_listed[1]
        assert part["height_in"] is None and part["area_sqft"] is None  # the site is measured on the main row only

    @pytest.mark.django_db
    def test_the_templates_own_report_sheets_are_not_imported_as_items(self, session_client, workspace, project):
        workbook = openpyxl.load_workbook(io.BytesIO(build_tracker_workbook()))
        source = workbook["Wall Graphics"]
        for title in ("Open Snags", "Held Items", "Cancelled Items", "Production Sent"):
            sheet = workbook.create_sheet(title)  # these repeat item codes but only report on them
            for row in source.iter_rows(min_row=6, max_row=7):
                for cell in row:
                    sheet.cell(cell.row - 5, cell.column, cell.value)
        buffer = io.BytesIO()
        workbook.save(buffer)
        upload = SimpleUploadedFile("reports.xlsx", buffer.getvalue())
        response = session_client.post(url(workspace, project, "import/"), {"file": upload}, format="multipart")
        assert response.status_code == 201, response.data
        assert "Others" not in response.data["items"]
        assert not any("not a known scope name" in warning for warning in response.data["warnings"])

    def test_rejects_non_excel(self, session_client, workspace, project):
        upload = SimpleUploadedFile("photo.xlsx", b"not a workbook")
        response = session_client.post(url(workspace, project, "import/"), {"file": upload}, format="multipart")
        assert response.status_code == 400


def build_full_workbook():
    """A workbook laid out like the template, with the extra columns and log sheets filled in."""
    workbook = openpyxl.load_workbook(io.BytesIO(build_tracker_workbook()))
    walls = workbook["Wall Graphics"]
    headers = [cell.value for cell in walls[6]]
    extra = [
        "Production\nHeight (in)",
        "Production\nWidth (in)",
        "DC No(s).\n(comma-separated)",
        "DC Qty\n(comma-separated)",
        "Certified\nHeight (in)",
        "Certified\nWidth (in)",
    ]
    start = len([h for h in headers if h]) + 1
    for offset, header in enumerate(extra):
        walls.cell(6, start + offset, header)
    for offset, value in enumerate([116, 118, "3500, 3501", "60, 32.23", 114, 116.5]):
        walls.cell(7, start + offset, value)

    reprints = workbook.create_sheet("Reprints & Extras")
    for column, header in enumerate(
        [
            "#",
            "Date",
            "Item Code",
            "Scope",
            "Item Code",
            "Item Description",
            "BOQ Item No.",
            "Type",
            "Caused by",
            "Reason",
            "Description",
            "Pieces",
            "Original Height (in)",
            "Original Width (in)",
            "Reprint Height (in)\n(tile)",
            "Reprint Width (in)\n(tile)",
        ],
        start=1,
    ):
        reprints.cell(4, column, header)
    reprints.append(
        [
            "=1",
            date(2026, 11, 20),
            "W1",
            None,
            None,
            None,
            None,
            "Reprint",
            "E9",
            "Print defect",
            "One tile",
            1,
            None,
            None,
            None,
            48,
        ]
    )
    reprints.append(["=2", None, "W99", None, None, None, None, "Reprint", "Client", "Design change"])

    snags = workbook.create_sheet("Snag List")
    for column, header in enumerate(
        [
            "#",
            "Date Raised",
            "Item Code",
            "Scope",
            "Item Description",
            "Floor / Area",
            "Snag Reason",
            "Snag Details",
            "Photo",
            "Priority",
            "Raised By",
            "Assigned To",
            "Target Date",
            "Status",
        ],
        start=1,
    ):
        snags.cell(4, column, header)
    snags.append(
        [
            "=1",
            date(2026, 11, 22),
            "W2",
            None,
            None,
            None,
            "Peeling / bubbles",
            "Corner lifting",
            None,
            "High",
            "Site team",
            "Team A",
            date(2026, 11, 25),
            "Open",
        ]
    )
    snags.append(["=2", None, None, None, None, None, None, None, None, "Medium", None, None, None, "Open"])

    dc_log = workbook.create_sheet("DC Log")
    for column, header in enumerate(
        [
            "#",
            "DC No.\n(auto)",
            "DC Date",
            "Items sent (auto)",
            "No. of\nLines",
            "Sq Ft\n(auto)",
            "Nos\n(auto)",
            "Dispatched From",
            "Sent By",
            "Vehicle / Transporter",
            "Invoice No.",
        ],
        start=1,
    ):
        dc_log.cell(4, column, header)
    # in a saved Excel / Google Sheets file the DC No. formula has its value; here it is typed
    dc_log.append([1, 3500, date(2026, 11, 18), None, None, None, None, "I Media", "Ravi", "KA-01-1234", "INV-9"])

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


@pytest.mark.contract
class TestFullTemplateImport:
    @pytest.mark.django_db
    def test_imports_new_columns_reprints_snags_and_dc_details(self, session_client, workspace, project):
        upload = SimpleUploadedFile("full.xlsx", build_full_workbook())
        response = session_client.post(url(workspace, project, "import/"), {"file": upload}, format="multipart")
        assert response.status_code == 201, response.data
        report = response.data
        assert report["reprints"] == 1 and report["snags"] == 1 and report["challans"] == 1
        assert any("W99" in warning for warning in report["warnings"])

        w1 = next(
            i for i in session_client.get(url(workspace, project, "items/")).data["items"] if i["item_code"] == "W1"
        )
        assert w1["production_measure"] == "95.06"  # 116 x 118 / 144
        assert w1["dc_list"] == [{"dc": "3500", "qty": "60.00"}, {"dc": "3501", "qty": "32.23"}]
        assert w1["certified_measure"] == "92.23" and w1["resent"] == "Reprint x1"

        reprint = session_client.get(url(workspace, project, "boq/")).data["reprints"][0]
        assert reprint["item_code"] == "W1" and reprint["qty"] == "38.00"  # 114 x 48 / 144
        snag = session_client.get(url(workspace, project, "snags/")).data["snags"][0]
        assert snag["item_code"] == "W2" and snag["priority"] == "High" and snag["assigned_to"] == "Team A"
        dc = next(
            d for d in session_client.get(url(workspace, project, "logs/")).data["challans"] if d["number"] == "3500"
        )
        assert dc["dispatched_from"] == "I Media" and dc["vehicle"] == "KA-01-1234" and dc["dc_date"] == "2026-11-18"


@pytest.mark.contract
class TestFirstOpenRace:
    @pytest.mark.django_db
    def test_two_requests_opening_a_new_project_at_once_both_work(self, project):
        """A request that looked for scopes/floors before the other one saved them must not crash."""
        from unittest.mock import patch

        from plane.e9 import services
        from plane.e9.models import E9ProjectScope

        services.ensure_scopes(project)  # the "winner" already saved the standard scopes
        real_filter = E9ProjectScope.objects.filter
        calls = {"n": 0}

        def stale_first_look(*args, **kwargs):
            calls["n"] += 1
            return [] if calls["n"] == 1 else real_filter(*args, **kwargs)

        with patch.object(E9ProjectScope.objects, "filter", side_effect=stale_first_look):
            scopes = services.ensure_scopes(project)  # the "loser" saw nothing and tries to insert again
        assert len(scopes) == len(services.tracker.SCOPES)
        assert E9ProjectScope.objects.filter(project=project).count() == len(services.tracker.SCOPES)

        services.ensure_floors(project, ["Ground Floor"])
        assert len(services.ensure_floors(project, ["Ground Floor", "1st Floor"])) == 1


@pytest.mark.contract
class TestInstalledPhotosAndHiddenColumns:
    @pytest.mark.django_db
    def test_installed_photos_are_kept_apart_from_site_photos(self, session_client, workspace, project):
        item = session_client.post(url(workspace, project, "items/"), {"scope": "wall_graphics"}, format="json").data[0]
        upload_url = url(workspace, project, "attachments/")
        for kind, name in (("photo", "site.png"), ("install_photo", "done.png")):
            sent = session_client.post(
                upload_url,
                {
                    "kind": kind,
                    "item": item["id"],
                    "files": [SimpleUploadedFile(name, tiny_png(), content_type="image/png")],
                },
                format="multipart",
            )
            assert sent.status_code == 201, sent.data
        site = session_client.get(f"{upload_url}?kind=photo").data
        installed = session_client.get(f"{upload_url}?kind=install_photo").data
        assert [row["name"] for row in site] == ["site.png"]
        assert [row["name"] for row in installed] == ["done.png"]

    @pytest.mark.django_db
    def test_new_projects_start_with_the_unused_columns_hidden_and_they_can_be_shown(
        self, session_client, workspace, project
    ):
        profile_url = url(workspace, project)
        assert session_client.get(profile_url).data["e9"]["hidden_columns"] == [
            "current_stage",
            "qc_done_by",
            "installed_by",
        ]
        shown = session_client.patch(profile_url, {"hidden_columns": ["installed_photo"]}, format="json")
        assert shown.status_code == 200
        assert session_client.get(profile_url).data["e9"]["hidden_columns"] == ["installed_photo"]
        assert session_client.patch(profile_url, {"hidden_columns": ["nope"]}, format="json").status_code == 400

    @pytest.mark.django_db
    def test_migration_hides_the_columns_once_and_keeps_existing_choices(self, project):
        import importlib

        migration = importlib.import_module("plane.e9.migrations.0007_hide_unused_columns_installed_photo")
        from django.apps import apps

        E9ProjectProfile.objects.create(project=project, workspace_id=project.workspace_id, hidden_columns=["remarks"])
        migration.hide_unused_columns(apps, None)
        migration.hide_unused_columns(apps, None)  # running twice changes nothing more
        hidden = E9ProjectProfile.objects.get(project=project).hidden_columns
        assert hidden == ["remarks", "current_stage", "qc_done_by", "installed_by"]


@pytest.mark.contract
class TestAttachFilesCommand:
    @pytest.mark.django_db
    def test_attaches_a_pdf_and_refuses_other_files(self, workspace, project, tmp_path, settings):
        from django.core.management import call_command
        from django.core.management.base import CommandError

        from plane.e9.models import E9Attachment

        settings.E9_UPLOAD_ROOT = str(tmp_path / "uploads")
        pdf = tmp_path / "audit.pdf"
        pdf.write_bytes(b"%PDF-1.4\n%made-up\n")
        sheet = tmp_path / "numbers.xlsx"
        sheet.write_bytes(b"PK\x03\x04")
        call_command(
            "e9_attach_files",
            str(pdf),
            project=project.name,
            workspace=workspace.slug,
            kind="site_audit",
            draft="Final",
        )
        saved = E9Attachment.objects.get(project=project)
        assert saved.kind == "site_audit" and saved.version == "Final" and saved.content_type == "application/pdf"
        with pytest.raises(CommandError):
            call_command("e9_attach_files", str(sheet), project=project.name, workspace=workspace.slug)
