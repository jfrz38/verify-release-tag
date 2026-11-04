import type {
  ReleaseTagPolicy,
  VerificationFailure,
} from "./verification-types.js";

export interface PolicyContext {
  readonly policy: ReleaseTagPolicy;
  readonly tag: string;
  readonly tagExists: boolean;
  readonly tagCommit?: string;
  readonly expectedCommit?: string;
  readonly commitMatches?: boolean;
}

export function applyPolicy(
  context: PolicyContext,
): VerificationFailure | undefined {
  if (!context.tagExists) {
    if (context.policy === "require-existing") {
      return {
        message: `Release tag "${context.tag}" does not exist and policy "require-existing" requires it.`,
      };
    }

    return undefined;
  }

  if (context.policy === "require-missing") {
    return {
      message: `Release tag "${context.tag}" already exists and policy "require-missing" requires it to be absent.`,
    };
  }

  if (
    context.commitMatches === false &&
    context.tagCommit !== undefined &&
    context.expectedCommit !== undefined
  ) {
    return {
      message: `Release tag "${context.tag}" points to commit "${context.tagCommit}", not expected commit "${context.expectedCommit}".`,
    };
  }

  return undefined;
}
