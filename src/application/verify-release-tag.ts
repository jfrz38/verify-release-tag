import { applyPolicy } from "./apply-policy.js";
import type {
  ReleaseTagPolicy,
  VerificationDependencies,
  VerificationInputs,
  VerificationOutcome,
  VerificationResult,
} from "./verification-types.js";

export async function verifyReleaseTag(
  inputs: VerificationInputs,
  dependencies: VerificationDependencies,
): Promise<VerificationOutcome> {
  let result: VerificationResult = {};

  try {
    const policy = validatePolicy(inputs.policy);
    result = { policy };

    const expectedCommitInput = optionalInput(inputs.expectedCommit);
    if (policy === "require-missing" && expectedCommitInput !== undefined) {
      return {
        result,
        error: {
          message:
            'Input "expected-commit" cannot be used with policy "require-missing" because this policy rejects every existing tag.',
        },
      };
    }

    await dependencies.git.findRepositoryRoot();
    await dependencies.git.assertNotShallow();

    const version = await dependencies.readVersion(
      inputs.workspace,
      inputs.versionFile,
    );
    const tag = `${inputs.tagPrefix}${version}`;
    result = { ...result, version, tag };

    await dependencies.git.assertValidTag(tag);

    const explicitTag = optionalInput(inputs.tag);
    if (explicitTag !== undefined && explicitTag !== tag) {
      return {
        result,
        error: {
          message: `Requested release tag "${explicitTag}" does not match the expected tag "${tag}" derived from version "${version}".`,
        },
      };
    }

    const inspection = await dependencies.git.inspectTag(tag);
    result = inspection.exists
      ? {
          ...result,
          tagExists: true,
          ...(inspection.commit === undefined
            ? {}
            : { tagCommit: inspection.commit }),
        }
      : { ...result, tagExists: false };

    if (inspection.exists && inspection.commit === undefined) {
      return {
        result,
        error: {
          message: `Tag "${tag}" exists but does not resolve to a commit.`,
        },
      };
    }

    let resolvedExpectedCommit: string | undefined;
    if (expectedCommitInput !== undefined) {
      resolvedExpectedCommit =
        await dependencies.git.resolveCommit(expectedCommitInput);
      result = { ...result, expectedCommit: resolvedExpectedCommit };
    }

    if (
      inspection.exists &&
      inspection.commit !== undefined &&
      resolvedExpectedCommit !== undefined
    ) {
      result = {
        ...result,
        commitMatches: inspection.commit === resolvedExpectedCommit,
      };
    }

    const policyError = applyPolicy({
      policy,
      tag,
      tagExists: inspection.exists,
      ...(inspection.exists && inspection.commit !== undefined
        ? { tagCommit: inspection.commit }
        : {}),
      ...(resolvedExpectedCommit === undefined
        ? {}
        : { expectedCommit: resolvedExpectedCommit }),
      ...(result.commitMatches === undefined
        ? {}
        : { commitMatches: result.commitMatches }),
    });

    return policyError === undefined
      ? { result }
      : { result, error: policyError };
  } catch (error: unknown) {
    return failure(result, error);
  }
}

function validatePolicy(policy: string): ReleaseTagPolicy {
  if (
    policy === "allow-missing" ||
    policy === "require-existing" ||
    policy === "require-missing"
  ) {
    return policy;
  }

  throw new Error(
    `Unsupported policy "${policy}". Expected "allow-missing", "require-existing", or "require-missing".`,
  );
}

function optionalInput(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

function failure(
  result: VerificationResult,
  error: unknown,
): VerificationOutcome {
  if (error instanceof Error) {
    return {
      result,
      error: { message: error.message },
    };
  }

  throw error;
}
