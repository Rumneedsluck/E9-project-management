# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Small safety rules shared by the E9 endpoints.

* Links people type (PO document, mail, JMC, photo) may only be web / mail addresses:
  a "javascript:" link stored in the app would run code when a colleague clicks it.
* Uploads are checked by their real type, never by what the browser says: an SVG or HTML file
  served from the app's own address could run scripts, so only plain photos and PDFs go in.
"""

from urllib.parse import urlparse

LINK_SCHEMES = ("http", "https", "mailto")

# extension -> the one content type we store and serve for it
SAFE_UPLOADS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".pdf": "application/pdf",
}

# the first bytes of each kind of file ("magic numbers")
_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "image/webp": (b"RIFF",),
    "image/bmp": (b"BM",),
    "image/tiff": (b"II*\x00", b"MM\x00*"),
    "application/pdf": (b"%PDF-",),
}


def clean_link(value):
    """'' for no link; the trimmed link for http(s)/mailto; None when it is anything else."""
    text = str(value or "").strip()
    if not text:
        return ""
    # people often paste a bare address like drive.google.com/...: that is a web link
    if "://" not in text and not text.lower().startswith(("mailto:", "javascript:", "data:", "vbscript:")):
        text = "https://" + text
    parsed = urlparse(text)
    if parsed.scheme.lower() not in LINK_SCHEMES:
        return None
    if parsed.scheme.lower() in ("http", "https") and not parsed.netloc:
        return None
    return text


def upload_type(name, head):
    """The safe content type for an upload, or None. `head` = the first bytes of the file."""
    extension = ("." + name.rsplit(".", 1)[-1].lower()) if "." in (name or "") else ""
    content_type = SAFE_UPLOADS.get(extension)
    if content_type is None:
        return None
    signatures = _SIGNATURES.get(content_type)
    if signatures and not head.startswith(signatures):
        # HEIC/HEIF have their own container; everything else must match its signature
        return None
    if content_type == "image/webp" and head[8:12] != b"WEBP":
        return None
    return content_type


def uuid_or_none(value):
    """A UUID from whatever was sent, or None (so a bad id means 'not found', not a server error)."""
    import uuid

    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None
