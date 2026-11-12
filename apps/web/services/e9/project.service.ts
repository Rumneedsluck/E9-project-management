/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TE9Health, TE9Hold, TE9Report } from "@/components/e9/tracker/hold-types";
import type { TE9Attachment, TE9Change, TE9Floor, TE9ProjectScope, TE9ScopeItem } from "@/components/e9/tracker/logic";
import type {
  TE9Announcements,
  TE9Bills,
  TE9Boq,
  TE9Certifications,
  TE9Logs,
  TE9Snags,
  TE9Summary,
} from "@/components/e9/commercial/types";
import type { TE9ProfilePayload, TE9Project } from "@/components/e9/types";
import { APIService } from "@/services/api.service";

export type TE9BoqKind = "pos" | "lines" | "amendments" | "reprints";
const boqPath = (kind: TE9BoqKind) => (kind === "reprints" ? "reprints" : `boq/${kind}`);

/** Talks to the E9 endpoints added by the backend `plane.e9` app. */
export class E9ProjectService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TE9Project[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/e9/projects/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string): Promise<TE9Project> {
    return this.get(`/api/workspaces/${workspaceSlug}/e9/projects/${projectId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProfile(workspaceSlug: string, projectId: string, data: TE9ProfilePayload): Promise<TE9Project> {
    return this.patch(`/api/workspaces/${workspaceSlug}/e9/projects/${projectId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---- tracker items ----
  async listItems(workspaceSlug: string, projectId: string): Promise<{ can_edit: boolean; items: TE9ScopeItem[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/e9/projects/${projectId}/items/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addItems(workspaceSlug: string, projectId: string, scope: string, count: number): Promise<TE9ScopeItem[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/e9/projects/${projectId}/items/`, { scope, count })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateItem(
    workspaceSlug: string,
    projectId: string,
    itemId: string,
    data: Partial<TE9ScopeItem>
  ): Promise<TE9ScopeItem> {
    return this.patch(`/api/workspaces/${workspaceSlug}/e9/projects/${projectId}/items/${itemId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Undo a delete: the row comes back in its old place. */
  async restoreItem(workspaceSlug: string, projectId: string, itemId: string): Promise<TE9ScopeItem> {
    return this.post(`/api/workspaces/${workspaceSlug}/e9/projects/${projectId}/items/${itemId}/restore/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteItem(workspaceSlug: string, projectId: string, itemId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/e9/projects/${projectId}/items/${itemId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/e9/projects/${projectId}`;
  }

  private async call<T>(promise: Promise<{ data: T }>): Promise<T> {
    try {
      return (await promise).data;
    } catch (error) {
      throw (error as { response?: { data?: unknown } })?.response?.data;
    }
  }

  // ---- scopes ----
  listScopes(workspaceSlug: string, projectId: string): Promise<TE9ProjectScope[]> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/scopes/`));
  }

  /** Save the whole scope list (rows without a key are new scopes the team added). */
  saveScopes(workspaceSlug: string, projectId: string, scopes: Partial<TE9ProjectScope>[]): Promise<TE9ProjectScope[]> {
    return this.call(this.put(`${this.base(workspaceSlug, projectId)}/scopes/`, { scopes }));
  }

  // ---- floors ----
  listFloors(workspaceSlug: string, projectId: string): Promise<TE9Floor[]> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/floors/`));
  }

  addFloors(workspaceSlug: string, projectId: string, names: string[]): Promise<TE9Floor[]> {
    return this.call(this.post(`${this.base(workspaceSlug, projectId)}/floors/`, { names }));
  }

  updateFloor(workspaceSlug: string, projectId: string, floorId: string, data: Partial<TE9Floor>): Promise<TE9Floor> {
    return this.call(this.patch(`${this.base(workspaceSlug, projectId)}/floors/${floorId}/`, data));
  }

  deleteFloor(workspaceSlug: string, projectId: string, floorId: string): Promise<void> {
    return this.call(this.delete(`${this.base(workspaceSlug, projectId)}/floors/${floorId}/`));
  }

  // ---- photos & PDFs ----
  listAttachments(workspaceSlug: string, projectId: string, kind?: string): Promise<TE9Attachment[]> {
    return this.call(
      this.get(`${this.base(workspaceSlug, projectId)}/attachments/`, kind ? { params: { kind } } : undefined)
    );
  }

  uploadAttachments(workspaceSlug: string, projectId: string, form: FormData): Promise<TE9Attachment[]> {
    return this.call(
      this.post(`${this.base(workspaceSlug, projectId)}/attachments/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    );
  }

  updateAttachment(
    workspaceSlug: string,
    projectId: string,
    attachmentId: string,
    data: Partial<TE9Attachment>
  ): Promise<TE9Attachment> {
    return this.call(this.patch(`${this.base(workspaceSlug, projectId)}/attachments/${attachmentId}/`, data));
  }

  deleteAttachment(workspaceSlug: string, projectId: string, attachmentId: string): Promise<void> {
    return this.call(this.delete(`${this.base(workspaceSlug, projectId)}/attachments/${attachmentId}/`));
  }

  /** Address of a stored photo / PDF (works for <img src> and links: the login cookie is sent). */
  fileUrl(workspaceSlug: string, projectId: string, attachmentId: string, download = false): string {
    return `${API_BASE_URL}${this.base(workspaceSlug, projectId)}/attachments/${attachmentId}/file/${download ? "?download=1" : ""}`;
  }

  // ---- history ----
  listHistory(workspaceSlug: string, projectId: string, entityId?: string): Promise<TE9Change[]> {
    return this.call(
      this.get(`${this.base(workspaceSlug, projectId)}/history/`, {
        params: { limit: 300, ...(entityId ? { entity_id: entityId } : {}) },
      })
    );
  }

  // ---- activity (heatmap) ----
  getActivity(
    workspaceSlug: string,
    projectId: string
  ): Promise<{ from: string; to: string; days: { date: string; count: number }[]; total: number }> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/activity/`));
  }

  // ---- Excel import ----
  importTracker(
    workspaceSlug: string,
    projectId: string,
    file: File
  ): Promise<{
    items: Record<string, number>;
    floors: string[];
    project_fields: string[];
    site_visits: number;
    boq_lines?: number;
    photos?: number;
    on_hold?: number;
    cancelled?: number;
    reprints?: number;
    snags?: number;
    job_cards?: number;
    challans?: number;
    coordinator: string;
    warnings: string[];
  }> {
    const form = new FormData();
    form.append("file", file);
    return this.call(
      this.post(`${this.base(workspaceSlug, projectId)}/import/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    );
  }

  // ---- BOQ, POs, amendments, reprints ----
  getBoq(workspaceSlug: string, projectId: string): Promise<TE9Boq> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/boq/`));
  }

  /** kind: pos | lines | amendments (under boq/) or reprints. Returns the whole BOQ again. */
  boqCreate(workspaceSlug: string, projectId: string, kind: TE9BoqKind, data: object): Promise<TE9Boq> {
    return this.call(this.post(`${this.base(workspaceSlug, projectId)}/${boqPath(kind)}/`, data));
  }

  boqUpdate(workspaceSlug: string, projectId: string, kind: TE9BoqKind, id: string, data: object): Promise<TE9Boq> {
    return this.call(this.patch(`${this.base(workspaceSlug, projectId)}/${boqPath(kind)}/${id}/`, data));
  }

  boqDelete(workspaceSlug: string, projectId: string, kind: TE9BoqKind, id: string): Promise<TE9Boq> {
    return this.call(this.delete(`${this.base(workspaceSlug, projectId)}/${boqPath(kind)}/${id}/`));
  }

  // ---- JC & DC logs ----
  getLogs(workspaceSlug: string, projectId: string): Promise<TE9Logs> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/logs/`));
  }

  saveLog(workspaceSlug: string, projectId: string, kind: "jc" | "dc", data: object): Promise<TE9Logs> {
    return this.call(this.put(`${this.base(workspaceSlug, projectId)}/logs/${kind}/`, data));
  }

  // ---- billing ----
  getBills(workspaceSlug: string, projectId: string): Promise<TE9Bills> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/bills/`));
  }

  createBill(workspaceSlug: string, projectId: string, data: object): Promise<TE9Bills> {
    return this.call(this.post(`${this.base(workspaceSlug, projectId)}/bills/`, data));
  }

  updateBill(workspaceSlug: string, projectId: string, billId: string, data: object): Promise<TE9Bills> {
    return this.call(this.patch(`${this.base(workspaceSlug, projectId)}/bills/${billId}/`, data));
  }

  deleteBill(workspaceSlug: string, projectId: string, billId: string): Promise<TE9Bills> {
    return this.call(this.delete(`${this.base(workspaceSlug, projectId)}/bills/${billId}/`));
  }

  // ---- company summary ----
  getSummary(workspaceSlug: string): Promise<TE9Summary> {
    return this.call(this.get(`/api/workspaces/${workspaceSlug}/e9/summary/`));
  }

  // ---- snag list ----
  getSnags(workspaceSlug: string, projectId: string): Promise<TE9Snags> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/snags/`));
  }

  createSnag(workspaceSlug: string, projectId: string, data: object): Promise<TE9Snags> {
    return this.call(this.post(`${this.base(workspaceSlug, projectId)}/snags/`, data));
  }

  updateSnag(workspaceSlug: string, projectId: string, snagId: string, data: object): Promise<TE9Snags> {
    return this.call(this.patch(`${this.base(workspaceSlug, projectId)}/snags/${snagId}/`, data));
  }

  deleteSnag(workspaceSlug: string, projectId: string, snagId: string): Promise<TE9Snags> {
    return this.call(this.delete(`${this.base(workspaceSlug, projectId)}/snags/${snagId}/`));
  }

  // ---- hold & cancel lists, client report, health check ----
  getHold(workspaceSlug: string, projectId: string): Promise<TE9Hold> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/hold/`));
  }

  getHealth(workspaceSlug: string, projectId: string): Promise<TE9Health> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/health/`));
  }

  getReport(workspaceSlug: string, projectId: string): Promise<TE9Report> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/report/`));
  }

  // ---- certification (JMC) ----
  getCertifications(workspaceSlug: string, projectId: string): Promise<TE9Certifications> {
    return this.call(this.get(`${this.base(workspaceSlug, projectId)}/certifications/`));
  }

  createCertification(workspaceSlug: string, projectId: string, data: object): Promise<TE9Certifications> {
    return this.call(this.post(`${this.base(workspaceSlug, projectId)}/certifications/`, data));
  }

  updateCertification(
    workspaceSlug: string,
    projectId: string,
    certId: string,
    data: object
  ): Promise<TE9Certifications> {
    return this.call(this.patch(`${this.base(workspaceSlug, projectId)}/certifications/${certId}/`, data));
  }

  deleteCertification(workspaceSlug: string, projectId: string, certId: string): Promise<TE9Certifications> {
    return this.call(this.delete(`${this.base(workspaceSlug, projectId)}/certifications/${certId}/`));
  }

  // ---- announcements ----
  getAnnouncements(workspaceSlug: string): Promise<TE9Announcements> {
    return this.call(this.get(`/api/workspaces/${workspaceSlug}/e9/announcements/`));
  }

  postAnnouncement(workspaceSlug: string, data: object): Promise<TE9Announcements> {
    return this.call(this.post(`/api/workspaces/${workspaceSlug}/e9/announcements/`, data));
  }

  deleteAnnouncement(workspaceSlug: string, announcementId: string): Promise<TE9Announcements> {
    return this.call(this.delete(`/api/workspaces/${workspaceSlug}/e9/announcements/${announcementId}/`));
  }
}

export const e9ProjectService = new E9ProjectService();
