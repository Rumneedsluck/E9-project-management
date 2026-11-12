/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { E9_BRAND, E9Logo, E9Text } from "./brand";
import LightTunnel from "./vendor/light-tunnel";

const JOURNEY = ["Site audit", "Pre-press", "Production", "Delivery", "Installation", "Sign-off"];

/** Left-hand brand panel on the sign-in and sign-up screens (hidden on phones). */
/** True on a computer with a real graphics card (software drawing is slow and looks wrong for the light tunnel). */
const useGraphicsCard = () => {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return;
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      setOk(!/swiftshader|llvmpipe|software/i.test(name));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // no WebGL: the panel stays plain dark
    }
  }, []);
  return ok;
};

export function E9AuthShowcase() {
  const hasGraphicsCard = useGraphicsCard();
  return (
    <aside className="relative hidden w-[44%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden bg-[#141416] p-12 text-white lg:flex">
      {/* animated light tunnel: white fibres with red pulses (follows the pointer, click sends a ring of light) */}
      {hasGraphicsCard && (
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70">
          <LightTunnel
            cableColor="#ffffff"
            pulseColor="#ff3b43"
            cableCount={48}
            pulseDensity={0.4}
            brightness={0.8}
            fadeNear={0.7}
          />
        </div>
      )}
      {/* soft brand glow */}
      <div
        aria-hidden
        className="e9-glow pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-[var(--brand-default)] opacity-10 blur-[160px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-[var(--brand-default)] via-[var(--brand-700)] to-transparent"
      />

      <span className="e9-logo-in relative">
        <E9Logo inverse withTagline large />
      </span>

      <div className="e9-enter relative flex flex-col gap-6">
        <span className="text-body-xs-semibold tracking-[0.2em] text-[#C9A15A] uppercase">
          <E9Text>{E9_BRAND.productName}</E9Text>
        </span>
        <h1 className="e9-display max-w-md [font-size:3.1rem] leading-[1.05]">{E9_BRAND.loginHeadline}</h1>
        <p className="max-w-md text-body-md-regular text-white/65">{E9_BRAND.loginDescription}</p>
      </div>

      <ol className="e9-enter relative flex flex-col gap-3" aria-label="Project journey">
        {JOURNEY.map((step, index) => (
          <li key={step} className="flex items-center gap-3 text-body-sm-medium">
            <span
              className={
                index < 3
                  ? "grid size-6 place-items-center rounded-full bg-[var(--brand-default)] text-body-2xs-semibold"
                  : "grid size-6 place-items-center rounded-full border border-white/25 text-body-2xs-semibold text-white/60"
              }
            >
              {index + 1}
            </span>
            <span className={index < 3 ? "text-white" : "text-white/55"}>{step}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
