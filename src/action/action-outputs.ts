import type { VerificationResult } from "../application/verification-types.js";

export interface ActionOutputWriter {
  setOutput(name: string, value: unknown): void;
}

export function publishActionOutputs(
  core: ActionOutputWriter,
  result: VerificationResult,
): void {
  core.setOutput("version", result.version ?? "");
  core.setOutput("tag", result.tag ?? "");
  core.setOutput("tag-exists", result.tagExists ?? "");
  core.setOutput("tag-commit", result.tagCommit ?? "");
  core.setOutput("expected-commit", result.expectedCommit ?? "");
  core.setOutput("commit-matches", result.commitMatches ?? "");
  core.setOutput("policy", result.policy ?? "");
}
