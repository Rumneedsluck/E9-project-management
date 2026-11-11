/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* "How many floors, and which?" for one item (an item can sit on several floors, e.g. 7th and 8th). */

import { useEffect, useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { cn } from "@plane/utils";
import { splitFloors } from "./logic";
import type { TE9ScopeItem } from "./logic";
import { E9Modal } from "./modal";

const NEW_FLOOR = "__new__";
const MAX_FLOORS = 20;
const selectClass =
  "h-9 w-full rounded-lg border border-subtle bg-surface-1 px-2.5 text-body-xs-regular text-primary outline-none focus-visible:border-accent-strong";

type TProps = {
  open: boolean;
  onClose: () => void;
  item: TE9ScopeItem | null;
  /** floors of the project (from the Floors list and the sheet) */
  floorNames: string[];
  onApply: (item: TE9ScopeItem, floors: string[]) => void;
};

export function E9FloorPickerModal({ open, onClose, item, floorNames, onApply }: TProps) {
  const [picks, setPicks] = useState<string[]>([""]);

  useEffect(() => {
    if (!open || !item) return;
    const current = splitFloors(item.floor_area);
    setPicks(current.length ? current : [""]);
  }, [open, item]);

  if (!item) return null;
  const setCount = (count: number) =>
    setPicks((prev) =>
      Array.from({ length: Math.min(MAX_FLOORS, Math.max(1, count)) }, (_, index) => prev[index] ?? "")
    );
  const setPick = (index: number, value: string) =>
    setPicks((prev) => prev.map((pick, i) => (i === index ? value : pick)));
  // a typed-in floor that is not on the list yet is kept as its own choice
  const options = [...new Set([...floorNames, ...picks.filter((pick) => pick && pick !== NEW_FLOOR)])];
  const chosen = [...new Set(picks.map((pick) => pick.trim()).filter((pick) => pick && pick !== NEW_FLOOR))];

  return (
    <E9Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Floors for ${item.item_code}`}
      description="An item can sit on more than one floor. It then counts on each of them."
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-body-sm-semibold text-primary">Number of floors</span>
          <div className="flex items-center gap-1" role="group" aria-label="Number of floors">
            <button
              type="button"
              aria-label="One floor fewer"
              disabled={picks.length <= 1}
              onClick={() => setCount(picks.length - 1)}
              className="grid size-8 place-items-center rounded-lg border border-subtle text-body-md-semibold hover:bg-layer-1-hover disabled:opacity-40"
            >
              −
            </button>
            <span className="w-8 text-center text-body-md-semibold tabular-nums" aria-live="polite">
              {picks.length}
            </span>
            <button
              type="button"
              aria-label="One floor more"
              disabled={picks.length >= MAX_FLOORS}
              onClick={() => setCount(picks.length + 1)}
              className="grid size-8 place-items-center rounded-lg border border-subtle text-body-md-semibold hover:bg-layer-1-hover disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-body-sm-semibold text-primary">Which floors?</span>
          {picks.map((pick, index) => {
            const typing = pick === NEW_FLOOR || (pick !== "" && !options.includes(pick));
            return (
              <div key={index} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-body-xs-medium text-tertiary">Floor {index + 1}</span>
                {typing ? (
                  <input
                    autoFocus
                    aria-label={`Floor ${index + 1} name`}
                    className={selectClass}
                    placeholder="Type the floor name"
                    value={pick === NEW_FLOOR ? "" : pick}
                    onChange={(event) => setPick(index, event.target.value || NEW_FLOOR)}
                  />
                ) : (
                  <select
                    aria-label={`Floor ${index + 1}`}
                    className={cn(selectClass, !pick && "text-placeholder")}
                    value={pick}
                    onChange={(event) => setPick(index, event.target.value)}
                  >
                    <option value="">Choose a floor…</option>
                    {options.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={NEW_FLOOR}>+ New floor…</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-body-xs-regular text-tertiary">
          Will be saved as: <span className="font-semibold text-primary">{chosen.join(", ") || "no floor"}</span>
        </p>

        <div className="flex justify-end gap-2">
          <Button stretch="auto" variant="secondary" size="md" label="Cancel" onClick={onClose} />
          <Button
            stretch="auto"
            variant="primary"
            size="md"
            label="Save floors"
            onClick={() => {
              onApply(item, chosen);
              onClose();
            }}
          />
        </div>
      </div>
    </E9Modal>
  );
}
