/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/*
 * Project access codes (React Bits CodeSlots). A project with a code shows the code box to members and guests
 * before anything else; admins set, change or remove the code on the project's Info page.
 */

import { useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { e9ProjectService } from "@/services/e9/project.service";
import { e9Confirm } from "./confirm";
import { E9Panel } from "./ui";
import CodeSlots from "./vendor/code-slots";

const CODE_LENGTH = 6;

/** The same colours in light and dark: the E9 theme does the switching. */
const SLOT_LOOK = {
  accentColor: "var(--e9-ink)",
  inkColor: "var(--e9-ink)",
  slotColor: "var(--e9-hover)",
  digitColor: "var(--e9-paper)",
  dangerColor: "#da1e26",
} as const;

const messageOf = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const value = (error as { error?: unknown; code?: unknown }).error ?? (error as { code?: unknown }).code;
    if (typeof value === "string") return value;
  }
  return fallback;
};

/** Shown instead of the project while it is locked for this person. */
export function E9CodeGate({
  workspaceSlug,
  projectId,
  projectName,
  onUnlocked,
}: {
  workspaceSlug: string;
  projectId: string;
  projectName: string;
  onUnlocked: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const [message, setMessage] = useState("");

  const verify = async (code: string) => {
    try {
      await e9ProjectService.unlockProject(workspaceSlug, projectId, code);
      setStatus("success");
      setMessage("");
      window.setTimeout(onUnlocked, 800);
    } catch (error) {
      setStatus("error");
      const left = (error as { tries_left?: number } | undefined)?.tries_left;
      setMessage(
        `${messageOf(error, "That code is not right.")}${typeof left === "number" && left > 0 ? ` ${left} ${left === 1 ? "try" : "tries"} left.` : ""}`
      );
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-16 text-center">
      <span className="e9-eyebrow">Locked project</span>
      <h2 className="e9-display text-[34px] leading-tight text-primary">{projectName}</h2>
      <p className="text-body-sm-regular text-secondary">
        Type the {CODE_LENGTH}-digit code to open this project. Ask the person in charge if you don&apos;t have it.
      </p>
      <CodeSlots
        length={CODE_LENGTH}
        status={status}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the code box is the only thing on this screen
        autoFocus
        mask
        slotSize={48}
        gap={8}
        radius={10}
        ariaLabel={`Access code for ${projectName}`}
        onChange={(code) => {
          setStatus("idle");
          if (code) setMessage("");
        }}
        onComplete={(code) => void verify(code)}
        {...SLOT_LOOK}
      />
      <p role="status" className="min-h-5 text-body-sm-medium text-danger-primary">
        {message}
      </p>
    </div>
  );
}

const randomCode = () => {
  const bytes = new Uint32Array(1);
  window.crypto.getRandomValues(bytes);
  return String(bytes[0] % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, "0");
};

/** Admins only (the page shows it to people who can edit the project). */
export function E9AccessCodePanel({
  workspaceSlug,
  projectId,
  hasCode,
  onChanged,
}: {
  workspaceSlug: string;
  projectId: string;
  hasCode: boolean;
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = code.length === CODE_LENGTH;

  const save = async (next: string) => {
    setBusy(true);
    try {
      await e9ProjectService.setAccessCode(workspaceSlug, projectId, next);
      setCode("");
      onChanged();
      setToast({
        type: "success",
        title: next ? "Access code saved" : "Access code removed",
        message: next
          ? "Members and guests now need it to open this project. It cannot be shown again, so write it down."
          : "Anyone on the project can open it again.",
      });
    } catch (error) {
      setToast({ type: "error", title: "Couldn't save the code", message: messageOf(error, "Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !(await e9Confirm("Remove the access code?\nEveryone on the project can open it without a code.", {
        confirmLabel: "Remove",
      }))
    )
      return;
    await save("");
  };

  return (
    <E9Panel title="Access code">
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="max-w-prose text-body-sm-regular text-secondary">
          {hasCode
            ? "A code is set. Members and guests type it to open this project; admins never need it. Enter a new one to change it."
            : "No code yet, so everyone on the project can open it. Set a 6-digit code and members and guests have to type it first. Admins never need it."}
        </p>
        <CodeSlots
          length={CODE_LENGTH}
          value={code}
          onChange={setCode}
          slotSize={44}
          gap={8}
          radius={10}
          ariaLabel="New access code"
          {...SLOT_LOOK}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            label={hasCode ? "Change code" : "Save code"}
            disabled={!ready || busy}
            loading={busy}
            onClick={() => void save(code)}
          />
          <Button
            variant="secondary"
            size="md"
            stretch="auto"
            label="Suggest a random code"
            disabled={busy}
            onClick={() => setCode(randomCode())}
          />
          {hasCode && (
            <Button
              variant="danger-outline"
              size="md"
              stretch="auto"
              label="Remove code"
              disabled={busy}
              onClick={() => void remove()}
            />
          )}
        </div>
      </div>
    </E9Panel>
  );
}
