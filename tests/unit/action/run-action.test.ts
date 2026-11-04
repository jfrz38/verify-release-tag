import { describe, expect, test, vi } from "vitest";

import {
  runAction,
  type ActionCore,
  type VerifyActionInputs,
} from "../../../src/action/run-action.js";

const environment = { GITHUB_WORKSPACE: "/workspace" };

describe("runAction", () => {
  test("passes Action inputs to verification and publishes a successful result", async () => {
    const core = createCore();
    const verify = vi.fn<VerifyActionInputs>().mockResolvedValue({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: false,
      },
    });

    await runAction(core, environment, verify);

    expect(verify).toHaveBeenCalledWith({
      workspace: "/workspace",
      versionFile: "package.json",
      tagPrefix: "v",
      policy: "allow-missing",
    });
    expect(core.setOutput).toHaveBeenCalledTimes(7);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("publishes diagnostic outputs before marking the Action as failed", async () => {
    const core = createCore();
    const verify = vi.fn<VerifyActionInputs>().mockResolvedValue({
      result: {
        policy: "require-existing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: false,
      },
      error: {
        message:
          'Release tag "v1.2.3" does not exist and policy "require-existing" requires it.',
      },
    });

    await runAction(core, environment, verify);

    expect(core.setFailed).toHaveBeenCalledWith(
      'Release tag "v1.2.3" does not exist and policy "require-existing" requires it.',
    );
    expect(core.setOutput.mock.invocationCallOrder.at(-1)).toBeLessThan(
      core.setFailed.mock.invocationCallOrder[0]!,
    );
  });

  test("reports unexpected failures without exposing their contents", async () => {
    const core = createCore();
    const verify = vi
      .fn<VerifyActionInputs>()
      .mockRejectedValue(
        new Error("token=secret-value environment=private-value"),
      );

    await runAction(core, environment, verify);

    expect(core.setOutput).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(
      "Unexpected error while verifying the release tag.",
    );
  });
});

function createCore() {
  const values: Readonly<Record<string, string>> = {
    "version-file": "package.json",
    "tag-prefix": "v",
    policy: "allow-missing",
  };

  return {
    getInput: vi.fn((name: string) => values[name] ?? ""),
    setOutput: vi.fn(),
    setFailed: vi.fn(),
  } satisfies ActionCore;
}
