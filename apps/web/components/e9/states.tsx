/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Button } from "@makeplane/propel/components/button";
import LatticeLoader from "./vendor/lattice-loader";

export function E9LoadingState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-secondary" aria-busy="true">
      <LatticeLoader
        label="Loading"
        pattern="orbit"
        grid={3}
        shape="square"
        color="var(--brand-default)"
        cellSize={8}
        gap={3}
        fontSize={15}
        showTimer={false}
      />
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
