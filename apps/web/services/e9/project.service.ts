/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TE9ScopeItem } from "@/components/e9/tracker/logic";
import type { TE9ProfilePayload, TE9Project } from "@/components/e9/types";
import { APIService } from "@/services/api.service";

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

  async deleteItem(workspaceSlug: string, projectId: string, itemId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/e9/projects/${projectId}/items/${itemId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const e9ProjectService = new E9ProjectService();
