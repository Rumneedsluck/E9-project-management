/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";

/** The old "Extra & Billing" address now opens Billing. */
export default function E9SummaryRedirect() {
  const { workspaceSlug } = useParams();
  const router = useAppRouter();
  useEffect(() => {
    if (workspaceSlug) router.replace(`/${workspaceSlug.toString()}/e9/billing`);
  }, [router, workspaceSlug]);
  return null;
}
