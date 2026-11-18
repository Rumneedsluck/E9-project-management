/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * A big number with a small label under it, using NumberFlow so the digits roll when the value
 * changes (from Bklit UI's ChartStatFlow; only the `cn` import was changed to this project's).
 */

import NumberFlow from "@number-flow/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "@plane/utils";

/** Subset of `Intl.NumberFormatOptions` supported by NumberFlow */
export interface ChartStatFlowFormat {
  notation?: "standard" | "compact";
  compactDisplay?: "short" | "long";
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  minimumIntegerDigits?: number;
  minimumSignificantDigits?: number;
  maximumSignificantDigits?: number;
  style?: "decimal" | "percent" | "currency";
  currency?: string;
  currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
  unit?: string;
  unitDisplay?: "short" | "long" | "narrow";
}

export const defaultChartStatFlowFormat: ChartStatFlowFormat = {
  notation: "standard",
  maximumFractionDigits: 0,
};

function formatStatValue(value: number, formatOptions: ChartStatFlowFormat, prefix?: string, suffix?: string): string {
  const formatted = new Intl.NumberFormat(undefined, formatOptions).format(value);
  return `${prefix ?? ""}${formatted}${suffix ?? ""}`;
}

export function useNumberFlowElementReady(): boolean {
  const [ready, setReady] = useState(
    () => typeof customElements !== "undefined" && Boolean(customElements.get("number-flow-react"))
  );

  useEffect(() => {
    if (ready) {
      return;
    }
    let cancelled = false;
    void customElements.whenDefined("number-flow-react").then(() => {
      if (cancelled) return undefined;
      setReady(true);
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}

export interface ChartStatFlowProps {
  value: number;
  label: string;
  formatOptions?: ChartStatFlowFormat;
  prefix?: string;
  suffix?: string;
  valueClassName?: string;
  labelClassName?: string;
  icon?: ReactNode;
}

/** Shared value + label stack using NumberFlow. The parent provides alignment and sizing. */
export function ChartStatFlow({
  value,
  label,
  formatOptions = defaultChartStatFlowFormat,
  prefix,
  suffix,
  valueClassName = "text-2xl font-bold",
  labelClassName = "text-xs",
  icon,
}: ChartStatFlowProps) {
  const numberFlowReady = useNumberFlowElementReady();
  const staticValue = useMemo(
    () => formatStatValue(value, formatOptions, prefix, suffix),
    [value, formatOptions, prefix, suffix]
  );

  return (
    <>
      {icon ? (
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-layer-1">{icon}</div>
      ) : null}
      <span className={cn("text-primary tabular-nums", valueClassName)}>
        {numberFlowReady ? (
          <NumberFlow format={formatOptions} isolate prefix={prefix} suffix={suffix} value={value} willChange />
        ) : (
          staticValue
        )}
      </span>
      <span className={cn("mt-0.5 text-tertiary", labelClassName)}>{label}</span>
    </>
  );
}

ChartStatFlow.displayName = "ChartStatFlow";
