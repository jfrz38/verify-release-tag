import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { readVersionFile } from "../../../src/infrastructure/version-file-reader.js";

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

describe("readVersionFile", () => {
  test("returns the original version string from a configurable JSON file", async () => {
    const workspace = await createWorkspace();
    const manifestPath = path.join(workspace, "packages", "app.json");
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({ version: " 1.2.3-rc.1 " }),
      "utf8",
    );

    await expect(readVersionFile(workspace, "packages/app.json")).resolves.toBe(
      " 1.2.3-rc.1 ",
    );
  });

  test("rejects a missing version file", async () => {
    const workspace = await createWorkspace();

    await expect(readVersionFile(workspace, "missing.json")).rejects.toThrow(
      'Version file "missing.json" does not exist.',
    );
  });

  test("rejects malformed JSON", async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, "package.json"), "{", "utf8");

    await expect(readVersionFile(workspace, "package.json")).rejects.toThrow(
      'Version file "package.json" does not contain valid JSON.',
    );
  });

  test.each([
    ["a missing version", {}],
    ["a numeric version", { version: 123 }],
    ["an empty version", { version: "" }],
    ["a whitespace-only version", { version: " \t " }],
  ])("rejects a manifest with %s", async (_description, manifest) => {
    const workspace = await createWorkspace();
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify(manifest),
      "utf8",
    );

    await expect(readVersionFile(workspace, "package.json")).rejects.toThrow(
      'Version file "package.json" does not contain a non-empty string property named "version".',
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), "verify-release-tag-"));
  temporaryDirectories.push(workspace);
  return workspace;
}
