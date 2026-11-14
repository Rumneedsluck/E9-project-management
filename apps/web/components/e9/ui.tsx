/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType, ReactNode } from "react";
import { observer } from "mobx-react";
import { Avatar } from "@makeplane/propel/components/avatar";
import { cn, getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local
import { E9Text } from "./brand";
import { E9_STAGES, getPriorityMeta, getStageIndex, getStatusMeta } from "./constants";
import { describeDeadline, getDeadlineState, getInitials } from "./helpers";
import { E9ConfirmHost } from "./confirm";
import { E9Intro } from "./intro";
import { RevealText, useInView } from "./motion";
import type { TE9CertState, TE9Project, TE9ProjectPriority, TE9ProjectStatus } from "./types";

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
    <div className="e9-double-rule flex flex-col gap-4 pt-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && (
          <span className="e9-eyebrow">
            <E9Text>{eyebrow}</E9Text>
          </span>
        )}
        <h1 className="e9-display [font-size:40px] leading-[1.05] text-primary">
          {typeof title === "string" ? <RevealText text={title} /> : title}
        </h1>
        {description && <p className="max-w-2xl text-body-sm-regular text-tertiary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Colour identities for cards; each one is a hue defined in e9-theme.css (light and dark). */
export type TE9Tone = "ink" | "blue" | "sky" | "teal" | "violet" | "red" | "amber" | "green";

type TE9PanelProps = {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** gives the card its own colour (top edge, icon well, count) so neighbouring cards are easy to tell apart */
  tone?: TE9Tone;
  /** icon in the coloured well beside the title (used with `tone`) */
  icon?: ComponentType<{ className?: string }>;
  /** one plain line under the title: what this card shows (used with `tone`) */
  subtitle?: ReactNode;
  /** short count or status beside the title, e.g. "3 open" (used with `tone`) */
  meta?: ReactNode;
};

export function E9Panel({ title, action, children, className, tone, icon: Icon, subtitle, meta }: TE9PanelProps) {
  const { ref, inView } = useInView<HTMLElement>();
  const hasHeader = !!(title || action);
  return (
    <section
      ref={ref}
      data-tone={tone}
      className={cn(
        "e9-reveal flex flex-col rounded-lg border border-subtle bg-surface-1",
        tone ? "e9-panel" : "e9-crop",
        inView && "is-in",
        className
      )}
    >
      {hasHeader &&
        (tone ? (
          // on a phone the count and the button drop to a second line instead of squeezing the title
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-subtle px-5 py-3">
            {Icon && (
              <span aria-hidden className="e9-panel__well">
                <Icon className="size-[18px]" />
              </span>
            )}
            <div className="min-w-[11rem] flex-1">
              {title && <h2 className="e9-display text-[17px] leading-tight text-primary">{title}</h2>}
              {subtitle && <p className="e9-panel__sub text-tertiary">{subtitle}</p>}
            </div>
            {meta && <span className="e9-panel__meta">{meta}</span>}
            {action && <span className="ml-auto">{action}</span>}
          </header>
        ) : (
          <header className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-3.5">
            {title && <h2 className="e9-eyebrow !text-secondary">{title}</h2>}
            {action}
          </header>
        ))}
      {children}
    </section>
  );
}

/** Professional project mark: the project code on a black tile (no emojis). */
export function E9CodeTile({
  code,
  size = "md",
  inverse = false,
  className,
}: {
  code: string;
  size?: "sm" | "md" | "lg";
  /** white tile with black letters (for dark backgrounds) */
  inverse?: boolean;
  className?: string;
}) {
  const text = (code || "E9").slice(0, 5).toUpperCase();
  return (
    <span
      aria-hidden
      // colours inline: the class merger drops a plain text colour next to an arbitrary font size
      style={{ backgroundColor: inverse ? "#FFFFFF" : "#0B0B0B", color: inverse ? "#0B0B0B" : "#FFFFFF" }}
      className={cn(
        "e9-mono grid shrink-0 place-items-center rounded-lg font-semibold tracking-wide ring-1 ring-white/10",
        size === "sm" && "h-7 w-10 text-[length:9px]",
        size === "md" && "h-10 w-12 text-[length:10px]",
        size === "lg" && "h-12 w-14 text-[length:12px]",
        className
      )}
    >
      {text}
    </span>
  );
}

const CERT_META: Record<TE9CertState, { label: string; className: string }> = {
  in_progress: { label: "Work in progress", className: "text-tertiary" },
  jmc_pending: { label: "Waiting for JMC", className: "text-warning-primary" },
  part_certified: { label: "Part certified", className: "text-accent-primary" },
  certified: { label: "Certified", className: "text-success-primary" },
};

export const certLabel = (state: TE9CertState) => CERT_META[state].label;

/** Work → JMC → Certified → Billing, as four small steps. */
export function E9CertSteps({ project, compact = false }: { project: TE9Project; compact?: boolean }) {
  const state = project.cert_state ?? "in_progress";
  const reached = {
    work: true,
    jmc: state !== "in_progress",
    certified: state === "part_certified" || state === "certified",
    billing: project.billing_open,
  };
  const steps: { key: keyof typeof reached; label: string }[] = [
    { key: "work", label: "Work" },
    { key: "jmc", label: "JMC" },
    { key: "certified", label: "Certified" },
    { key: "billing", label: "Billing" },
  ];
  return (
    <span className={cn("flex gap-1", compact ? "flex-row items-center gap-2" : "flex-col")}>
      <span className="flex items-center gap-1" aria-hidden>
        {steps.map((step) => (
          <span
            key={step.key}
            className={cn("h-[3px]", compact ? "w-3" : "w-6", reached[step.key] ? "bg-inverse" : "bg-layer-3")}
            title={step.label}
          />
        ))}
      </span>
      <span className={cn("text-body-2xs-semibold whitespace-nowrap", CERT_META[state].className)}>
        {CERT_META[state].label}
      </span>
    </span>
  );
}

/** Content container used by every E9 page: generous padding on desktop, tighter on phones. */
export function E9PageBody({
  children,
  wide = false,
  tight = false,
}: {
  children: ReactNode;
  wide?: boolean;
  /** less space around (project pages: the sheet starts higher) */
  tight?: boolean;
}) {
  return (
    <div
      className={cn(
        "e9-enter mx-auto flex w-full flex-col px-4 sm:px-6 lg:px-8",
        tight ? "gap-4 py-4 lg:py-5" : "gap-6 py-6 lg:py-8",
        wide ? "max-w-none" : "max-w-[1280px]"
      )}
    >
      <E9Intro />
      <E9ConfirmHost />
      {children}
    </div>
  );
}
