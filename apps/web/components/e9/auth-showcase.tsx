/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { E9_BRAND, E9Logo, E9Text } from "./brand";
import { E9StageIcon } from "./icons";
import type { TE9StageIconKey } from "./icons";
import LightTunnel from "./vendor/light-tunnel";

const JOURNEY: { label: string; icon: TE9StageIconKey }[] = [
  { label: "Site audit", icon: "site_audit" },
  { label: "Pre-press", icon: "pre_press" },
  { label: "Production", icon: "production" },
  { label: "Delivery", icon: "delivery" },
  { label: "Installation", icon: "installation" },
  { label: "Sign-off", icon: "sign_off" },
];

/** A faint drawing of a wall elevation with its measurements, drawn line by line once (no graphics card needed). */
function Blueprint() {
  const line = (i: number) => ({ pathLength: 1, className: "e9-draw", style: { "--i": i } as CSSProperties });
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 300"
      fill="none"
      stroke="#ffffff"
      strokeWidth={1}
      strokeLinecap="round"
      className="pointer-events-none absolute -right-14 bottom-[7%] w-[66%] opacity-[0.18]"
    >
      <rect x="40" y="40" width="300" height="190" {...line(0)} />
      <rect x="70" y="70" width="110" height="80" {...line(1)} />
      <rect x="210" y="70" width="100" height="130" {...line(2)} />
      <path d="M70 175h110M70 190h70" {...line(3)} />
      <path d="M40 255h300M40 250v10M340 250v10" stroke="#C9A15A" {...line(4)} />
      <path d="M365 40v190M360 40h10M360 230h10" stroke="#C9A15A" {...line(5)} />
      <path d="M210 70l100 130M310 70 210 200" strokeDasharray="3 5" {...line(6)} />
      <circle cx="125" cy="110" r="18" stroke="#ff3b43" {...line(7)} />
    </svg>
  );
}

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
      <Blueprint />
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

      <ol className="relative flex flex-col gap-3" aria-label="Project journey">
        {/* the thread that joins the steps */}
        <span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-px bg-white/15" />
        {JOURNEY.map((step, index) => (
          <li
            key={step.label}
            className="e9-row-in relative flex items-center gap-3 text-body-sm-medium"
            style={{ "--i": index + 4 } as CSSProperties}
          >
            <span
              className={
                index < 3
                  ? "grid size-7 place-items-center rounded-full bg-[var(--brand-default)] text-white"
                  : "grid size-7 place-items-center rounded-full border border-white/25 bg-[#141416] text-white/60"
              }
            >
              <E9StageIcon stage={step.icon} className="size-3.5" />
            </span>
            <span className={index < 3 ? "text-white" : "text-white/55"}>{step.label}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
