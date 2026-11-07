/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Button } from "@makeplane/propel/components/button";

export function E9LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }).map((_, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- static placeholders
        <div key={index} className="h-32 animate-pulse rounded-xl border border-subtle bg-layer-1" />
      ))}
    </div>
  );
}

export function E9ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-subtle bg-surface-1 px-6 py-12 text-center">
      <p className="text-body-md-semibold text-primary">We couldn't load this right now.</p>
      <p className="max-w-md text-body-sm-regular text-tertiary">
        {message ?? "Check that the backend is running, then try again."}
      </p>
      {onRetry && <Button size="md" stretch="auto" variant="secondary" label="Try again" onClick={onRetry} />}
    </div>
  );
}

export function E9EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-strong bg-surface-1 px-6 py-14 text-center">
      <p className="text-body-md-semibold text-primary">{title}</p>
      <p className="max-w-md text-body-sm-regular text-tertiary">{description}</p>
      {action}
    </div>
  );
}
