/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * E9 motion: crisp, short, editorial.
 * - <Reveal>      fades + slides a block up the first time it scrolls into view
 * - <RevealText>  headline words slide up from behind a mask, one after another
 * - <CountUp>     numbers count up when they come into view
 * Everything shows instantly when the device asks for reduced motion.
 */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@plane/utils";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** true once the element has been on screen (stays true). */
export function useInView<T extends Element>(margin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold: 0.08 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, margin]);
  return { ref, inView };
}

type TRevealProps = {
  children: ReactNode;
  className?: string;
  /** seconds; use small steps (0.05) for a stagger */
  delay?: number;
  as?: ElementType;
};

export function Reveal({ children, className, delay = 0, as: Tag = "div" }: TRevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref}
      className={cn("e9-reveal", inView && "is-in", className)}
      style={{ "--e9-delay": `${delay}s` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Headline: each word rises from behind a mask. */
export function RevealText({ text, className }: { text: string; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>("0px");
  const words = text.split(" ");
  return (
    <span ref={ref} className={cn("e9-reveal-text", inView && "is-in", className)} aria-label={text}>
      {words.map((word, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- the same word can appear twice
        <span key={`${word}-${index}`} aria-hidden className="e9-word">
          <span style={{ "--e9-delay": `${index * 0.045}s` } as CSSProperties}>{word}</span>
        </span>
      ))}
    </span>
  );
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

/** Counts from 0 to `value` once it is visible. */
export function CountUp({
  value,
  duration = 900,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>("0px");
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion() || value === 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * easeOutExpo(progress)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration]);
  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("en-IN")}
    </span>
  );
}
