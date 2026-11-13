# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Import one E9 tracker Excel file into one project, from the command line.

    python manage.py e9_import_tracker --file ~/Downloads/Tracker.xlsx --project "Project name"

The project is created when it does not exist yet. The Excel file stays on your computer: this command
never copies it anywhere and nothing about it is saved in the code.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from plane.db.models import Project, ProjectMember, User, Workspace, WorkspaceMember
from plane.e9 import importer
from plane.e9.models import E9ProjectProfile


class Command(BaseCommand):
    help = "Import an E9 tracker .xlsx into a project (created if missing)."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Path to the .xlsx tracker")
        parser.add_argument("--project", required=True, help="Project name (created if it does not exist)")
        parser.add_argument("--workspace", default="e9-creative", help="Workspace slug")
        parser.add_argument("--identifier", default="", help="Short project code for a new project, e.g. BTD")

    def handle(self, *args, **options):
        workspace = Workspace.objects.filter(slug=options["workspace"]).first()
        if workspace is None:
            raise CommandError(f"No workspace with slug {options['workspace']!r}.")
        admin = (
            WorkspaceMember.objects.filter(workspace=workspace, role=20, is_active=True)
            .select_related("member")
            .first()
        )
        if admin is None:
            raise CommandError("The workspace has no admin to import as.")
        user: User = admin.member

        with transaction.atomic():
            project = Project.objects.filter(workspace=workspace, name=options["project"]).first()
            if project is None:
                code = (options["identifier"] or "".join(word[0] for word in options["project"].split()))[:5].upper()
                project = Project.objects.create(
                    workspace=workspace, name=options["project"], identifier=code or "E9", created_by=user
                )
                ProjectMember.objects.create(project=project, member=user, role=20, workspace=workspace)
                E9ProjectProfile.objects.get_or_create(project=project, defaults={"workspace_id": workspace.id})
                self.stdout.write(f"Created project {project.name!r}.")
            with open(options["file"], "rb") as handle:
                try:
                    report = importer.import_tracker(project, handle, user)
                except importer.ImportProblem as problem:
                    raise CommandError(str(problem)) from problem
        self.stdout.write(self.style.SUCCESS("Imported."))
        self.stdout.write(str(report))
