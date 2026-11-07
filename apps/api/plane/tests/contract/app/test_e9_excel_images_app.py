# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import io
import zipfile

import pytest

from plane.e9.excel_images import sheet_images

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"


def rels(*entries):
    body = "".join(f'<Relationship Id="{rid}" Type="x" Target="{target}"/>' for rid, target in entries)
    return f'<Relationships xmlns="{PKG}">{body}</Relationships>'


def build_workbook():
    """Sheet 'Wall Graphics': a floating picture on row 7 and a 'place in cell' picture in M8."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            f'<workbook xmlns="{MAIN}" xmlns:r="{R}"><sheets>'
            f'<sheet name="Wall Graphics" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr("xl/_rels/workbook.xml.rels", rels(("rId1", "worksheets/sheet1.xml")))
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            f'<worksheet xmlns="{MAIN}" xmlns:r="{R}"><sheetData>'
            f'<row r="8"><c r="M8" vm="1"/></row></sheetData><drawing r:id="rId1"/></worksheet>',
        )
        archive.writestr("xl/worksheets/_rels/sheet1.xml.rels", rels(("rId1", "../drawings/drawing1.xml")))
        archive.writestr(
            "xl/drawings/drawing1.xml",
            '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
            f'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="{R}">'
            "<xdr:oneCellAnchor><xdr:from><xdr:col>12</xdr:col><xdr:row>6</xdr:row></xdr:from>"
            '<xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></xdr:oneCellAnchor></xdr:wsDr>',
        )
        archive.writestr("xl/drawings/_rels/drawing1.xml.rels", rels(("rId1", "../media/image1.png")))
        archive.writestr("xl/media/image1.png", PNG)
        archive.writestr("xl/media/image2.jpeg", PNG)
        archive.writestr(
            "xl/richData/rdrichvalue.xml",
            '<rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata">'
            '<rv s="0"><v>0</v><v>5</v></rv></rvData>',
        )
        archive.writestr(
            "xl/richData/richValueRel.xml",
            '<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" '
            f'xmlns:r="{R}"><rel r:id="rId1"/></richValueRels>',
        )
        archive.writestr("xl/richData/_rels/richValueRel.xml.rels", rels(("rId1", "../media/image2.jpeg")))
    buffer.seek(0)
    return buffer


@pytest.mark.unit
def test_finds_floating_and_in_cell_pictures_by_row():
    found = sheet_images(build_workbook())
    rows = sorted((row, name, content_type) for row, name, _data, content_type in found["Wall Graphics"])
    assert rows == [(7, "image1.png", "image/png"), (8, "image2.jpeg", "image/jpeg")]


@pytest.mark.unit
def test_not_an_excel_file_gives_nothing():
    assert sheet_images(io.BytesIO(b"hello")) == {}
