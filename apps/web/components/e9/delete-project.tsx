/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { ProjectService } from "@/services/project";
import { E9HoldToConfirm } from "./hold-to-confirm";
import { refreshE9Projects } from "./hooks";
import { E9Modal } from "./tracker/modal";

const projectService = new ProjectService();

/** Delete a project for good, after typing its name. Only project / workspace admins see the button. */
export function E9DeleteProjectButton({
  workspaceSlug,
  projectId,
  projectName,
}: {
  workspaceSlug: string;
  projectId: string;
  projectName: string;
}) {
  const router = useAppRouter();
  const { deleteProject, getProjectById } = useProject();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === projectName.trim().toLowerCase();

  const remove = async () => {
    setBusy(true);
    try {
      if (getProjectById(projectId)) await deleteProject(workspaceSlug, projectId);
      else await projectService.deleteProject(workspaceSlug, projectId);
      await refreshE9Projects(workspaceSlug);
      setToast({ type: "success", title: "Project deleted", message: `${projectName} has been deleted.` });
      router.push(`/${workspaceSlug}/e9/projects`);
    } catch {
      setToast({ type: "error", title: "Couldn't delete the project", message: "Please try again." });
      setBusy(false);
    }
  };

  return (
    <>
      <Button stretch="auto" variant="danger-outline" size="md" label="Delete" onClick={() => setOpen(true)} />
      <E9Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setTyped("");
        }}
        title={`Delete ${projectName}?`}
        description="The project, its tracker, BOQ, bills, photos and history are removed for everyone. This cannot be undone."
        footer={
          <>
            <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={() => setOpen(false)} />
            {/* type the name, then hold the button: two deliberate steps for something that cannot be undone */}
            <E9HoldToConfirm
              label={busy ? "Deleting…" : "Hold to delete for good"}
              doneLabel="Deleted"
              holdTime={1500}
              disabled={!matches || busy}
              onConfirm={() => void remove()}
            />
          </>
        }
      >
        <label className="flex flex-col gap-1.5 px-5 py-4">
          <span className="text-body-sm-regular text-secondary">
            To confirm, type the project name: <span className="font-semibold text-primary">{projectName}</span>
          </span>
          <input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the box was just opened to type this name
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="h-10 rounded-lg border border-subtle bg-surface-1 px-3 text-body-sm-regular text-primary outline-none focus:border-[var(--border-color-danger-strong)]"
          />
        </label>
      </E9Modal>
    </>
  );
}
