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
from .views_setup import (
    E9AttachmentDetailEndpoint,
    E9AttachmentFileEndpoint,
    E9AttachmentListEndpoint,
    E9FloorDetailEndpoint,
    E9FloorListEndpoint,
    E9HistoryEndpoint,
    E9ImportEndpoint,
    E9ScopeListEndpoint,
)

P = "workspaces/<str:slug>/e9/projects/<uuid:project_id>"

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
    path(f"{P}/scopes/", E9ScopeListEndpoint.as_view(), name="e9-scopes"),
    path(f"{P}/floors/", E9FloorListEndpoint.as_view(), name="e9-floors"),
    path(f"{P}/floors/<uuid:floor_id>/", E9FloorDetailEndpoint.as_view(), name="e9-floor-detail"),
    path(f"{P}/attachments/", E9AttachmentListEndpoint.as_view(), name="e9-attachments"),
    path(
        f"{P}/attachments/<uuid:attachment_id>/",
        E9AttachmentDetailEndpoint.as_view(),
        name="e9-attachment-detail",
    ),
    path(
        f"{P}/attachments/<uuid:attachment_id>/file/",
        E9AttachmentFileEndpoint.as_view(),
        name="e9-attachment-file",
    ),
    path(f"{P}/history/", E9HistoryEndpoint.as_view(), name="e9-history"),
    path(f"{P}/import/", E9ImportEndpoint.as_view(), name="e9-import"),
]
