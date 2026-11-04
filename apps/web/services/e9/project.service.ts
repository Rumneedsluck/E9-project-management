/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
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
}

export const e9ProjectService = new E9ProjectService();
