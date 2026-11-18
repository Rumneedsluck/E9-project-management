# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Remove every project from the E9 workspace except the one you name.

First look at what would go (nothing is removed):
    python manage.py e9_keep_only --keep "Project name"
Then do it:
    python manage.py e9_keep_only --keep "Project name" --yes

Projects are put in the trash the way the website's Delete does (not wiped from the database).
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from plane.db.models import Project, Workspace


class Command(BaseCommand):
    help = "Keep one project, remove all the others from the workspace."

    def add_arguments(self, parser):
        parser.add_argument("--keep", required=True, help="Exact name of the project to keep")
        parser.add_argument("--workspace", default="e9-creative", help="Workspace slug")
        parser.add_argument("--yes", action="store_true", help="Actually remove them")

    def handle(self, *args, **options):
        workspace = Workspace.objects.filter(slug=options["workspace"]).first()
        if workspace is None:
            raise CommandError(f"No workspace with slug {options['workspace']!r}.")
        keep = Project.objects.filter(workspace=workspace, name=options["keep"]).first()
        if keep is None:
            raise CommandError(f"No project named {options['keep']!r}. Nothing was removed.")
        others = list(Project.objects.filter(workspace=workspace).exclude(pk=keep.pk).order_by("name"))
        self.stdout.write(f"Keeping: {keep.name}")
        self.stdout.write(f"Would remove {len(others)} project(s):")
        for project in others:
            self.stdout.write(f"  - {project.name}")
        if not options["yes"]:
            self.stdout.write(self.style.WARNING("Nothing removed yet. Run again with --yes to remove them."))
            return
        with transaction.atomic():
            for project in others:
                project.delete()  # soft delete, same as the website's Delete
        self.stdout.write(self.style.SUCCESS(f"Removed {len(others)} project(s). {keep.name} is kept."))
