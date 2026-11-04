# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from .views import E9ProjectDetailEndpoint, E9ProjectListEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/e9/projects/",
        E9ProjectListEndpoint.as_view(),
        name="e9-projects",
    ),
    path(
        "workspaces/<str:slug>/e9/projects/<uuid:project_id>/",
        E9ProjectDetailEndpoint.as_view(),
        name="e9-project-detail",
    ),
]
