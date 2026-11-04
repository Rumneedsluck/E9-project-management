# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Create a ready-to-use E9 Creative demo on a local computer.

Run:  python manage.py e9_demo_setup

It creates (only if they don't exist yet):
  * the instance setup that Plane normally asks for in the admin screen,
  * an "E9 Creative" workspace with an admin login and a small made-up team,
  * made-up sample signage/branding projects with statuses, priorities,
    deadlines, team members and a few work items.

All names, companies and emails are invented. Never use this on a live server.
"""

import secrets
from datetime import timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from plane.app.permissions import ROLE
from plane.app.serializers import ProjectSerializer
from plane.db.models import (
    DEFAULT_STATES,
    Issue,
    IssueAssignee,
    Profile,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)
from plane.e9.models import E9ProjectProfile
from plane.license.models import Instance, InstanceAdmin, InstanceConfiguration

WORKSPACE_NAME = "E9 Creative"
WORKSPACE_SLUG = "e9-creative"
DEFAULT_ADMIN_EMAIL = "admin@example.com"
DEFAULT_PASSWORD = "E9Demo@2026"

TEAM = [
    # email, first name, last name, job title
    ("aarav.mehta@example.com", "Aarav", "Mehta", "Project Coordinator"),
    ("kavya.rao@example.com", "Kavya", "Rao", "Pre-Press Designer"),
    ("rohan.iyer@example.com", "Rohan", "Iyer", "Site Supervisor"),
    ("sneha.kulkarni@example.com", "Sneha", "Kulkarni", "Installation Lead"),
    ("imran.shaikh@example.com", "Imran", "Shaikh", "Production & Vendors"),
]

# Order of the job stages; used to decide how many sample work items are already done.
STAGE_ORDER = [
    "awarded",
    "site_audit",
    "pre_press",
    "production",
    "delivery",
    "installation",
    "sign_off",
    "completed",
]

WORK_ITEMS = [
    "Site audit & measurements",
    "Wall graphics – breakout areas",
    "Glass film – cabins & meeting rooms",
    "Reception 3D logo",
    "Internal wayfinding signages",
    "External fascia signage",
]

# All companies below are fictional.
PROJECTS = [
    {
        "name": "Northwind Tech Park Fitout",
        "identifier": "NWT",
        "client_name": "Northwind Technologies",
        "city": "Bengaluru",
        "site_address": "Tower B, Outer Ring Road, Bengaluru",
        "status": "installation",
        "priority": "high",
        "start_offset": -40,
        "deadline_offset": 9,
        "lead": "aarav.mehta@example.com",
        "team": ["rohan.iyer@example.com", "sneha.kulkarni@example.com", "kavya.rao@example.com"],
        "description": "Wall graphics, glass films and a 3D reception logo across three floors.",
    },
    {
        "name": "Aster Health Head Office",
        "identifier": "AHO",
        "client_name": "Aster Health Pvt. Ltd.",
        "city": "Pune",
        "site_address": "Baner Road, Pune",
        "status": "pre_press",
        "priority": "medium",
        "start_offset": -12,
        "deadline_offset": 34,
        "lead": "aarav.mehta@example.com",
        "team": ["kavya.rao@example.com", "imran.shaikh@example.com"],
        "description": "Brand walls, cabin glass manifestation and internal signages.",
    },
    {
        "name": "Bluefin Bank Branch Rollout",
        "identifier": "BFB",
        "client_name": "Bluefin Bank",
        "city": "Mumbai",
        "site_address": "6 branches, Mumbai suburbs",
        "status": "production",
        "priority": "high",
        "start_offset": -25,
        "deadline_offset": 4,
        "lead": "imran.shaikh@example.com",
        "team": ["kavya.rao@example.com", "sneha.kulkarni@example.com"],
        "description": "External fascia signage and ATM lobby branding for six branches.",
    },
    {
        "name": "Orbit Logistics Warehouse",
        "identifier": "ORB",
        "client_name": "Orbit Logistics",
        "city": "Chennai",
        "site_address": "Sriperumbudur Industrial Area, Chennai",
        "status": "delivery",
        "priority": "medium",
        "start_offset": -35,
        "deadline_offset": -3,
        "lead": "rohan.iyer@example.com",
        "team": ["imran.shaikh@example.com", "sneha.kulkarni@example.com"],
        "description": "Safety and wayfinding signages for the new warehouse.",
    },
    {
        "name": "Cedar Consulting Office Refresh",
        "identifier": "CDR",
        "client_name": "Cedar & Co. Consulting",
        "city": "Hyderabad",
        "site_address": "HITEC City, Hyderabad",
        "status": "site_audit",
        "priority": "low",
        "start_offset": -3,
        "deadline_offset": 52,
        "lead": "rohan.iyer@example.com",
        "team": ["kavya.rao@example.com"],
        "description": "Hand-painted feature wall and glass films for meeting rooms.",
    },
    {
        "name": "Lumen Studios Reception",
        "identifier": "LUM",
        "client_name": "Lumen Studios",
        "city": "Bengaluru",
        "site_address": "Indiranagar, Bengaluru",
        "status": "completed",
        "priority": "low",
        "start_offset": -60,
        "deadline_offset": -18,
        "lead": "aarav.mehta@example.com",
        "team": ["sneha.kulkarni@example.com"],
        "description": "Backlit 3D logo and reception wall graphics.",
    },
    {
        "name": "Harbor Retail Flagship Store",
        "identifier": "HRS",
        "client_name": "Harbor Retail",
        "city": "Kochi",
        "site_address": "MG Road, Kochi",
        "status": "on_hold",
        "priority": "medium",
        "start_offset": -15,
        "deadline_offset": 40,
        "lead": "imran.shaikh@example.com",
        "team": ["rohan.iyer@example.com"],
        "description": "Store facade signage – waiting for landlord approval.",
    },
]


class Command(BaseCommand):
    help = "Create a local E9 Creative demo workspace with made-up sample projects."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=DEFAULT_ADMIN_EMAIL, help="Email for the admin login")
        parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Password for every demo login")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        password = options["password"]

        if not InstanceConfiguration.objects.exists():
            call_command("configure_instance")

        with transaction.atomic():
            admin = self._user(email, "E9", "Admin", password)
            self._setup_instance(admin)
            workspace = self._workspace(admin)
            people = {email: admin}
            for team_email, first, last, _title in TEAM:
                people[team_email] = self._user(team_email, first, last, password)
                self._workspace_member(workspace, people[team_email], ROLE.MEMBER.value)
            for user in people.values():
                Profile.objects.filter(user=user).update(last_workspace_id=workspace.id)

            created = 0
            for spec in PROJECTS:
                if Project.objects.filter(workspace=workspace, name=spec["name"]).exists():
                    continue
                self._project(workspace, admin, people, spec)
                created += 1

        self.stdout.write(self.style.SUCCESS(f"E9 demo ready: {created} new sample project(s)."))
        self.stdout.write(f"  Sign in at http://localhost:3000 with {email} / {password}")
        self.stdout.write("  Team logins use the same password, e.g. aarav.mehta@example.com")

    # ------------------------------------------------------------------ helpers
    def _user(self, email, first_name, last_name, password):
        user = User.objects.filter(email=email).first()
        if user is None:
            user = User(
                email=email,
                username=f"{email.split('@')[0].replace('.', '_')}_{secrets.token_hex(3)}",
                first_name=first_name,
                last_name=last_name,
                display_name=email.split("@")[0],
                is_email_verified=True,
                is_password_autoset=False,
            )
            user.set_password(password)
            user.save()
        Profile.objects.get_or_create(
            user=user,
            defaults={
                "is_onboarded": True,
                "is_tour_completed": True,
                "onboarding_step": {
                    "profile_complete": True,
                    "workspace_create": True,
                    "workspace_invite": True,
                    "workspace_join": True,
                },
            },
        )
        return user

    def _setup_instance(self, admin):
        instance = Instance.objects.first()
        if instance is None:
            instance = Instance.objects.create(
                instance_name=WORKSPACE_NAME,
                instance_id=secrets.token_hex(12),
                current_version="local",
                latest_version="local",
                last_checked_at=timezone.now(),
            )
        instance.is_setup_done = True
        instance.is_signup_screen_visited = True
        if not instance.instance_name or instance.instance_name == "Plane Community Edition":
            instance.instance_name = WORKSPACE_NAME
        instance.save()
        InstanceAdmin.objects.get_or_create(instance=instance, user=admin, defaults={"role": 20})

    def _workspace(self, admin):
        workspace = Workspace.objects.filter(slug=WORKSPACE_SLUG).first()
        if workspace is None:
            workspace = Workspace.objects.create(name=WORKSPACE_NAME, slug=WORKSPACE_SLUG, owner=admin)
        self._workspace_member(workspace, admin, ROLE.ADMIN.value)
        return workspace

    def _workspace_member(self, workspace, user, role):
        WorkspaceMember.objects.get_or_create(workspace=workspace, member=user, defaults={"role": role})

    def _project(self, workspace, admin, people, spec):
        today = timezone.localdate()
        lead = people[spec["lead"]]

        # Reuse Plane's own project validation (name/identifier rules).
        serializer = ProjectSerializer(
            data={
                "name": spec["name"],
                "identifier": spec["identifier"],
                "description": spec["description"],
                "project_lead": str(lead.id),
                "network": 2,
            },
            context={"workspace_id": workspace.id},
        )
        serializer.is_valid(raise_exception=True)
        project = serializer.save()

        # Same set-up Plane's project create endpoint does: members + default states.
        ProjectMember.objects.create(project=project, member=admin, role=ROLE.ADMIN.value)
        if lead != admin:
            ProjectMember.objects.create(project=project, member=lead, role=ROLE.ADMIN.value)
        team = [people[team_email] for team_email in spec["team"]]
        for person in team:
            ProjectMember.objects.create(project=project, member=person, role=ROLE.MEMBER.value)
        State.objects.bulk_create(
            [
                State(
                    name=state["name"],
                    color=state["color"],
                    project=project,
                    sequence=state["sequence"],
                    workspace=workspace,
                    group=state["group"],
                    default=state.get("default", False),
                    created_by=admin,
                )
                for state in DEFAULT_STATES
            ]
        )

        E9ProjectProfile.objects.create(
            project=project,
            workspace=workspace,
            client_name=spec["client_name"],
            city=spec["city"],
            site_address=spec["site_address"],
            status=spec["status"],
            priority=spec["priority"],
            start_date=today + timedelta(days=spec["start_offset"]),
            deadline=today + timedelta(days=spec["deadline_offset"]),
        )

        self._work_items(project, spec["status"], [lead, *team])

    def _work_items(self, project, project_status, assignees):
        states = {state.group: state for state in State.objects.filter(project=project)}
        if project_status in STAGE_ORDER:
            progress = STAGE_ORDER.index(project_status) / (len(STAGE_ORDER) - 1)
        else:  # on hold
            progress = 0.3
        done_count = round(progress * len(WORK_ITEMS))
        for index, name in enumerate(WORK_ITEMS):
            if index < done_count:
                group = "completed"
            elif index == done_count:
                group = "started"
            else:
                group = "unstarted"
            issue = Issue.objects.create(
                project=project,
                workspace=project.workspace,
                name=name,
                state=states.get(group) or states.get("backlog"),
                priority="medium",
            )
            assignee = assignees[index % len(assignees)]
            IssueAssignee.objects.create(issue=issue, assignee=assignee, project=project, workspace=project.workspace)
