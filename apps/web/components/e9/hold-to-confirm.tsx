/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * "Hold to delete" button (React Bits HoldButton, in the E9 colours). Deleting needs a deliberate press-and-hold,
 * so a stray click can never remove something. Works with mouse, touch and the keyboard (hold Space or Enter).
 */

import type { ReactNode } from "react";
import HoldButton from "./vendor/hold-button";

type Props = {
  label?: ReactNode;
  doneLabel?: ReactNode;
  disabled?: boolean;
  /** how long the press must last, in milliseconds */
  holdTime?: number;
  onConfirm: () => void;
};

/** Pause after the fill completes so the "Deleted" word can be seen before the box closes. */
export const HOLD_DONE_PAUSE_MS = 450;

export function E9HoldToConfirm({
  label = "Hold to delete",
  doneLabel = "Deleted",
  disabled = false,
  holdTime = 1200,
  onConfirm,
}: Props) {
  return (
    <HoldButton
      doneLabel={doneLabel}
      backgroundColor="var(--e9-band)"
      textColor="var(--e9-band-text)"
      fillColor="var(--brand-default)"
      fillTextColor="#ffffff"
      size="md"
      radius={8}
      holdTime={holdTime}
      releaseTime={200}
      resetAfter={0}
      disabled={disabled}
      onHold={onConfirm}
    >
      {label}
    </HoldButton>
  );
}
