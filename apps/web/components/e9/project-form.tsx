/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { ArrowLeftOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import type { EUserProjectRoles } from "@plane/types";
import { cn, getFileURL, projectIdentifierSanitizer } from "@plane/utils";
import { Avatar } from "@makeplane/propel/components/avatar";
// components
import { getProjectFormValues } from "@/components/projects/create/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { e9ProjectService } from "@/services/e9/project.service";
// local
import { E9_PRIORITIES, E9_STATUSES } from "./constants";
import { E9_SCOPES, E9_TRACKER_STAGES } from "./tracker/constants";
import { ordinal } from "./tracker/setup-panels";
import { validateE9Form } from "./form-validation";
import type { TE9FormErrors, TE9FormValues } from "./form-validation";
import { getInitials, suggestIdentifier } from "./helpers";
import { refreshE9Projects } from "./hooks";
import type { TE9Project, TE9ProjectStatus } from "./types";
import { E9PageBody, E9PageHeader, E9Panel } from "./ui";

const fromProject = (project: TE9Project | undefined, currentUserId: string | undefined): TE9FormValues => ({
  name: project?.name ?? "",
  identifier: project?.identifier ?? "",
  description: project?.description ?? "",
  client_name: project?.e9.client_name ?? "",
  site_address: project?.e9.site_address ?? "",
  city: project?.e9.city ?? "",
  work_order_number: project?.e9.work_order_number ?? "",
  status: project?.e9.status ?? "awarded",
  priority: project?.e9.priority ?? "medium",
  start_date: project?.e9.start_date ?? "",
  deadline: project?.e9.deadline ?? "",
  client_contact: project?.e9.client_contact ?? "",
  site_contact: project?.e9.site_contact ?? "",
  work_order_date: project?.e9.work_order_date ?? "",
  site_timings: project?.e9.site_timings ?? "",
  target_site_audit: project?.e9.target_site_audit ?? "",
  target_pre_press: project?.e9.target_pre_press ?? "",
  target_material: project?.e9.target_material ?? "",
  target_delivered: project?.e9.target_delivered ?? "",
  target_installation: project?.e9.target_installation ?? "",
  target_sign_off: project?.e9.target_sign_off ?? "",
  project_lead: project?.project_lead ?? currentUserId ?? "",
  team: project ? project.member_ids.filter((id) => id !== project.project_lead) : [],
});

/** Turn an API error into a sentence a person can act on. */
const describeApiError = (error: unknown): string => {
  const data = (error as { data?: Record<string, unknown> })?.data ?? (error as Record<string, unknown>) ?? {};
  const text = JSON.stringify(data);
  if (text.includes("PROJECT_NAME_ALREADY_EXIST")) return "Another project already uses this name.";
  if (text.includes("PROJECT_IDENTIFIER_ALREADY_EXIST")) return "Another project already uses this code.";
  if (text.includes("PROJECT_NAME_CANNOT_CONTAIN_SPECIAL_CHARACTERS"))
    return "The name can only contain letters, numbers and spaces.";
  if (typeof data.error === "string") return data.error;
  return "Something went wrong while saving. Please try again.";
};

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-body-xs-semibold text-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-body-xs-regular text-danger-primary">
          {error}
        </p>
      ) : (
        hint && <p className="text-body-xs-regular text-placeholder">{hint}</p>
      )}
    </div>
  );
}

const inputClass = (hasError?: boolean) =>
  cn(
    "h-10 w-full rounded-lg border bg-surface-1 px-3 text-body-sm-regular text-primary outline-none placeholder:text-placeholder focus-visible:border-accent-strong focus-visible:ring-2 focus-visible:ring-[var(--background-color-accent-subtle)]",
    hasError ? "border-danger-strong" : "border-subtle"
  );

type Props = {
  workspaceSlug: string;
  /** Existing project when editing; leave empty to create a new one */
  project?: TE9Project;
};

export const E9ProjectForm = observer(function E9ProjectForm({ workspaceSlug, project }: Props) {
  const isEdit = !!project;
  const router = useAppRouter();
  const { data: currentUser } = useUser();
  const { createProject, updateProject } = useProject();
  const {
    getUserDetails,
    workspace: { getWorkspaceMemberIds, getWorkspaceMemberDetails },
    project: { bulkAddMembersToProject, fetchProjectMembers, removeMemberFromProject },
  } = useMember();

  const [values, setValues] = useState<TE9FormValues>(() => fromProject(project, currentUser?.id));
  const [errors, setErrors] = useState<TE9FormErrors>({});
  const [identifierTouched, setIdentifierTouched] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  // New projects only: which scopes this job has, and how many floors
  const [chosenScopes, setChosenScopes] = useState<string[]>(() => E9_SCOPES.map((scope) => scope.key));
  const [floorCount, setFloorCount] = useState("");

  const memberIds = getWorkspaceMemberIds(workspaceSlug) ?? [];
  const memberName = (userId: string) => {
    const user = getUserDetails(userId);
    return user ? `${user.first_name} ${user.last_name}`.trim() || user.display_name : "Unknown";
  };
  const teamOptions = memberIds.filter((id) => id !== values.project_lead);

  const set = <K extends keyof TE9FormValues>(key: K, value: TE9FormValues[K]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Suggest a project code from the name until the person edits the code themselves
      if (key === "name" && !identifierTouched) next.identifier = suggestIdentifier(String(value));
      return next;
    });
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const toggleTeamMember = (userId: string) =>
    set("team", values.team.includes(userId) ? values.team.filter((id) => id !== userId) : [...values.team, userId]);

  /** Make Plane's project membership match the chosen coordinator + team. */
  const syncMembers = async (projectId: string, existing: string[]) => {
    const wanted = new Set([values.project_lead, ...values.team].filter(Boolean));
    const toAdd = [...wanted].filter((id) => !existing.includes(id));
    if (toAdd.length > 0) {
      await bulkAddMembersToProject(workspaceSlug, projectId, {
        members: toAdd.map((memberId) => ({
          member_id: memberId,
          // a project role must match the person's workspace role (admin / member / guest)
          role: (getWorkspaceMemberDetails(memberId)?.role ?? 15) as EUserProjectRoles,
        })),
      });
    }
    if (!isEdit) return;
    const toRemove = existing.filter((id) => !wanted.has(id) && id !== currentUser?.id);
    if (toRemove.length > 0) {
      await fetchProjectMembers(workspaceSlug, projectId);
      await Promise.all(toRemove.map((memberId) => removeMemberFromProject(workspaceSlug, projectId, memberId)));
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateE9Form(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    const profile = {
      client_name: values.client_name.trim(),
      site_address: values.site_address.trim(),
      city: values.city.trim(),
      work_order_number: values.work_order_number.trim(),
      status: values.status,
      priority: values.priority,
      start_date: values.start_date || null,
      deadline: values.deadline || null,
      client_contact: values.client_contact.trim(),
      site_contact: values.site_contact.trim(),
      work_order_date: values.work_order_date || null,
      site_timings: values.site_timings.trim(),
      target_site_audit: values.target_site_audit || null,
      target_pre_press: values.target_pre_press || null,
      target_material: values.target_material || null,
      target_delivered: values.target_delivered || null,
      target_installation: values.target_installation || null,
      target_sign_off: values.target_sign_off || null,
    };
    try {
      let projectId = project?.id;
      if (!project) {
        // 1. Create the project with Plane's own logic (default stages, admin membership, activity log)
        const created = await createProject(workspaceSlug, {
          name: values.name.trim(),
          identifier: values.identifier.toUpperCase(),
          description: values.description.trim(),
          project_lead: values.project_lead || null,
          network: 2,
          logo_props: getProjectFormValues().logo_props,
        });
        projectId = created.id;
        // 2. Add the E9 details, 3. add the team
        await e9ProjectService.updateProfile(workspaceSlug, created.id, profile);
        await syncMembers(created.id, [currentUser?.id, values.project_lead].filter(Boolean) as string[]);
        // 4. Switch on only the scopes this job has
        const scopes = await e9ProjectService.listScopes(workspaceSlug, created.id);
        await e9ProjectService.saveScopes(
          workspaceSlug,
          created.id,
          scopes.map((scope) => ({ ...scope, enabled: chosenScopes.includes(scope.key) }))
        );
        // 5. Add the floors (Ground Floor + 1st … Nth)
        const upTo = Math.min(Number(floorCount) || 0, 99);
        if (upTo > 0)
          await e9ProjectService.addFloors(workspaceSlug, created.id, [
            "Ground Floor",
            ...Array.from({ length: upTo }, (_, index) => `${ordinal(index + 1)} Floor`),
          ]);
      } else {
        const changes: Record<string, string | null> = {};
        if (values.name.trim() !== project.name) changes.name = values.name.trim();
        if (values.identifier.toUpperCase() !== project.identifier)
          changes.identifier = values.identifier.toUpperCase();
        if (values.description.trim() !== project.description) changes.description = values.description.trim();
        if ((values.project_lead || null) !== project.project_lead) changes.project_lead = values.project_lead || null;
        if (Object.keys(changes).length > 0) await updateProject(workspaceSlug, project.id, changes);
        await e9ProjectService.updateProfile(workspaceSlug, project.id, profile);
        await syncMembers(project.id, project.member_ids);
      }

      await refreshE9Projects(workspaceSlug, projectId);
      setToast({
        type: "success",
        title: isEdit ? "Project updated" : "Project created",
        message: `${values.name.trim()} has been saved.`,
      });
      router.push(`/${workspaceSlug}/e9/projects/${projectId}`);
    } catch (error) {
      setToast({ type: "error", title: "Couldn't save the project", message: describeApiError(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const backHref = project ? `/${workspaceSlug}/e9/projects/${project.id}` : `/${workspaceSlug}/e9/projects`;

  return (
    <E9PageBody>
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-body-xs-medium text-tertiary hover:text-primary"
      >
        <ArrowLeftOutline className="size-3.5" />
        {project ? "Back to project" : "All projects"}
      </Link>
      <E9PageHeader
        eyebrow={isEdit ? project.identifier : "New project"}
        title={isEdit ? "Edit project" : "Create a project"}
        description={
          isEdit
            ? "Update the client, stage, dates or team. Changes are saved for everyone."
            : "Add an awarded job. You can change any of this later."
        }
      />

      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <E9Panel title="Project & client">
            <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-[1fr_9rem]">
              <Field label="Project name" htmlFor="e9-name" error={errors.name}>
                <input
                  id="e9-name"
                  className={inputClass(!!errors.name)}
                  value={values.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Northwind Tech Park Fitout"
                />
              </Field>
              <Field label="Code" htmlFor="e9-identifier" error={errors.identifier}>
                <input
                  id="e9-identifier"
                  className={cn(inputClass(!!errors.identifier), "uppercase")}
                  value={values.identifier}
                  onChange={(e) => {
                    setIdentifierTouched(true);
                    set("identifier", projectIdentifierSanitizer(e.target.value).toUpperCase().slice(0, 10));
                  }}
                  placeholder="NWT"
                />
              </Field>
              <Field label="Client" htmlFor="e9-client" className="sm:col-span-2">
                <input
                  id="e9-client"
                  className={inputClass()}
                  value={values.client_name}
                  onChange={(e) => set("client_name", e.target.value)}
                  placeholder="Company name"
                />
              </Field>
              <Field label="Site address" htmlFor="e9-site" className="sm:col-span-2">
                <input
                  id="e9-site"
                  className={inputClass()}
                  value={values.site_address}
                  onChange={(e) => set("site_address", e.target.value)}
                  placeholder="Building, floor, street"
                />
              </Field>
              <Field label="City" htmlFor="e9-city">
                <input
                  id="e9-city"
                  className={inputClass()}
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder="Bengaluru"
                />
              </Field>
              <Field label="Work order / PO no." htmlFor="e9-wo">
                <input
                  id="e9-wo"
                  className={inputClass()}
                  value={values.work_order_number}
                  onChange={(e) => set("work_order_number", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Work order date" htmlFor="e9-wo-date">
                <input
                  id="e9-wo-date"
                  type="date"
                  className={inputClass()}
                  value={values.work_order_date}
                  onChange={(e) => set("work_order_date", e.target.value)}
                />
              </Field>
              <Field label="Client contact (name & phone)" htmlFor="e9-client-contact" className="sm:col-span-2">
                <input
                  id="e9-client-contact"
                  className={inputClass()}
                  value={values.client_contact}
                  onChange={(e) => set("client_contact", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Site / facility contact (name & phone)" htmlFor="e9-site-contact" className="sm:col-span-2">
                <input
                  id="e9-site-contact"
                  className={inputClass()}
                  value={values.site_contact}
                  onChange={(e) => set("site_contact", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Site timings / restrictions" htmlFor="e9-timings" className="sm:col-span-2">
                <input
                  id="e9-timings"
                  className={inputClass()}
                  value={values.site_timings}
                  onChange={(e) => set("site_timings", e.target.value)}
                  placeholder="e.g. Work only after 7 pm, weekends allowed"
                />
              </Field>
              <Field label="Scope & notes" htmlFor="e9-notes" className="sm:col-span-2">
                <textarea
                  id="e9-notes"
                  rows={4}
                  className={cn(inputClass(), "h-auto py-2.5")}
                  value={values.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What we are delivering: wall graphics, glass films, signages…"
                />
              </Field>
            </div>
          </E9Panel>

          <E9Panel title="Team">
            <div className="flex flex-col gap-5 p-5">
              <Field
                label="Project coordinator"
                htmlFor="e9-lead"
                hint="Owns the project and can edit it. Usually the person who talks to the client."
              >
                <select
                  id="e9-lead"
                  className={inputClass()}
                  value={values.project_lead}
                  onChange={(e) => {
                    const lead = e.target.value;
                    setValues((prev) => ({ ...prev, project_lead: lead, team: prev.team.filter((id) => id !== lead) }));
                  }}
                >
                  <option value="">No coordinator</option>
                  {memberIds.map((id) => (
                    <option key={id} value={id}>
                      {memberName(id)}
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-body-xs-semibold text-secondary">Team members</legend>
                {teamOptions.length === 0 ? (
                  <p className="text-body-xs-regular text-placeholder">
                    Invite people to the workspace first (Settings › Members).
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teamOptions.map((id) => {
                      const user = getUserDetails(id);
                      const checked = values.team.includes(id);
                      return (
                        <label
                          key={id}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-body-sm-medium transition-colors select-none",
                            checked
                              ? "border-accent-strong bg-accent-subtle text-primary"
                              : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1-hover"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggleTeamMember(id)}
                          />
                          <Avatar
                            size="sm"
                            src={user?.avatar_url ? getFileURL(user.avatar_url) : undefined}
                            alt=""
                            fallback={getInitials(user?.first_name, user?.last_name, user?.display_name)}
                          />
                          {memberName(id)}
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            </div>
          </E9Panel>
        </div>

        <div className="flex flex-col gap-4">
          <E9Panel title="Status & schedule">
            <div className="flex flex-col gap-5 p-5">
              <Field
                label="Stage"
                htmlFor="e9-status"
                hint={E9_STATUSES.find((status) => status.key === values.status)?.hint}
              >
                <select
                  id="e9-status"
                  className={inputClass()}
                  value={values.status}
                  onChange={(e) => set("status", e.target.value as TE9ProjectStatus)}
                >
                  {E9_STATUSES.map((status) => (
                    <option key={status.key} value={status.key}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-body-xs-semibold text-secondary">Priority</legend>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-subtle bg-layer-1 p-1">
                  {E9_PRIORITIES.map((priority) => (
                    <label
                      key={priority.key}
                      className={cn(
                        "cursor-pointer rounded-md px-2 py-1.5 text-center text-body-xs-semibold transition-colors",
                        values.priority === priority.key
                          ? "bg-surface-1 text-primary shadow-raised-100"
                          : "text-tertiary hover:text-secondary"
                      )}
                    >
                      <input
                        type="radio"
                        name="e9-priority"
                        className="sr-only"
                        value={priority.key}
                        checked={values.priority === priority.key}
                        onChange={() => set("priority", priority.key)}
                      />
                      {priority.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Start date" htmlFor="e9-start">
                <input
                  id="e9-start"
                  type="date"
                  className={inputClass()}
                  value={values.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                />
              </Field>
              <Field label="Handover deadline" htmlFor="e9-deadline" error={errors.deadline}>
                <input
                  id="e9-deadline"
                  type="date"
                  className={inputClass(!!errors.deadline)}
                  value={values.deadline}
                  min={values.start_date || undefined}
                  onChange={(e) => set("deadline", e.target.value)}
                />
              </Field>
            </div>
          </E9Panel>

          {!isEdit && (
            <E9Panel title="What does this job have?">
              <div className="flex flex-col gap-4 p-5">
                <p className="text-body-xs-regular text-tertiary">
                  Tick the scopes on this job. Only these appear on the Tracker sheet and Dashboard. You can switch
                  scopes on or off, or add your own, later from Tracker › Scopes.
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {E9_SCOPES.map((scope) => {
                    const checked = chosenScopes.includes(scope.key);
                    return (
                      <label
                        key={scope.key}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-body-sm-medium",
                          checked
                            ? "border-accent-strong bg-accent-subtle text-primary"
                            : "border-subtle text-secondary"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--brand-default)]"
                          checked={checked}
                          onChange={() =>
                            setChosenScopes((prev) =>
                              checked ? prev.filter((key) => key !== scope.key) : [...prev, scope.key]
                            )
                          }
                        />
                        <span className="flex-1">{scope.label}</span>
                        <span className="text-body-2xs-semibold text-tertiary">
                          {scope.unit === "sqft" ? "sq ft" : scope.unit === "nos" ? "Nos" : "either"}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <Field
                  label="Number of floors (optional)"
                  htmlFor="e9-floor-count"
                  hint="Adds Ground Floor plus 1st to this floor. Each floor gets its own status, target date and totals."
                >
                  <input
                    id="e9-floor-count"
                    type="number"
                    min={0}
                    max={99}
                    inputMode="numeric"
                    className={cn(inputClass(), "sm:max-w-[10rem]")}
                    value={floorCount}
                    placeholder="e.g. 17"
                    onChange={(e) => setFloorCount(e.target.value)}
                  />
                </Field>
              </div>
            </E9Panel>
          )}

          <E9Panel title="Stage target dates">
            <div className="flex flex-col gap-4 p-5">
              <p className="text-body-xs-regular text-tertiary">
                Items that miss these dates turn red on the Tracker sheet.
              </p>
              {E9_TRACKER_STAGES.map((stage) => (
                <Field key={stage.key} label={stage.label} htmlFor={`e9-${stage.targetField}`}>
                  <input
                    id={`e9-${stage.targetField}`}
                    type="date"
                    className={inputClass()}
                    value={values[stage.targetField]}
                    onChange={(e) => set(stage.targetField, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </E9Panel>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:flex-col-reverse">
            <Button
              variant="secondary"
              size="lg"
              stretch="full"
              label="Cancel"
              onClick={() => router.push(backHref)}
              disabled={isSaving}
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              stretch="full"
              label={isEdit ? "Save changes" : "Create project"}
              loading={isSaving}
            />
          </div>
        </div>
      </form>
    </E9PageBody>
  );
});
