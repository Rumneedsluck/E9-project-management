# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.apps import AppConfig


class E9Config(AppConfig):
    """E9 Creative customisations.

    Everything E9-specific on the backend lives in this app so that Plane's own
    code stays untouched and future Plane upgrades are easier to merge.
    """

    name = "plane.e9"
    label = "e9"
    verbose_name = "E9 Creative"
