# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Type the project's code to open it (members, guests) and set / remove the code (admins)."""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView

from . import access
from .models import E9ProjectProfile
from .services import record
from .views import _can_edit, _visible_projects


class E9UnlockEndpoint(BaseAPIView):
    """POST {"code": "123456"}: remembered for this login until the person signs out."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, project_id):
        project = _visible_projects(request.user, slug).filter(pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        profile = E9ProjectProfile.objects.filter(project=project).first()
        if profile is None or not profile.access_code_hash or _can_edit(request.user, slug, project.id):
            return Response({"unlocked": True})  # no code to type
        if access.tries_left(request.user.id, project.id) == 0:
            return Response(
                {"error": "Too many wrong codes. Try again in 15 minutes.", "tries_left": 0},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        code = str(request.data.get("code") or "")
        if not (access.is_valid_code(code) and access.code_matches(profile, code)):
            access.count_wrong_try(request.user.id, project.id)
            left = access.tries_left(request.user.id, project.id)
            return Response(
                {"error": "That code is not right.", "tries_left": left}, status=status.HTTP_400_BAD_REQUEST
            )
        access.reset_tries(request.user.id, project.id)
        access.remember_unlock(request.session, project.id)
        return Response({"unlocked": True})


class E9AccessCodeEndpoint(BaseAPIView):
    """Admins: PUT {"code": "123456"} sets the project's code, PUT {"code": ""} removes it."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def put(self, request, slug, project_id):
        project = _visible_projects(request.user, slug).filter(pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _can_edit(request.user, slug, project.id):
            return Response(
                {"error": "Only the project's admins or workspace admins can set the access code."},
                status=status.HTTP_403_FORBIDDEN,
            )
        code = str(request.data.get("code") or "")
        if code and not access.is_valid_code(code):
            return Response(
                {"code": f"The code is exactly {access.ACCESS_CODE_LENGTH} digits."}, status=status.HTTP_400_BAD_REQUEST
            )
        profile, _ = E9ProjectProfile.objects.get_or_create(
            project=project, defaults={"workspace_id": project.workspace_id}
        )
        profile.access_code_hash = access.hash_code(code) if code else ""
        profile.save(update_fields=["access_code_hash", "updated_at"])
        # never write the code itself into the history
        record(
            project,
            request.user,
            "project",
            "updated",
            project.id,
            project.name,
            field="access_code",
            new="set" if code else "removed",
        )
        return Response({"has_access_code": bool(code)})
