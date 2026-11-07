/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so unit tests don't start the React Router dev plugin.
export default defineConfig({
  test: {
    include: ["components/**/*.test.ts"],
    environment: "node",
  },
});
