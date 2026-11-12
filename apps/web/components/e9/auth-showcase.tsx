/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { E9_BRAND, E9Logo } from "./brand";

const JOURNEY = ["Site audit", "Pre-press", "Production", "Delivery", "Installation", "Sign-off"];

/** Left-hand brand panel on the sign-in and sign-up screens (hidden on phones). */
export function E9AuthShowcase() {
  return (
    <aside className="relative hidden w-[44%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden bg-[#141416] p-12 text-white lg:flex">
      {/* soft brand glow */}
      <div
        aria-hidden
        className="e9-glow pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-[var(--brand-default)] opacity-10 blur-[160px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-[var(--brand-default)] via-[var(--brand-700)] to-transparent"
      />

      <span className="e9-logo-in">
        <E9Logo inverse withTagline large />
      </span>

      <div className="e9-enter relative flex flex-col gap-6">
        <span className="text-body-xs-semibold tracking-[0.2em] text-[#C9A15A] uppercase">{E9_BRAND.productName}</span>
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
