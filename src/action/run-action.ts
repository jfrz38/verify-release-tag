import type { VerificationInputs } from "../application/verification-types.js";
import type { VerificationOutcome } from "../application/verification-types.js";
import { verifyReleaseTag } from "../application/verify-release-tag.js";
import { GitClient } from "../infrastructure/git-client.js";
import { readVersionFile } from "../infrastructure/version-file-reader.js";
import { readActionInputs } from "./action-inputs.js";
import type { ActionInputReader } from "./action-inputs.js";
import { publishActionOutputs } from "./action-outputs.js";
import type { ActionOutputWriter } from "./action-outputs.js";

export interface ActionCore extends ActionInputReader, ActionOutputWriter {
  setFailed(message: string): void;
}

export type VerifyActionInputs = (
  inputs: VerificationInputs,
) => Promise<VerificationOutcome>;

export async function runAction(
  core: ActionCore,
  environment: NodeJS.ProcessEnv = process.env,
  verify: VerifyActionInputs = verifyWithProductionDependencies,
): Promise<void> {
  try {
    const inputs = readActionInputs(core, environment);
    const outcome = await verify(inputs);

    publishActionOutputs(core, outcome.result);

    if (outcome.error !== undefined) {
      core.setFailed(outcome.error.message);
    }
  } catch {
    core.setFailed("Unexpected error while verifying the release tag.");
  }
}

function verifyWithProductionDependencies(
  inputs: VerificationInputs,
): Promise<VerificationOutcome> {
  return verifyReleaseTag(inputs, {
    readVersion: readVersionFile,
    git: new GitClient(inputs.workspace),
  });
}
