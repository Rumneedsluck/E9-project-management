/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * A swarm of light dots that follows the pointer behind the Home greeting (React Bits SwarmCursor).
 * It only runs on a computer with a real graphics card, a mouse, and no "reduce motion" setting;
 * everywhere else the page is simply plain. It never changes anything you click.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import SwarmCursor from "./vendor/swarm-cursor";

/** True when this browser can run the swarm well (not software-drawn, has a mouse, motion not reduced). */
const useSwarmAllowed = () => {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      setOk(!/swiftshader|llvmpipe|software/i.test(name));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // no WebGL: plain page
    }
  }, []);
  return ok;
};

/** Follows the site's light / dark theme. */
const useDarkTheme = () => {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark((root.getAttribute("data-theme") ?? "").includes("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
};

export function E9SwarmBackdrop({ children, className }: { children: ReactNode; className?: string }) {
  const allowed = useSwarmAllowed();
  const dark = useDarkTheme();
  if (!allowed) return <div className={className}>{children}</div>;
  return (
    <SwarmCursor
      className={className}
      count={420}
      size={2.2}
      spread={110}
      swirl={0.6}
      lightMode={!dark}
      color={dark ? "#ffffff" : "#2a2623"}
      accentColor="#da1e26"
      clickEffect="pulse"
      idle="roam"
      // links and buttons inside keep working normally; the swarm just flows around them
      targets="a, button"
    >
      {children}
    </SwarmCursor>
  );
}
