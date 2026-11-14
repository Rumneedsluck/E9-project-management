# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Sub-parts of a wall, wastage, inserting / moving rows, and renumbering (made-up data only)."""

from decimal import Decimal
from types import SimpleNamespace

import pytest

from plane.db.models import Project, ProjectMember
from plane.e9 import tracker
from plane.e9.models import E9Reprint, E9ScopeItem, E9Snag


def base(**values):
    row = dict(
        scope="wall_graphics",
        sort_order=1000,
        item_number=1,
        is_part=False,
        height_in=None,
        width_in=None,
        qty=None,
        production_height_in=None,
        production_width_in=None,
        production_qty=None,
    )
    row.update(values)
    return SimpleNamespace(**row)


@pytest.mark.unit
class TestPartsMaths:
    def test_a_wall_counts_once_and_adds_its_parts(self):
        wall = base(item_number=1, sort_order=1000, height_in=Decimal(144), width_in=Decimal(144), qty=Decimal(1))
        part = base(item_number=2, sort_order=2000, is_part=True, height_in=Decimal(72), width_in=Decimal(144))
        other = base(item_number=3, sort_order=3000, height_in=Decimal(144), width_in=Decimal(144))
        real = tracker.fold_parts([other, part, wall])  # any order in, sheet order out
        assert real == [wall, other]
        assert tracker.parts_of(wall) == [part] and part._parent is wall
        # the site is measured once, on the main row: a part's site size never counts
        assert tracker.measured(wall, "sqft") == Decimal("144.00")

    def test_a_wall_made_of_pieces_like_the_excel(self):
        """Wall 05 = one site measurement, produced as 4 pieces of 37in plus 1 piece of 34in (all 91in high)."""
        wall = base(
            height_in=Decimal(91),
            width_in=Decimal(180),
            qty=Decimal(1),
            production_height_in=Decimal(91),
            production_width_in=Decimal(37),
            production_qty=Decimal(4),
        )
        piece = base(
            sort_order=2000,
            item_number=2,
            is_part=True,
            production_height_in=Decimal(91),
            production_width_in=Decimal(34),
        )
        tracker.fold_parts([wall, piece])
        site = tracker.measured(wall, "sqft")
        made = tracker.production_measure(wall, "sqft")
        assert site == Decimal("113.75")  # 91 x 180 / 144, measured once
        assert made == Decimal("93.53") + Decimal("21.49")  # 4 x 91x37/144 + 1 x 91x34/144
        assert tracker.wastage(wall, "sqft") == made - site

    def test_a_part_without_a_production_size_sends_nothing(self):
        wall = base(height_in=Decimal(120), width_in=Decimal(120), qty=Decimal(1))
        piece = base(sort_order=2000, item_number=2, is_part=True)
        tracker.fold_parts([wall, piece])
        assert tracker.production_measure(wall, "sqft") == Decimal("100.00")
        nos_wall = base(scope="frames", qty=Decimal(3))
        nos_piece = base(scope="frames", sort_order=2000, item_number=2, is_part=True)
        tracker.fold_parts([nos_wall, nos_piece])
        assert tracker.production_measure(nos_wall, "nos") == Decimal(3)

    def test_a_part_at_the_top_of_a_sheet_is_just_an_item(self):
        first = base(item_number=1, sort_order=1000, is_part=True, height_in=Decimal(12), width_in=Decimal(12))
        assert tracker.fold_parts([first]) == [first]

    def test_parts_do_not_cross_into_another_scope(self):
        wall = base(scope="wall_graphics", sort_order=1000)
        film_part = base(scope="glass_film", sort_order=2000, is_part=True)
        real = tracker.fold_parts([wall, film_part])
        assert film_part in real  # nothing above it in ITS scope, so it is an ordinary item

    def test_production_adds_each_parts_own_production_size(self):
        wall = base(
            height_in=Decimal(120),
            width_in=Decimal(120),
            production_height_in=Decimal(122),
            production_width_in=Decimal(122),
        )
        part = base(
            sort_order=2000,
            item_number=2,
            is_part=True,
            height_in=Decimal(60),
            width_in=Decimal(120),
            production_height_in=Decimal(64),
            production_width_in=Decimal(124),
        )
        tracker.fold_parts([wall, part])
        sent = tracker.production_measure(wall, "sqft")
        assert sent == Decimal("103.36") + Decimal("55.11")  # 122x122/144 + 64x124/144

    def test_wastage_is_production_minus_site_and_a_percent_of_site(self):
        wall = base(
            height_in=Decimal(120),
            width_in=Decimal(120),
            production_height_in=Decimal(132),
            production_width_in=Decimal(120),
        )
        tracker.fold_parts([wall])
        assert tracker.wastage(wall, "sqft") == Decimal("10.00")  # 110 sq ft made, 100 measured
        assert tracker.wastage_percent(wall, "sqft") == Decimal("10.0")

    def test_wastage_in_nos_is_extra_pieces(self):
        frame = base(scope="frames", qty=Decimal(10), production_qty=Decimal(12))
        tracker.fold_parts([frame])
        assert tracker.wastage(frame, "nos") == Decimal("2.00")
        assert tracker.wastage_percent(frame, "nos") == Decimal("20.0")

    def test_wastage_shows_nothing_for_blanks_and_never_divides_by_zero(self):
        blank = base(qty=Decimal(3))
        tracker.fold_parts([blank])
        assert tracker.wastage(blank, "nos") is None and tracker.wastage_percent(blank, "nos") is None
        assert tracker.wastage(blank, "sqft") is None
        zero_site = base(
            height_in=Decimal(0), width_in=Decimal(0), production_height_in=Decimal(5), production_width_in=Decimal(5)
        )
        tracker.fold_parts([zero_site])
        assert tracker.wastage_percent(zero_site, "sqft") is None  # nothing measured: no percent, no error

    def test_wastage_ignores_the_boq_quantity(self):
        wall = base(
            height_in=Decimal(120),
            width_in=Decimal(120),
            production_height_in=Decimal(132),
            production_width_in=Decimal(120),
        )
        tracker.fold_parts([wall])
        before = tracker.wastage(wall, "sqft")
        wall.boq_qty = Decimal(9999)  # a BOQ edit must not move wastage
        assert tracker.wastage(wall, "sqft") == before


def items_url(slug, project_id):
    return f"/api/workspaces/{slug}/e9/projects/{project_id}/items/"


def item_url(slug, project_id, item_id):
    return f"/api/workspaces/{slug}/e9/projects/{project_id}/items/{item_id}/"


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(name="Fictional Site", identifier="FP", workspace=workspace)
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return project


def make_rows(session_client, workspace, project, count, scope="wall_graphics"):
    return session_client.post(
        items_url(workspace.slug, project.id), {"scope": scope, "count": count}, format="json"
    ).data


def sheet(session_client, workspace, project, scope="wall_graphics"):
    data = session_client.get(items_url(workspace.slug, project.id)).data["items"]
    return sorted((row for row in data if row["scope"] == scope), key=lambda row: row["sort_order"])


@pytest.mark.unit
class TestDispatchedRule:
    def _item(self, **values):
        item = base(
            **{
                "height_in": Decimal(120),
                "width_in": Decimal(120),
                "qty": Decimal(1),
                "dc_nos": "",
                "dc_qty": "",
                **values,
            }
        )
        tracker.fold_parts([item])
        return item

    def test_marked_dispatched_with_no_dc_counts_as_fully_sent(self):
        for status in ("Dispatched", "Delivered at Site"):
            item = self._item(dispatch_status=status)
            assert tracker.dispatched(item, "sqft") == Decimal("100.00")
            assert tracker.balance_to_send(item, "sqft") == Decimal(0)

    def test_with_dcs_typed_their_quantities_are_used_so_a_short_delivery_shows(self):
        item = self._item(dispatch_status="Delivered at Site", dc_nos="DC1, DC2", dc_qty="60, 30")
        assert tracker.dispatched(item, "sqft") == Decimal(90)
        assert tracker.balance_to_send(item, "sqft") == Decimal(10)

    def test_a_dc_quantity_counts_only_against_a_dc_number(self):
        item = self._item(dispatch_status="Partially Dispatched", dc_nos="", dc_qty="40")
        assert tracker.dispatched(item, "sqft") == Decimal(0)

    def test_not_dispatched_and_no_dc_is_nothing_sent(self):
        assert tracker.dispatched(self._item(dispatch_status="Not Dispatched"), "sqft") == Decimal(0)


@pytest.mark.django_db
class TestPartsOnTheSheet:
    def test_a_part_takes_no_w_number_and_shows_what_it_belongs_to(self, session_client, workspace, project):
        rows = make_rows(session_client, workspace, project, 3)
        for row, text in zip(rows, ["wall", "gap", "next"]):
            session_client.patch(item_url(workspace.slug, project.id, row["id"]), {"description": text}, format="json")
        response = session_client.patch(
            item_url(workspace.slug, project.id, rows[1]["id"]), {"is_part": True}, format="json"
        )
        assert response.status_code == 200, response.data
        listed = sheet(session_client, workspace, project)
        assert [row["item_code"] for row in listed] == ["W1", "W1.1", "W2"]  # the third row moved up to W2
        assert [row["part_of"] for row in listed] == [None, "W1", None]
        assert listed[0]["parts_count"] == 1 and listed[1]["is_part"] is True
        assert listed[2]["description"] == "next"  # same row, same data, new number

    def test_a_part_has_no_site_area_and_the_dashboard_counts_the_wall_once(self, session_client, workspace, project):
        rows = make_rows(session_client, workspace, project, 2)
        wall, part = rows
        for row, (height, width) in ((wall, (144, 144)), (part, (72, 144))):
            session_client.patch(
                item_url(workspace.slug, project.id, row["id"]),
                {"description": "x", "height_in": str(height), "width_in": str(width), "qty": "1"},
                format="json",
            )
        session_client.patch(item_url(workspace.slug, project.id, part["id"]), {"is_part": True}, format="json")
        listed = sheet(session_client, workspace, project)
        assert Decimal(listed[0]["area_sqft"]) == Decimal("144.00")  # the wall's own site area; parts have none
        assert listed[1]["area_sqft"] is None
        projects = session_client.get(f"/api/workspaces/{workspace.slug}/e9/projects/").data
        summary = next(entry for entry in projects if entry["id"] == str(project.id))["tracker"]
        assert summary["rows"] == 1  # one wall, not two rows
        assert Decimal(summary["sqft_total"]) == Decimal("144.00")

    def test_deleting_a_wall_takes_its_parts_and_undo_brings_them_all_back(self, session_client, workspace, project):
        rows = make_rows(session_client, workspace, project, 3)
        session_client.patch(item_url(workspace.slug, project.id, rows[1]["id"]), {"is_part": True}, format="json")
        deleted = session_client.delete(item_url(workspace.slug, project.id, rows[0]["id"]))
        assert deleted.status_code == 200
        assert deleted.data["deleted"] == [rows[0]["id"], rows[1]["id"]]
        left = sheet(session_client, workspace, project)
        assert [row["id"] for row in left] == [rows[2]["id"]] and left[0]["item_code"] == "W1"  # the gap closed
        for row_id in deleted.data["deleted"]:
            restored = session_client.post(item_url(workspace.slug, project.id, row_id) + "restore/")
            assert restored.status_code == 200
        back = sheet(session_client, workspace, project)
        assert [row["item_code"] for row in back] == ["W1", "W1.1", "W2"]
        assert [row["id"] for row in back] == [rows[0]["id"], rows[1]["id"], rows[2]["id"]]


@pytest.mark.django_db
class TestInsertAndMove:
    def test_inserting_above_w3_makes_the_new_row_w3_and_pushes_the_old_one_to_w4(
        self, session_client, workspace, project
    ):
        rows = make_rows(session_client, workspace, project, 4)
        for index, row in enumerate(rows, start=1):
            session_client.patch(
                item_url(workspace.slug, project.id, row["id"]),
                {"description": f"original {index}", "height_in": str(10 * index)},
                format="json",
            )
        old_w3 = rows[2]
        response = session_client.post(
            items_url(workspace.slug, project.id) + "insert/", {"before": old_w3["id"]}, format="json"
        )
        assert response.status_code == 201, response.data
        listed = sheet(session_client, workspace, project)
        assert [row["item_code"] for row in listed] == ["W1", "W2", "W3", "W4", "W5"]
        assert listed[2]["id"] == response.data["created"][0]["id"] and listed[2]["description"] == ""
        moved = next(row for row in listed if row["id"] == old_w3["id"])
        assert moved["item_code"] == "W4" and moved["description"] == "original 3" and moved["height_in"] == "30.00"

    def test_a_row_inserted_below_goes_after_the_wall_and_its_parts(self, session_client, workspace, project):
        rows = make_rows(session_client, workspace, project, 2)
        session_client.patch(item_url(workspace.slug, project.id, rows[1]["id"]), {"is_part": True}, format="json")
        response = session_client.post(
            items_url(workspace.slug, project.id) + "insert/", {"after": rows[0]["id"]}, format="json"
        )
        assert response.status_code == 201
        listed = sheet(session_client, workspace, project)
        assert [row["item_code"] for row in listed] == ["W1", "W1.1", "W2"]
        assert listed[2]["id"] == response.data["created"][0]["id"]

    def test_add_part_below_a_wall(self, session_client, workspace, project):
        rows = make_rows(session_client, workspace, project, 2)
        response = session_client.post(
            items_url(workspace.slug, project.id) + "insert/",
            {"after": rows[0]["id"], "is_part": True},
            format="json",
        )
        assert response.status_code == 201
        assert [row["item_code"] for row in sheet(session_client, workspace, project)] == ["W1", "W1.1", "W2"]

    def test_moving_a_row_keeps_its_data_photos_snags_and_reprints_and_renumbers(
        self, session_client, workspace, project
    ):
        rows = make_rows(session_client, workspace, project, 3)
        for index, row in enumerate(rows, start=1):
            session_client.patch(
                item_url(workspace.slug, project.id, row["id"]),
                {"description": f"original {index}", "dc_nos": f"DC{index}"},
                format="json",
            )
        third = E9ScopeItem.objects.get(pk=rows[2]["id"])
        snag = E9Snag.objects.create(project=project, workspace_id=project.workspace_id, item=third, reason="scratch")
        reprint = E9Reprint.objects.create(
            project=project, workspace_id=project.workspace_id, item=third, qty=Decimal(5)
        )
        response = session_client.post(
            items_url(workspace.slug, project.id) + "move/",
            {"ids": [rows[2]["id"]], "before": rows[0]["id"]},
            format="json",
        )
        assert response.status_code == 200, response.data
        listed = sheet(session_client, workspace, project)
        assert [row["id"] for row in listed] == [rows[2]["id"], rows[0]["id"], rows[1]["id"]]
        assert [row["item_code"] for row in listed] == ["W1", "W2", "W3"]
        assert listed[0]["description"] == "original 3" and listed[0]["dc_nos"] == "DC3"
        snag.refresh_from_db()
        reprint.refresh_from_db()
        assert snag.item_id == third.id and reprint.item_id == third.id  # linked by the row, not by its number

    def test_a_wall_moves_with_its_parts(self, session_client, workspace, project):
        rows = make_rows(session_client, workspace, project, 4)
        session_client.patch(item_url(workspace.slug, project.id, rows[1]["id"]), {"is_part": True}, format="json")
        response = session_client.post(
            items_url(workspace.slug, project.id) + "move/", {"ids": [rows[0]["id"]], "before": None}, format="json"
        )
        assert response.status_code == 200 and response.data["moved"] == 2
        listed = sheet(session_client, workspace, project)
        assert [row["id"] for row in listed] == [rows[2]["id"], rows[3]["id"], rows[0]["id"], rows[1]["id"]]
        assert [row["item_code"] for row in listed] == ["W1", "W2", "W3", "W3.1"]

    def test_rows_cannot_be_moved_to_another_sheet(self, session_client, workspace, project):
        walls = make_rows(session_client, workspace, project, 1)
        glass = make_rows(session_client, workspace, project, 1, scope="glass_film")
        response = session_client.post(
            items_url(workspace.slug, project.id) + "move/",
            {"ids": [walls[0]["id"], glass[0]["id"]], "before": None},
            format="json",
        )
        assert response.status_code == 400

    def test_a_typed_replaced_by_code_follows_the_row_it_names(self, session_client, workspace, project):
        rows = make_rows(session_client, workspace, project, 3)
        session_client.patch(item_url(workspace.slug, project.id, rows[0]["id"]), {"replaced_by": "W3"}, format="json")
        session_client.post(items_url(workspace.slug, project.id) + "insert/", {"before": rows[2]["id"]}, format="json")
        first = next(row for row in sheet(session_client, workspace, project) if row["id"] == rows[0]["id"])
        assert first["replaced_by"] == "W4"  # the old W3 is W4 now


@pytest.mark.django_db
class TestBigSheets:
    def test_a_sheet_of_600_rows_works_and_renumbers_in_one_go(self, session_client, workspace, project):
        response = session_client.post(
            items_url(workspace.slug, project.id) + "bulk/",
            {"scope": "wall_graphics", "add": 600, "changes": []},
            format="json",
        )
        assert response.status_code == 201 and len(response.data["created"]) == 600
        middle = response.data["created"][300]["id"]
        inserted = session_client.post(
            items_url(workspace.slug, project.id) + "insert/", {"before": middle}, format="json"
        )
        assert inserted.status_code == 201
        listed = sheet(session_client, workspace, project)
        assert len(listed) == 601 and listed[-1]["item_code"] == "W601"
        assert [row["item_number"] for row in listed] == list(range(1, 602))


def boq_url(workspace, project, path=""):
    return f"/api/workspaces/{workspace.slug}/e9/projects/{project.id}/boq/{path}"


@pytest.mark.django_db
class TestPartsAndWastageInTheBoq:
    def _wall_with_a_part(self, session_client, workspace, project):
        po = session_client.post(
            boq_url(workspace, project, "pos/"), {"kind": "original", "number": "PO-1"}, format="json"
        )
        po_id = po.data["pos"][0]["id"]
        session_client.post(
            boq_url(workspace, project, "lines/"),
            {
                "po": po_id,
                "line_no": "BO1",
                "scope": "wall_graphics",
                "description": "Walls",
                "unit": "sqft",
                "qty": "1000",
                "rate": "10",
            },
            format="json",
        )
        wall, part = make_rows(session_client, workspace, project, 2)
        common = {"description": "wall", "boq_item_no": "BO1", "qty": "1"}
        session_client.patch(
            item_url(workspace.slug, project.id, wall["id"]),
            {
                **common,
                "height_in": "120",
                "width_in": "120",
                "production_height_in": "132",
                "production_width_in": "120",
            },
            format="json",
        )
        session_client.patch(
            item_url(workspace.slug, project.id, part["id"]),
            {**common, "height_in": "60", "width_in": "120", "is_part": True},
            format="json",
        )
        return wall, part

    def test_the_boq_counts_a_wall_once_and_adds_its_parts_production(self, session_client, workspace, project):
        self._wall_with_a_part(session_client, workspace, project)
        data = session_client.get(boq_url(workspace, project)).data
        line = next(row for row in data["lines"] if row["line_no"] == "BO1")
        assert Decimal(line["on_tracker"]) == Decimal("110.00")  # wall production; the part has no production size yet
        assert len(line["item_ids"]) == 1  # one item, not two

    def test_wastage_per_line_is_production_minus_site_and_ignores_boq_edits(self, session_client, workspace, project):
        self._wall_with_a_part(session_client, workspace, project)
        line = next(
            row for row in session_client.get(boq_url(workspace, project)).data["lines"] if row["line_no"] == "BO1"
        )
        assert Decimal(line["wastage"]) == Decimal("10.00")  # wall made 110 vs 100 measured on site
        assert line["wastage_pct"] == "10.0"  # 10 of the 100 sq ft measured on the main row
        session_client.patch(boq_url(workspace, project, f"lines/{line['id']}/"), {"qty": "5000"}, format="json")
        again = next(
            row for row in session_client.get(boq_url(workspace, project)).data["lines"] if row["line_no"] == "BO1"
        )
        assert again["wastage"] == line["wastage"] and again["wastage_pct"] == line["wastage_pct"]

    def test_production_sent_view_shows_wastage_for_the_wall(self, session_client, workspace, project):
        wall, _ = self._wall_with_a_part(session_client, workspace, project)
        session_client.patch(item_url(workspace.slug, project.id, wall["id"]), {"jc_no": "JC-9"}, format="json")
        logs = session_client.get(f"/api/workspaces/{workspace.slug}/e9/projects/{project.id}/logs/").data
        rows = [row for card in logs["job_cards"] for row in card["items"]]
        assert rows, logs["job_cards"]
        assert rows[0]["wastage"] == "10.00" and rows[0]["part_count"] == 1
