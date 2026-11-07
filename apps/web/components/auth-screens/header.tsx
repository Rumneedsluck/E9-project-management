/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { E9_BRAND, E9Logo } from "@/components/e9/brand";
import { EAuthModes } from "@/helpers/authentication.helper";
import { useInstance } from "@/hooks/store/use-instance";

const authContentMap = {
  [EAuthModes.SIGN_IN]: {
    pageTitle: "Sign up",
    text: "auth.common.new_to_plane",
    linkText: "Sign up",
    linkHref: "/sign-up",
  },
  [EAuthModes.SIGN_UP]: {
    pageTitle: "Sign in",
    text: "auth.common.already_have_an_account",
    linkText: "Sign in",
    linkHref: "/sign-in",
  },
};

type AuthHeaderProps = {
  type: EAuthModes;
  /** Hide the logo on large screens, where the E9 brand panel already shows it */
  hideLogoOnDesktop?: boolean;
};

export const AuthHeader = observer(function AuthHeader({ type, hideLogoOnDesktop = false }: AuthHeaderProps) {
  const { t } = useTranslation();
  // store
  const { config } = useInstance();
  // derived values
  const enableSignUpConfig = config?.enable_signup ?? false;

  return (
    <AuthHeaderBase
      pageTitle={t(authContentMap[type].pageTitle)}
      hideLogoOnDesktop={hideLogoOnDesktop}
      additionalAction={
        enableSignUpConfig && (
          <div className="flex flex-col items-end text-center text-body-xs-medium text-tertiary sm:flex-row sm:items-center sm:gap-2">
            <span className="text-body-sm-regular text-tertiary">{t(authContentMap[type].text)}</span>
            <Link
              href={authContentMap[type].linkHref}
              className="text-body-sm-semibold text-accent-primary hover:underline"
            >
              {t(authContentMap[type].linkText)}
            </Link>
          </div>
        )
      }
    />
  );
});

type TAuthHeaderBase = {
  pageTitle: string;
  additionalAction?: React.ReactNode;
  hideLogoOnDesktop?: boolean;
};

export function AuthHeaderBase(props: TAuthHeaderBase) {
  const { pageTitle, additionalAction, hideLogoOnDesktop = false } = props;
  return (
    <>
      <PageHead title={`${pageTitle} - ${E9_BRAND.name}`} />
      <div className="sticky top-0 flex w-full flex-shrink-0 items-center justify-between gap-6">
        <Link href="/" className={hideLogoOnDesktop ? "lg:invisible" : undefined}>
          <E9Logo />
        </Link>
        {additionalAction}
      </div>
    </>
  );
}
