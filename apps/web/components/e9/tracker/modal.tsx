/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseOutline } from "@makeplane/propel/icons";
import { cn } from "@plane/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
};

/** A simple pop-up panel. Closes with Esc, the ✕ button or a click outside. */
export function E9Modal({ open, onClose, title, description, children, footer, size = "md" }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-backdrop p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-subtle bg-surface-1 shadow-raised-300 outline-none sm:rounded-2xl",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-3xl",
          size === "xl" && "sm:max-w-5xl"
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-subtle px-5 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="text-body-md-semibold text-primary">
              {title}
            </h2>
            {description && <p className="text-body-xs-regular text-tertiary">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-tertiary hover:bg-layer-1-hover hover:text-primary"
          >
            <CloseOutline className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-subtle px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
