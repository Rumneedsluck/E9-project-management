/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * In-page "Are you sure?" box (instead of Chrome's grey pop-up at the top of the window).
 *   if (!(await e9Confirm("Delete W3?"))) return;
 * <E9ConfirmHost /> is mounted once by E9PageBody.
 */

import { useEffect, useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { E9Modal } from "./tracker/modal";

type TRequest = {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
};

let listener: ((request: TRequest) => void) | null = null;

export function e9Confirm(
  message: string,
  { confirmLabel = "Delete", danger = true }: { confirmLabel?: string; danger?: boolean } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    // no host on screen (should not happen): fall back to the browser box
    if (!listener) {
      resolve(window.confirm(message));
      return;
    }
    listener({ message, confirmLabel, danger, resolve });
  });
}

export function E9ConfirmHost() {
  const [request, setRequest] = useState<TRequest | null>(null);
  useEffect(() => {
    listener = setRequest;
    return () => {
      if (listener === setRequest) listener = null;
    };
  }, []);
  if (!request) return null;
  const answer = (ok: boolean) => {
    request.resolve(ok);
    setRequest(null);
  };
  return (
    <E9Modal
      open
      onClose={() => answer(false)}
      title="Are you sure?"
      footer={
        <>
          <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={() => answer(false)} />
          <Button
            variant={request.danger ? "danger" : "primary"}
            size="md"
            stretch="auto"
            label={request.confirmLabel}
            onClick={() => answer(true)}
          />
        </>
      }
    >
      <p className="px-5 py-4 text-body-sm-regular whitespace-pre-line text-secondary">{request.message}</p>
    </E9Modal>
  );
}
