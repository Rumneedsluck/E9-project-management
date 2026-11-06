/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Avatar } from "@makeplane/propel/components/avatar";
import { cn, getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local
import { E9_STAGES, getPriorityMeta, getStageIndex, getStatusMeta } from "./constants";
import { describeDeadline, getDeadlineState, getInitials } from "./helpers";
import { RevealText, useInView } from "./motion";
import type { TE9Project, TE9ProjectPriority, TE9ProjectStatus } from "./types";

export function E9StatusBadge({ status, className }: { status: TE9ProjectStatus; className?: string }) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-subtle bg-layer-1 px-2.5 py-0.5 text-body-xs-medium whitespace-nowrap text-secondary",
        className
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export function E9PriorityBadge({ priority, className }: { priority: TE9ProjectPriority; className?: string }) {
  const meta = getPriorityMeta(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-body-xs-medium whitespace-nowrap",
        meta.className,
        className
      )}
    >
      {meta.label}
    </span>
  );
}

export function E9DeadlineText({ project, className }: { project: TE9Project; className?: string }) {
  const state = getDeadlineState(project);
  return (
    <span
      className={cn(
        "text-body-xs-medium whitespace-nowrap",
        state === "overdue" && "text-danger-primary",
        state === "due_soon" && "text-warning-primary",
        (state === "on_track" || state === "none") && "text-tertiary",
        state === "done" && "text-success-primary",
        className
      )}
    >
      {describeDeadline(project)}
    </span>
  );
}

export function E9ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-layer-3", className)}
    >
      <div className="e9-grow h-full rounded-full bg-inverse transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** The six-step E9 job journey with the current stage highlighted. */
export function E9StageTrack({ status, compact = false }: { status: TE9ProjectStatus; compact?: boolean }) {
  const current = getStageIndex(status);
  const steps = E9_STAGES.filter((stage) => stage.key !== "awarded" && stage.key !== "completed");
  const isDone = status === "completed";
  return (
    <ol className={cn("grid w-full gap-1.5", compact ? "grid-cols-6" : "grid-cols-3 sm:grid-cols-6")}>
      {steps.map((step) => {
        const stepIndex = getStageIndex(step.key);
        const reached = isDone || (current >= 0 && stepIndex <= current);
        const active = !isDone && stepIndex === current;
        return (
          <li key={step.key} className="flex min-w-0 flex-col gap-1.5">
            <span
              aria-hidden
              className={cn("h-1.5 rounded-full", reached ? "bg-accent-primary" : "bg-layer-3")}
              style={active ? { boxShadow: "0 0 0 3px var(--background-color-accent-subtle)" } : undefined}
            />
            {!compact && (
              <span
                className={cn(
                  "truncate text-body-2xs-medium",
                  active ? "text-primary" : reached ? "text-secondary" : "text-placeholder"
                )}
              >
                {step.label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type TMemberAvatarProps = { userId: string; size?: "sm" | "md" | "lg"; showName?: boolean };

export const E9MemberAvatar = observer(function E9MemberAvatar({ userId, size = "sm", showName }: TMemberAvatarProps) {
  const { getUserDetails } = useMember();
  const user = getUserDetails(userId);
  const name = user ? `${user.first_name} ${user.last_name}`.trim() || user.display_name : "Team member";
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar
        size={size}
        src={user?.avatar_url ? getFileURL(user.avatar_url) : undefined}
        alt={name}
        fallback={getInitials(user?.first_name, user?.last_name, user?.display_name)}
        tooltip={!showName}
      />
      {showName && <span className="truncate text-body-sm-medium text-primary">{name}</span>}
    </span>
  );
});

export function E9MemberStack({ userIds, max = 4 }: { userIds: string[]; max?: number }) {
  if (userIds.length === 0) return <span className="text-body-xs-regular text-placeholder">No team yet</span>;
  const visible = userIds.slice(0, max);
  const extra = userIds.length - visible.length;
  return (
    <span className="flex items-center">
      {visible.map((id) => (
        <span key={id} className="-ml-1 rounded-full ring-2 ring-[var(--background-color-surface-1)] first:ml-0">
          <E9MemberAvatar userId={id} />
        </span>
      ))}
      {extra > 0 && <span className="ml-1.5 text-body-xs-medium text-tertiary">+{extra}</span>}
    </span>
  );
}

type TPageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function E9PageHeader({ eyebrow, title, description, actions }: TPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && (
          <span className="text-body-xs-semibold tracking-[0.14em] text-accent-primary uppercase">{eyebrow}</span>
        )}
        <h1 className="text-h3-semibold tracking-tight text-primary">
          {typeof title === "string" ? <RevealText text={title} /> : title}
        </h1>
        {description && <p className="text-body-sm-regular text-tertiary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function E9Panel({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <section
      ref={ref}
      className={cn(
        "e9-reveal flex flex-col rounded-xl border border-subtle bg-surface-1 shadow-raised-100",
        inView && "is-in",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-3.5">
          {title && <h2 className="text-body-sm-semibold text-primary">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Content container used by every E9 page: generous padding on desktop, tighter on phones. */
export function E9PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={cn(
        "e9-enter mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
        wide ? "max-w-none" : "max-w-[1280px]"
      )}
    >
      {children}
    </div>
  );
}
