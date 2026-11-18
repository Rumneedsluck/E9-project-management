# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Attach PDFs or photos from your own computer to a project (site audit reports, drawings, mails ...).

    python manage.py e9_attach_files --project "Name" --kind site_audit --label "Visit 1" --status Final a.pdf b.pdf

Kinds: site_audit, document, po, mail, certificate, pi, wcc, jmc. The files are copied into the
(git-ignored) e9_uploads folder on this computer and nothing about them is saved in the code.
"""

from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from plane.db.models import Project, Workspace
from plane.e9.models import E9Attachment, E9AttachmentKind
from plane.e9.safety import upload_type

MAX_BYTES = 25 * 1024 * 1024
KINDS = [kind for kind in E9AttachmentKind.values if kind not in ("photo", "snag", "install_photo", "dc_scan")]


class Command(BaseCommand):
    help = "Attach PDF / photo files to a project."

    def add_arguments(self, parser):
        parser.add_argument("files", nargs="+", help="Paths of the files")
        parser.add_argument("--project", required=True, help="Exact project name")
        parser.add_argument("--kind", default="document", choices=KINDS)
        parser.add_argument("--label", default="", help="e.g. 'Visit 1 - 12 Nov' (site audit reports)")
        parser.add_argument("--status", default="", choices=["", "Draft", "Final"], dest="draft")
        parser.add_argument("--workspace", default="e9-creative", help="Workspace slug")

    def handle(self, *args, **options):
        workspace = Workspace.objects.filter(slug=options["workspace"]).first()
        project = Project.objects.filter(workspace=workspace, name=options["project"]).first() if workspace else None
        if project is None:
            raise CommandError(f"No project named {options['project']!r}.")
        prepared = []
        for raw in options["files"]:
            path = Path(raw).expanduser()
            if not path.is_file():
                raise CommandError(f"File not found: {path}")
            data = path.read_bytes()
            content_type = upload_type(path.name, data[:16])
            if content_type is None:
                raise CommandError(f"{path.name}: only photos (JPG, PNG, GIF, WEBP, HEIC) and PDFs can be attached.")
            if len(data) > MAX_BYTES:
                raise CommandError(f"{path.name} is larger than 25 MB.")
            prepared.append((path.name, data, content_type))
        with transaction.atomic():
            for name, data, content_type in prepared:
                upload = SimpleUploadedFile(name, data, content_type=content_type)
                attachment = E9Attachment(
                    project=project,
                    workspace_id=project.workspace_id,
                    kind=options["kind"],
                    label=options["label"],
                    version=options["draft"],
                    name=name[:255],
                    size=len(data),
                    content_type=content_type,
                )
                attachment.file.save(name, upload, save=False)
                attachment.save()
                self.stdout.write(f"Attached {name} ({options['kind']}).")
        self.stdout.write(self.style.SUCCESS(f"{len(prepared)} file(s) attached to {project.name}."))
