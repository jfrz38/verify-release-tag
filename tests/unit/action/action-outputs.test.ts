import { describe, expect, test, vi } from "vitest";

import {
  publishActionOutputs,
  type ActionOutputWriter,
} from "../../../src/action/action-outputs.js";

describe("publishActionOutputs", () => {
  test("publishes every successful output", () => {
    const core = createOutputWriter();

    publishActionOutputs(core, {
      version: "1.2.3",
      tag: "v1.2.3",
      tagExists: true,
      tagCommit: "tag-full-id",
      expectedCommit: "expected-full-id",
      commitMatches: false,
      policy: "require-existing",
    });

    expect(core.setOutput.mock.calls).toEqual([
      ["version", "1.2.3"],
      ["tag", "v1.2.3"],
      ["tag-exists", true],
      ["tag-commit", "tag-full-id"],
      ["expected-commit", "expected-full-id"],
      ["commit-matches", false],
      ["policy", "require-existing"],
    ]);
  });

  test("publishes empty values for results not determined", () => {
    const core = createOutputWriter();

    publishActionOutputs(core, {
      policy: "allow-missing",
      version: "1.2.3",
      tag: "v1.2.3",
      tagExists: false,
    });

    expect(core.setOutput.mock.calls).toEqual([
      ["version", "1.2.3"],
      ["tag", "v1.2.3"],
      ["tag-exists", false],
      ["tag-commit", ""],
      ["expected-commit", ""],
      ["commit-matches", ""],
      ["policy", "allow-missing"],
    ]);
  });
});

function createOutputWriter() {
  return {
    setOutput: vi.fn(),
  } satisfies ActionOutputWriter;
}
