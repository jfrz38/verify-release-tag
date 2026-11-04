import { describe, expect, test, vi } from "vitest";

import {
  readActionInputs,
  type ActionInputReader,
} from "../../../src/action/action-inputs.js";

describe("readActionInputs", () => {
  test("reads metadata-backed values without applying local defaults", () => {
    const core = createInputReader({
      "version-file": "manifest.json",
      "tag-prefix": "release/",
      tag: "release/1.2.3",
      "expected-commit": "HEAD",
      policy: "require-existing",
    });

    expect(readActionInputs(core, { GITHUB_WORKSPACE: "/workspace" })).toEqual({
      workspace: "/workspace",
      versionFile: "manifest.json",
      tagPrefix: "release/",
      tag: "release/1.2.3",
      expectedCommit: "HEAD",
      policy: "require-existing",
    });
  });

  test("preserves an explicitly empty tag prefix", () => {
    const core = createInputReader({
      "version-file": "package.json",
      "tag-prefix": "",
      policy: "allow-missing",
    });

    expect(readActionInputs(core, { GITHUB_WORKSPACE: "/workspace" })).toEqual({
      workspace: "/workspace",
      versionFile: "package.json",
      tagPrefix: "",
      policy: "allow-missing",
    });
  });

  test("treats empty optional inputs as omitted", () => {
    const core = createInputReader({
      "version-file": "package.json",
      "tag-prefix": "v",
      tag: "",
      "expected-commit": "",
      policy: "allow-missing",
    });

    expect(readActionInputs(core, { GITHUB_WORKSPACE: "/workspace" })).toEqual({
      workspace: "/workspace",
      versionFile: "package.json",
      tagPrefix: "v",
      policy: "allow-missing",
    });
  });

  test("rejects a missing GitHub workspace", () => {
    const core = createInputReader({});

    expect(() => readActionInputs(core, {})).toThrow(
      "GITHUB_WORKSPACE is not set.",
    );
    expect(core.getInput).not.toHaveBeenCalled();
  });
});

function createInputReader(values: Readonly<Record<string, string>>) {
  return {
    getInput: vi.fn((name: string) => values[name] ?? ""),
  } satisfies ActionInputReader;
}
