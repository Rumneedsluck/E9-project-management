# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from .views import (
    E9ProjectDetailEndpoint,
    E9ProjectListEndpoint,
    E9ScopeItemBulkEndpoint,
    E9ScopeItemDetailEndpoint,
    E9ScopeItemRestoreEndpoint,
    E9ScopeItemListEndpoint,
)
from .views_setup import (
    E9AttachmentDetailEndpoint,
    E9AttachmentFileEndpoint,
    E9AttachmentListEndpoint,
    E9FloorDetailEndpoint,
    E9FloorListEndpoint,
    E9ActivityEndpoint,
    E9HistoryEndpoint,
    E9ImportEndpoint,
    E9ScopeListEndpoint,
)

from .views_boq import (
    E9AmendmentDetailEndpoint,
    E9AmendmentListEndpoint,
    E9BillDetailEndpoint,
    E9BillListEndpoint,
    E9BoqEndpoint,
    E9BoqLineDetailEndpoint,
    E9BoqLineListEndpoint,
    E9LogEntryEndpoint,
    E9LogsEndpoint,
    E9PODetailEndpoint,
    E9POListEndpoint,
    E9ReprintDetailEndpoint,
    E9ReprintListEndpoint,
    E9SummaryEndpoint,
)

from .views_cert import (
    E9AnnouncementDetailEndpoint,
    E9AnnouncementListEndpoint,
    E9CertificationDetailEndpoint,
    E9CertificationListEndpoint,
)
from .views_report import E9ClientReportEndpoint, E9HealthEndpoint, E9HoldEndpoint
from .views_snags import E9SnagDetailEndpoint, E9SnagListEndpoint

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
        "workspaces/<str:slug>/e9/projects/<uuid:project_id>/items/bulk/",
        E9ScopeItemBulkEndpoint.as_view(),
        name="e9-scope-items-bulk",
    ),
    path(
        "workspaces/<str:slug>/e9/projects/<uuid:project_id>/items/<uuid:item_id>/restore/",
        E9ScopeItemRestoreEndpoint.as_view(),
        name="e9-item-restore",
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
    path(f"{P}/activity/", E9ActivityEndpoint.as_view(), name="e9-activity"),
    path(f"{P}/import/", E9ImportEndpoint.as_view(), name="e9-import"),
    # BOQ, POs, amendments, reprints
    path(f"{P}/boq/", E9BoqEndpoint.as_view(), name="e9-boq"),
    path(f"{P}/boq/pos/", E9POListEndpoint.as_view(), name="e9-pos"),
    path(f"{P}/boq/pos/<uuid:po_id>/", E9PODetailEndpoint.as_view(), name="e9-po-detail"),
    path(f"{P}/boq/lines/", E9BoqLineListEndpoint.as_view(), name="e9-boq-lines"),
    path(f"{P}/boq/lines/<uuid:line_id>/", E9BoqLineDetailEndpoint.as_view(), name="e9-boq-line-detail"),
    path(f"{P}/boq/amendments/", E9AmendmentListEndpoint.as_view(), name="e9-amendments"),
    path(
        f"{P}/boq/amendments/<uuid:amendment_id>/",
        E9AmendmentDetailEndpoint.as_view(),
        name="e9-amendment-detail",
    ),
    path(f"{P}/reprints/", E9ReprintListEndpoint.as_view(), name="e9-reprints"),
    path(f"{P}/reprints/<uuid:reprint_id>/", E9ReprintDetailEndpoint.as_view(), name="e9-reprint-detail"),
    # Snag list
    path(f"{P}/hold/", E9HoldEndpoint.as_view(), name="e9-hold"),
    path(f"{P}/health/", E9HealthEndpoint.as_view(), name="e9-health"),
    path(f"{P}/report/", E9ClientReportEndpoint.as_view(), name="e9-report"),
    path(f"{P}/snags/", E9SnagListEndpoint.as_view(), name="e9-snags"),
    path(f"{P}/snags/<uuid:snag_id>/", E9SnagDetailEndpoint.as_view(), name="e9-snag-detail"),
    # JC & DC logs
    path(f"{P}/logs/", E9LogsEndpoint.as_view(), name="e9-logs"),
    path(f"{P}/logs/<str:kind>/", E9LogEntryEndpoint.as_view(), name="e9-log-entry"),
    # Billing
    path(f"{P}/certifications/", E9CertificationListEndpoint.as_view(), name="e9-certifications"),
    path(
        f"{P}/certifications/<uuid:cert_id>/",
        E9CertificationDetailEndpoint.as_view(),
        name="e9-certification-detail",
    ),
    path(f"{P}/bills/", E9BillListEndpoint.as_view(), name="e9-bills"),
    path(f"{P}/bills/<uuid:bill_id>/", E9BillDetailEndpoint.as_view(), name="e9-bill-detail"),
    # Company summary
    path("workspaces/<str:slug>/e9/summary/", E9SummaryEndpoint.as_view(), name="e9-summary"),
    path("workspaces/<str:slug>/e9/announcements/", E9AnnouncementListEndpoint.as_view(), name="e9-announcements"),
    path(
        "workspaces/<str:slug>/e9/announcements/<uuid:announcement_id>/",
        E9AnnouncementDetailEndpoint.as_view(),
        name="e9-announcement-detail",
    ),
]
