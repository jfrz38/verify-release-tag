import { readFile } from "node:fs/promises";

import {
  resolveWorkspacePath,
  WorkspacePathEscapeError,
} from "./workspace-path.js";

export async function readVersionFile(
  workspace: string,
  versionFile: string,
): Promise<string> {
  let resolvedPath: string;

  try {
    resolvedPath = await resolveWorkspacePath(workspace, versionFile);
  } catch (error: unknown) {
    if (error instanceof WorkspacePathEscapeError) {
      throw error;
    }

    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Version file "${versionFile}" does not exist.`, {
        cause: error,
      });
    }

    throw error;
  }

  let contents: string;

  try {
    contents = await readFile(resolvedPath, "utf8");
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Version file "${versionFile}" does not exist.`, {
        cause: error,
      });
    }

    throw error;
  }

  let manifest: unknown;

  try {
    manifest = JSON.parse(contents) as unknown;
  } catch (error: unknown) {
    throw new Error(
      `Version file "${versionFile}" does not contain valid JSON.`,
      {
        cause: error,
      },
    );
  }

  if (!hasValidVersion(manifest)) {
    throw new Error(
      `Version file "${versionFile}" does not contain a non-empty string property named "version".`,
    );
  }

  return manifest.version;
}

function hasValidVersion(manifest: unknown): manifest is { version: string } {
  return (
    typeof manifest === "object" &&
    manifest !== null &&
    "version" in manifest &&
    typeof manifest.version === "string" &&
    manifest.version.trim().length > 0
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
