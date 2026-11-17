/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * "How far the work has got": the six tracker stages in order, each with its icon, a bar for how many
 * items have finished that stage, and the count. Read top to bottom it shows where the work is piling up.
 */

import { E9MeterList } from "../chart-kit";
import { E9Glyph, E9IconTile, E9StageIcon } from "../icons";
import { E9Panel } from "../ui";
import { E9_TRACKER_STAGES } from "./constants";
import type { TStageTargetRow } from "./logic";

export function E9StageProgressPanel({ rows }: { rows: TStageTargetRow[] }) {
  const total = Math.max(1, ...rows.map((row) => row.done + row.pending));
  return (
    <E9Panel
      tone="magenta"
      icon={() => <E9Glyph name="check" className="size-[18px]" />}
      title="How far the work has got"
      subtitle="Items that have finished each stage, in working order"
      meta={`${total} items`}
    >
      <E9MeterList
        className="py-2"
        label="Items that have finished each stage"
        valueHead="items done"
        max={total}
        rows={rows.map((row) => {
          const stage = E9_TRACKER_STAGES.find((entry) => entry.key === row.key);
          const color = stage?.color ?? "var(--e9-ink)";
          const percent = Math.round((row.done / total) * 100);
          return {
            key: row.key,
            label: row.label.replace(/^\d+ · /, ""),
            value: row.done,
            figure: `${row.done} · ${percent}%`,
            color,
            icon: (
              <E9IconTile color={color} size="sm">
                {(iconClass) => <E9StageIcon stage={row.key} className={iconClass} />}
              </E9IconTile>
            ),
          };
        })}
      />
    </E9Panel>
  );
}
