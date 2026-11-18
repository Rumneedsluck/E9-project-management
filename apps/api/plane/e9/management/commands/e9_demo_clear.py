# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Remove the made-up demo data that e9_demo_setup created.

Run first without --yes to see what would be removed:
    python manage.py e9_demo_clear
Then remove it:
    python manage.py e9_demo_clear --yes

Only the 7 sample projects (matched by their exact demo names) and the 5
made-up team members are removed. Projects you created yourself, the
workspace and your admin login are kept.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from plane.db.models import Project, ProjectMember, User, Workspace, WorkspaceMember
from plane.e9.management.commands.e9_demo_setup import PROJECTS, TEAM, WORKSPACE_SLUG


class Command(BaseCommand):
    help = "Remove the made-up E9 demo projects and demo team members."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Actually remove the demo data")

    def handle(self, *args, **options):
        workspace = Workspace.objects.filter(slug=WORKSPACE_SLUG).first()
        if workspace is None:
            self.stdout.write("No E9 demo workspace found. Nothing to remove.")
            return

        demo_names = [spec["name"] for spec in PROJECTS]
        projects = list(Project.objects.filter(workspace=workspace, name__in=demo_names))
        team_emails = [email for email, *_ in TEAM]
        team = list(User.objects.filter(email__in=team_emails))

        kept = Project.objects.filter(workspace=workspace).exclude(name__in=demo_names).count()

        self.stdout.write("Demo projects to remove:")
        for project in projects:
            self.stdout.write(f"  - {project.name}")
        if not projects:
            self.stdout.write("  (none left)")
        self.stdout.write("Demo team members to remove from the workspace:")
        for user in team:
            self.stdout.write(f"  - {user.first_name} {user.last_name} ({user.email})")
        if not team:
            self.stdout.write("  (none left)")
        self.stdout.write(f"Your own projects that will be KEPT: {kept}")

        if not options["yes"]:
            self.stdout.write(self.style.WARNING("Nothing removed yet. Run again with --yes to remove the items above"))
            return

        with transaction.atomic():
            for project in projects:
                # Plane's own delete: the project and everything in it is moved to the bin
                project.delete()
            ProjectMember.objects.filter(workspace=workspace, member__in=team).delete()
            WorkspaceMember.objects.filter(workspace=workspace, member__in=team).delete()
            # Demo logins can no longer sign in
            User.objects.filter(id__in=[user.id for user in team]).update(is_active=False)

        self.stdout.write(
            self.style.SUCCESS(f"Removed {len(projects)} demo project(s) and {len(team)} demo team member(s).")
        )
