# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Fill ONE made-up demo project with many tracker rows, to measure how smooth the tracker is.

    python manage.py e9_demo_perf --items 300
    python manage.py e9_demo_perf --items 300 --project "Orbit Logistics Warehouse"

It spreads the rows over all 9 scopes, with varied (made-up) sizes, floors and statuses.
It first removes the tracker rows of that project, so it can be repeated. Developer mode only.
"""

import random
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from plane.db.models import Project
from plane.e9 import tracker
from plane.e9.models import E9ProjectProfile, E9ScopeItem
from plane.e9.services import ensure_floors, ensure_scopes

DEFAULT_PROJECT = "Orbit Logistics Warehouse"
FLOORS = ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor", "5th Floor", "6th Floor", "Reception"]
DESCRIPTIONS = ["Wall", "Pillar", "Passage", "Cabin glass", "Door", "Lobby panel", "Stair wall", "Meeting room"]


class Command(BaseCommand):
    help = "Fill one demo project with lots of made-up tracker rows (for speed tests)."

    def add_arguments(self, parser):
        parser.add_argument("--items", type=int, default=300, help="How many rows in total")
        parser.add_argument("--project", default=DEFAULT_PROJECT, help="Exact name of a demo project")
        parser.add_argument("--seed", type=int, default=7, help="Same number = same data")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Developer mode only (DEBUG).")
        project = Project.objects.filter(name=options["project"]).first()
        if project is None:
            raise CommandError(f"No project named {options['project']!r}. Run e9_demo_setup first.")
        rng = random.Random(options["seed"])
        total = max(1, options["items"])

        with transaction.atomic():
            E9ScopeItem.all_objects.filter(project=project).delete()
            scopes = ensure_scopes(project, enabled_keys=set(tracker.SCOPES), user=None)
            for scope in scopes:
                if not scope.enabled:
                    scope.enabled = True
                    scope.save()
            keys = list(tracker.SCOPES)
            counters = dict.fromkeys(keys, 0)
            rows = []
            for index in range(total):
                key = keys[index % len(keys)]
                counters[key] += 1
                number = counters[key]
                floor = rng.choice(FLOORS)
                height = Decimal(rng.randrange(36, 132, 6))
                width = Decimal(rng.randrange(48, 240, 6))
                done = rng.random() < 0.4
                rows.append(
                    E9ScopeItem(
                        project=project,
                        workspace_id=project.workspace_id,
                        scope=key,
                        item_number=number,
                        sort_order=number * 1000,
                        boq_item_no=f"B{rng.randrange(1, 40):02d}",
                        floor_area=floor,
                        description=f"{rng.choice(DESCRIPTIONS)} {number:02d}",
                        height_in=height,
                        width_in=width,
                        qty=Decimal(rng.choice([1, 1, 1, 2, 4])),
                        production_height_in=height + Decimal(2) if done else None,
                        production_width_in=width + Decimal(2) if done else None,
                        production_status="Production Done" if done else "Not Started",
                        remarks="made-up row for speed tests",
                    )
                )
            E9ScopeItem.objects.bulk_create(rows, batch_size=200)
            ensure_floors(project, FLOORS)
            E9ProjectProfile.objects.get_or_create(project=project, defaults={"workspace_id": project.workspace_id})

        self.stdout.write(
            self.style.SUCCESS(f"{total} made-up rows added to {project.name!r} across {len(keys)} scopes.")
        )
