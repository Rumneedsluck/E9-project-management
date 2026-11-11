# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Certification (JMC) rules.

Flow on a site:  work finished -> joint measurement with the client (JMC) -> certified quantities typed
into the tracker -> client signs the JMC sheet -> certification done -> billing opens.

Big jobs can certify one floor or one scope at a time (running / part bills): each part has its
own signed JMC, so every bill is backed by a signature.
"""

from .models import E9Attachment, E9Certification, E9Floor, E9ProjectStatus, E9ScopeItem
from .services import split_floors

# stages where the work on site is over and the JMC is the next step
WORK_DONE_STATUSES = {E9ProjectStatus.SIGN_OFF, E9ProjectStatus.COMPLETED}

STATE_TEXT = {
    "in_progress": "Work in progress",
    "jmc_pending": "Waiting for JMC",
    "part_certified": "Part certified",
    "certified": "Certified",
}


def _norm(value):
    return " ".join((value or "").split()).casefold()


def is_filled(item):
    return bool(item.floor_area.strip() or item.description.strip() or item.height_in or item.width_in or item.qty)


def state(profile, certifications):
    """in_progress | jmc_pending | part_certified | certified."""
    done = [cert for cert in certifications if cert.done_on]
    if any(cert.is_whole for cert in done):
        return "certified"
    if done:
        return "part_certified"
    if profile is not None and profile.status in WORK_DONE_STATUSES:
        return "jmc_pending"
    return "in_progress"


def billing_open(profile, certifications):
    """Billing opens once a JMC is signed: the whole project, or a floor / scope for a part bill."""
    return any(cert.done_on for cert in certifications)


def project_states(projects):
    """{project_id: (state, billing_open)} for a list of projects, in one query."""
    by_project = {}
    for cert in E9Certification.objects.filter(project__in=projects):
        by_project.setdefault(cert.project_id, []).append(cert)
    result = {}
    for project in projects:
        profile = getattr(project, "e9_profile", None)
        if profile is not None and profile.deleted_at is not None:
            profile = None
        certs = by_project.get(project.id, [])
        result[project.id] = (state(profile, certs), billing_open(profile, certs))
    return result


def covers(cert, item):
    """Does this certification cover this tracker row?"""
    # an item can sit on several floors ("7th Floor, 8th Floor"): the JMC covers it if it names any of them
    if cert.floor and _norm(cert.floor) not in {_norm(floor) for floor in split_floors(item.floor_area)}:
        return False
    if cert.scope and cert.scope != item.scope:
        return False
    return True


def readiness(items):
    """How far the certified quantities are filled in, for a group of tracker rows."""
    rows = [item for item in items if is_filled(item) and item.hold_status != "Cancelled"]
    certified = [item for item in rows if item.certified_qty is not None or item.certified_height_in is not None]
    installed = [item for item in rows if item.installation_status == "Installation Done" and not item.hold_status]
    return {"rows": len(rows), "certified": len(certified), "installed": len(installed)}


def _iso(value):
    return value.isoformat() if value else None


def payload(project, can_edit, scopes):
    profile = getattr(project, "e9_profile", None)
    certs = list(E9Certification.objects.filter(project=project))
    items = list(E9ScopeItem.objects.filter(project=project))
    files = {}
    for attachment in E9Attachment.objects.filter(project=project, kind="jmc", ref_id__isnull=False):
        files[attachment.ref_id] = files.get(attachment.ref_id, 0) + 1
    floors = [floor.name for floor in E9Floor.objects.filter(project=project).order_by("sort_order", "created_at")]
    used_floors = sorted({floor for item in items if is_filled(item) for floor in split_floors(item.floor_area)})
    for name in used_floors:
        if _norm(name) not in {_norm(floor) for floor in floors}:
            floors.append(name)
    return {
        "can_edit": can_edit,
        "state": state(profile, certs),
        "state_text": STATE_TEXT[state(profile, certs)],
        "billing_open": billing_open(profile, certs),
        "floors": floors,
        "scopes": [{"key": key, "label": scope.label} for key, scope in scopes.items() if scope.enabled],
        "overall": readiness(items),
        "certifications": [
            {
                "id": str(cert.id),
                "label": str(cert),
                "floor": cert.floor,
                "scope": cert.scope,
                "is_whole": cert.is_whole,
                "jmc_number": cert.jmc_number,
                "jmc_date": _iso(cert.jmc_date),
                "client_signatory": cert.client_signatory,
                "done_on": _iso(cert.done_on),
                "link": cert.link,
                "notes": cert.notes,
                "files": files.get(cert.id, 0),
                "bills": cert.bills.count(),
                "readiness": readiness([item for item in items if covers(cert, item)]),
            }
            for cert in certs
        ],
    }
