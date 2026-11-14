# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Read-only screens from the template: Hold & cancel lists, Client report, Health check."""

from rest_framework.response import Response

from plane.app.permissions import allow_permission
from plane.app.views.base import BaseAPIView

from . import report
from .views_setup import WORKSPACE_ROLES, _not_found, _project


class _ReportEndpoint(BaseAPIView):
    build = None

    @allow_permission(WORKSPACE_ROLES, level="WORKSPACE")
    def get(self, request, slug, project_id):
        project = _project(request, slug, project_id)
        if project is None:
            return _not_found()
        return Response(type(self).build(project))


class E9HoldEndpoint(_ReportEndpoint):
    build = staticmethod(report.hold_payload)


class E9HealthEndpoint(_ReportEndpoint):
    build = staticmethod(report.health_payload)


class E9ClientReportEndpoint(_ReportEndpoint):
    build = staticmethod(report.report_payload)
