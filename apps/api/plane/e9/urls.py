# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from .views import (
    E9ProjectDetailEndpoint,
    E9ProjectListEndpoint,
    E9ScopeItemDetailEndpoint,
    E9ScopeItemListEndpoint,
)

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
    path(
        "workspaces/<str:slug>/e9/projects/<uuid:project_id>/items/",
        E9ScopeItemListEndpoint.as_view(),
        name="e9-scope-items",
    ),
    path(
        "workspaces/<str:slug>/e9/projects/<uuid:project_id>/items/<uuid:item_id>/",
        E9ScopeItemDetailEndpoint.as_view(),
        name="e9-scope-item-detail",
    ),
]
