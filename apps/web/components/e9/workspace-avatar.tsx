/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentProps } from "react";
import { WorkspaceAvatar as PropelWorkspaceAvatar } from "@makeplane/propel/components/workspace-avatar";
import { E9LogoMark } from "./brand";

type TProps = ComponentProps<typeof PropelWorkspaceAvatar>;

const SIZE_CLASS: Record<string, string> = {
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
  xl: "size-9",
  "2xl": "size-14",
};

/** Workspace picture: the E9 logo in its own colours until a custom picture is uploaded. */
export function WorkspaceAvatar(props: TProps) {
  if (props.src) return <PropelWorkspaceAvatar {...props} />;
  return <E9LogoMark className={`${SIZE_CLASS[String(props.size ?? "md")] ?? "size-6"} rounded-md`} />;
}
