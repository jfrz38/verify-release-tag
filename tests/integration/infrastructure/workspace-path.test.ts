import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  resolveWorkspacePath,
  WorkspacePathEscapeError,
} from "../../../src/infrastructure/workspace-path.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe("resolveWorkspacePath", () => {
  test("resolves a nested file inside the workspace", async () => {
    const root = await createTemporaryDirectory();
    const workspace = path.join(root, "workspace");
    const manifest = path.join(workspace, "packages", "app", "package.json");
    await mkdir(path.dirname(manifest), { recursive: true });
    await writeFile(manifest, "{}", "utf8");
    const resolvedManifest = await realpath(manifest);

    await expect(
      resolveWorkspacePath(workspace, "packages/app/package.json"),
    ).resolves.toBe(resolvedManifest);
  });

  test("rejects a lexical escape from the workspace", async () => {
    const root = await createTemporaryDirectory();
    const workspace = path.join(root, "workspace");
    const externalManifest = path.join(root, "package.json");
    await mkdir(workspace);
    await writeFile(externalManifest, "{}", "utf8");

    await expect(
      resolveWorkspacePath(workspace, "../package.json"),
    ).rejects.toThrow(new WorkspacePathEscapeError("../package.json"));
  });

  test("rejects a symlink that resolves outside the workspace", async (context) => {
    const root = await createTemporaryDirectory();
    const workspace = path.join(root, "workspace");
    const externalDirectory = path.join(root, "external");
    const linkedDirectory = path.join(workspace, "linked");
    await mkdir(workspace);
    await mkdir(externalDirectory);
    await writeFile(path.join(externalDirectory, "package.json"), "{}", "utf8");

    try {
      await symlink(
        externalDirectory,
        linkedDirectory,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error: unknown) {
      if (isUnsupportedSymlinkError(error)) {
        context.skip(`Symlink creation is unavailable: ${error.code}`);
        return;
      }

      throw error;
    }

    await expect(
      resolveWorkspacePath(workspace, "linked/package.json"),
    ).rejects.toThrow(new WorkspacePathEscapeError("linked/package.json"));
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "verify-release-tag-"));
  temporaryDirectories.push(directory);
  return directory;
}

function isUnsupportedSymlinkError(
  error: unknown,
): error is NodeJS.ErrnoException & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "EPERM" ||
      error.code === "EACCES" ||
      error.code === "ENOTSUP")
  );
}
