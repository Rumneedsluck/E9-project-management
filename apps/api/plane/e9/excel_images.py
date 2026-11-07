# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pictures pasted into an Excel tracker, found by sheet and row (standard library only).

Two ways Excel stores them:
  * floating pictures ("Insert > Picture" / paste): xl/drawings/drawingN.xml anchors -> xl/media/…
  * pictures placed in a cell (Excel 365 "Place in cell" / =IMAGE): cell attribute vm="n" ->
    xl/richData/rdrichvalue.xml -> richValueRel.xml -> xl/media/…
Result: {sheet title: [(row number starting at 1, file name, bytes, content type), …]}
"""

import mimetypes
import posixpath
import re
import zipfile
from xml.etree import ElementTree

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "rv": "http://schemas.microsoft.com/office/spreadsheetml/2017/richdata",
    "rvrel": "http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel",
}
R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
R_EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
MAX_BYTES = 15 * 1024 * 1024


def _rels(archive, path):
    """{relationship id: absolute target path} for the part at `path`."""
    folder, name = posixpath.split(path)
    rels_path = posixpath.join(folder, "_rels", f"{name}.rels")
    if rels_path not in archive.namelist():
        return {}
    root = ElementTree.fromstring(archive.read(rels_path))
    result = {}
    for rel in root.findall("rel:Relationship", NS):
        target = rel.get("Target", "")
        full = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(folder, target))
        result[rel.get("Id")] = full
    return result


def _picture(archive, path):
    if path not in archive.namelist():
        return None
    data = archive.read(path)
    if not data or len(data) > MAX_BYTES:
        return None
    name = posixpath.basename(path)
    return name, data, mimetypes.guess_type(name)[0] or "image/png"


def _sheet_paths(archive):
    """{sheet title: worksheet part path}"""
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    rels = _rels(archive, "xl/workbook.xml")
    result = {}
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        target = rels.get(sheet.get(R_ID))
        if target:
            result[sheet.get("name")] = target
    return result


def _rich_value_pictures(archive):
    """[picture or None] indexed by the cell's vm number - 1 (Excel 'place in cell' pictures)."""
    names = archive.namelist()
    if "xl/richData/rdrichvalue.xml" not in names or "xl/richData/richValueRel.xml" not in names:
        return []
    rel_targets = _rels(archive, "xl/richData/richValueRel.xml")
    rel_root = ElementTree.fromstring(archive.read("xl/richData/richValueRel.xml"))
    rel_list = [rel.get(R_ID) for rel in rel_root]
    values = ElementTree.fromstring(archive.read("xl/richData/rdrichvalue.xml"))
    pictures = []
    for value in values.findall("rv:rv", NS):
        first = value.find("rv:v", NS)
        picture = None
        try:
            index = int(first.text) if first is not None else -1
        except (TypeError, ValueError):
            index = -1
        if 0 <= index < len(rel_list):
            target = rel_targets.get(rel_list[index])
            picture = _picture(archive, target) if target else None
        pictures.append(picture)
    return pictures


def sheet_images(upload):
    """Find every picture in the workbook and the row it sits on."""
    try:
        upload.seek(0)
        archive = zipfile.ZipFile(upload)
    except (zipfile.BadZipFile, OSError, AttributeError):
        return {}
    found = {}
    with archive:
        try:
            sheets = _sheet_paths(archive)
        except (KeyError, ElementTree.ParseError):
            return {}
        in_cell = _rich_value_pictures(archive)
        for title, sheet_path in sheets.items():
            items = []
            sheet_rels = _rels(archive, sheet_path)
            # 1. floating pictures on the sheet's drawing
            try:
                sheet_xml = archive.read(sheet_path)
            except KeyError:
                continue
            root = ElementTree.fromstring(sheet_xml)
            for drawing in root.findall("main:drawing", NS):
                drawing_path = sheet_rels.get(drawing.get(R_ID))
                if not drawing_path or drawing_path not in archive.namelist():
                    continue
                drawing_rels = _rels(archive, drawing_path)
                drawing_root = ElementTree.fromstring(archive.read(drawing_path))
                for anchor in list(drawing_root):
                    row = anchor.find("xdr:from/xdr:row", NS)
                    blip = anchor.find(".//a:blip", NS)
                    if row is None or blip is None:
                        continue
                    target = drawing_rels.get(blip.get(R_EMBED))
                    picture = _picture(archive, target) if target else None
                    if picture:
                        items.append((int(row.text) + 1, *picture))
            # 2. pictures placed in a cell (vm="n" on the <c> element)
            if in_cell:
                for cell in root.iter(f"{{{NS['main']}}}c"):
                    vm = cell.get("vm")
                    ref = cell.get("r", "")
                    match = re.match(r"[A-Z]+(\d+)$", ref)
                    if not vm or not match:
                        continue
                    index = int(vm) - 1
                    if 0 <= index < len(in_cell) and in_cell[index]:
                        items.append((int(match.group(1)), *in_cell[index]))
            if items:
                found[title] = items
    return found
