# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Safety rules around uploads and the demo command."""

import io
import zipfile
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from plane.e9 import tracker
from plane.e9.safety import check_workbook_archive, upload_type


def _zip(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    buffer.seek(0)
    return buffer


@pytest.mark.unit
class TestWorkbookArchiveGuard:
    def test_normal_workbook_passes_and_is_rewound(self):
        upload = _zip({"xl/workbook.xml": "<workbook/>"})
        assert check_workbook_archive(upload) is True
        assert upload.tell() == 0

    def test_xml_entities_are_refused(self):
        bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>'
        assert check_workbook_archive(_zip({"xl/workbook.xml": bomb})) is False

    def test_not_a_zip_is_refused(self):
        assert check_workbook_archive(io.BytesIO(b"not a zip")) is False


@pytest.mark.unit
class TestHeicSignature:
    def test_real_heic_header_is_accepted(self):
        assert upload_type("a.heic", b"\x00\x00\x00\x18ftypheic") == "image/heic"

    def test_fake_heic_is_refused(self):
        assert upload_type("a.heic", b"<html>nope</html>") is None


@pytest.mark.unit
class TestProductionSizeWithoutQty:
    def test_uses_measured_pieces_when_production_qty_is_blank(self):
        item = SimpleNamespace(
            height_in=Decimal("24"),
            width_in=Decimal("36"),
            qty=5,
            production_height_in=Decimal("24"),
            production_width_in=Decimal("36"),
            production_qty=None,
        )
        assert tracker.production_measure(item, "sqft") == Decimal("30.00")


@pytest.mark.unit
class TestDemoCommandGuard:
    def test_refuses_outside_developer_mode(self, settings):
        settings.DEBUG = False
        with pytest.raises(CommandError):
            call_command("e9_demo_setup")
