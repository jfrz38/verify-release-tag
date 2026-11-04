import type { VerificationInputs } from "../application/verification-types.js";

export interface ActionInputReader {
  getInput(name: string): string;
}

export function readActionInputs(
  core: ActionInputReader,
  environment: NodeJS.ProcessEnv,
): VerificationInputs {
  const workspace = environment.GITHUB_WORKSPACE;

  if (workspace === undefined || workspace === "") {
    throw new Error("GITHUB_WORKSPACE is not set.");
  }

  const tag = optionalInput(core.getInput("tag"));
  const expectedCommit = optionalInput(core.getInput("expected-commit"));

  return {
    workspace,
    versionFile: core.getInput("version-file"),
    tagPrefix: core.getInput("tag-prefix"),
    policy: core.getInput("policy"),
    ...(tag === undefined ? {} : { tag }),
    ...(expectedCommit === undefined ? {} : { expectedCommit }),
  };
}

function optionalInput(value: string): string | undefined {
  return value === "" ? undefined : value;
}
