/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { E9_BRAND, E9Text } from "@/components/e9/brand";

export function AuthFooter() {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-body-xs-regular text-tertiary">
        <E9Text>{E9_BRAND.name}</E9Text> · {E9_BRAND.tagline}
      </span>
      <span className="text-body-2xs-regular text-placeholder">
        Access is by invitation from your E9 administrator.
      </span>
    </div>
  );
}
