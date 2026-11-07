/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { AuthRoot } from "@/components/account/auth-forms/auth-root";
import { E9AuthShowcase } from "@/components/e9/auth-showcase";
import type { EAuthModes } from "@/helpers/authentication.helper";
import { AuthFooter } from "./footer";
import { AuthHeader } from "./header";

type AuthBaseProps = {
  authType: EAuthModes;
};

export function AuthBase({ authType }: AuthBaseProps) {
  return (
    <div className="relative z-10 flex h-screen w-screen overflow-hidden bg-surface-1">
      {/* E9 brand panel: desktop and large tablets only */}
      <E9AuthShowcase />
      {/* Sign-in form: Plane's own authentication flow */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto px-6 pt-6 pb-8 sm:px-10">
        <AuthHeader type={authType} hideLogoOnDesktop />
        <AuthRoot authMode={authType} />
        <AuthFooter />
      </div>
    </div>
  );
}
