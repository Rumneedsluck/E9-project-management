/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { E9_BRAND, E9LogoMark } from "./brand";

const SEEN_KEY = "e9-intro-seen";

const alreadySeen = () => {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Opening animation: logo pops in, a red line sweeps under the name,
 * then the black curtain slides up. Shown once per browser tab; click to skip.
 */
export function E9Intro() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (alreadySeen() || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // private window: the intro may play again, that's fine
    }
    setShow(true);
    const timer = window.setTimeout(() => setShow(false), 2400);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      aria-label="Skip intro"
      onClick={() => setShow(false)}
      className="e9-intro fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-6 bg-[#0B0B0B] text-white"
    >
      <E9LogoMark className="e9-intro-mark size-24 sm:size-28" />
      <span className="flex flex-col items-center gap-2">
        <span className="text-body-sm-semibold tracking-[0.4em] uppercase">{E9_BRAND.name}</span>
        <span className="e9-intro-line block h-0.5 w-40 bg-[#DA1E26]" />
        <span className="text-body-2xs-medium tracking-[0.3em] text-white/50 uppercase">Operations</span>
      </span>
    </button>
  );
}
