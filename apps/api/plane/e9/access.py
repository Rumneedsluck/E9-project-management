# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Project access codes.

An admin can give a project a 6-digit code. Members and guests then have to type it before any page of that
project answers (tracker, BOQ, bills, photos ...). Admins (project or workspace) never need it. Once typed
correctly it is remembered in the user's login session, so it is asked again after signing out.

The check runs in front of every project URL (see `guard_urlpatterns` in urls.py), so no page can be forgotten.
"""

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.http import JsonResponse
from django.urls import path
from rest_framework.request import Request

from plane.authentication.session import BaseSessionAuthentication

from .models import E9ProjectProfile

ACCESS_CODE_LENGTH = 6
SESSION_KEY = "e9_unlocked_projects"
MAX_TRIES = 5
LOCKOUT_SECONDS = 15 * 60
LOCKED_STATUS = 423  # "Locked"

# project URLs that must answer even while the project is locked (reading the project itself is also open)
OPEN_ROUTES = {"e9-project-unlock"}


def is_valid_code(value):
    return isinstance(value, str) and len(value) == ACCESS_CODE_LENGTH and value.isdigit()


def hash_code(code):
    return make_password(code)


def code_matches(profile, code):
    return bool(profile.access_code_hash) and check_password(code, profile.access_code_hash)


def _profile(slug, project_id):
    return E9ProjectProfile.objects.filter(project_id=project_id, project__workspace__slug=slug).first()


def has_code(slug, project_id):
    profile = _profile(slug, project_id)
    return bool(profile and profile.access_code_hash)


def unlocked_in(session, project_id):
    return str(project_id) in (session.get(SESSION_KEY) or [])


def remember_unlock(session, project_id):
    ids = list(session.get(SESSION_KEY) or [])
    if str(project_id) not in ids:
        ids.append(str(project_id))
    session[SESSION_KEY] = ids
    session.modified = True


def forget_unlock(session, project_id):
    session[SESSION_KEY] = [value for value in (session.get(SESSION_KEY) or []) if value != str(project_id)]
    session.modified = True


def is_locked_for(user, session, slug, project_id):
    """True when this person has to type the project's code before the project opens for them."""
    from .views import _can_edit  # local import: views import this module's helpers too

    if not has_code(slug, project_id):
        return False
    if _can_edit(user, slug, project_id):
        return False  # project admins and workspace admins never need the code
    return not unlocked_in(session, project_id)


# ---- wrong-guess limit: a 6-digit code is short, so tries are counted -----------------------------------------


def _tries_key(user_id, project_id):
    return f"e9-code-tries:{user_id}:{project_id}"


def tries_left(user_id, project_id):
    return max(0, MAX_TRIES - int(cache.get(_tries_key(user_id, project_id)) or 0))


def count_wrong_try(user_id, project_id):
    key = _tries_key(user_id, project_id)
    cache.add(key, 0, LOCKOUT_SECONDS)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, LOCKOUT_SECONDS)


def reset_tries(user_id, project_id):
    cache.delete(_tries_key(user_id, project_id))


# ---- the guard -------------------------------------------------------------------------------------------------


def project_lock(view, route_name):
    """Wrap a project view: a locked project answers 423 instead of its data."""

    def guarded(request, *args, **kwargs):
        project_id = kwargs.get("project_id")
        slug = kwargs.get("slug")
        if project_id is None or slug is None:
            return view(request, *args, **kwargs)
        # who is asking, the same way the view itself will work it out (works with test logins too)
        user = Request(request, authenticators=[BaseSessionAuthentication()]).user
        if user is not None and user.is_authenticated:
            open_detail = route_name == "e9-project-detail" and request.method == "GET"
            if (
                not open_detail
                and route_name not in OPEN_ROUTES
                and is_locked_for(user, request.session, slug, project_id)
            ):
                return JsonResponse(
                    {"error": "This project is locked. Type its code to open it.", "locked": True},
                    status=LOCKED_STATUS,
                )
        return view(request, *args, **kwargs)

    guarded.csrf_exempt = getattr(view, "csrf_exempt", False)
    return guarded


def guard_urlpatterns(patterns):
    """Put the lock in front of every URL that belongs to one project."""
    guarded = []
    for entry in patterns:
        route = str(entry.pattern)
        if "<uuid:project_id>" in route and entry.name != "e9-project-unlock":
            entry = path(route, project_lock(entry.callback, entry.name), name=entry.name)
        guarded.append(entry)
    return guarded
