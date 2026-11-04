import { describe, expect, test } from "vitest";

import {
  applyPolicy,
  type PolicyContext,
} from "../../../src/application/apply-policy.js";

const baseContext: PolicyContext = {
  policy: "allow-missing",
  tag: "v1.2.3",
  tagExists: false,
};

describe("applyPolicy", () => {
  test.each([
    ["allow-missing", false, undefined],
    ["allow-missing", true, undefined],
    ["allow-missing", true, true],
    ["require-existing", true, undefined],
    ["require-existing", true, true],
    ["require-missing", false, undefined],
  ] as const)(
    "accepts policy %s when tag existence is %s and comparison is %s",
    (policy, tagExists, commitMatches) => {
      expect(
        applyPolicy({
          ...baseContext,
          policy,
          tagExists,
          ...(commitMatches === undefined ? {} : { commitMatches }),
        }),
      ).toBeUndefined();
    },
  );

  test("rejects an absent tag when it is required", () => {
    expect(applyPolicy({ ...baseContext, policy: "require-existing" })).toEqual(
      {
        message:
          'Release tag "v1.2.3" does not exist and policy "require-existing" requires it.',
      },
    );
  });

  test("rejects an existing tag when it must be absent", () => {
    expect(
      applyPolicy({
        ...baseContext,
        policy: "require-missing",
        tagExists: true,
      }),
    ).toEqual({
      message:
        'Release tag "v1.2.3" already exists and policy "require-missing" requires it to be absent.',
    });
  });

  test.each(["allow-missing", "require-existing"] as const)(
    "rejects a mismatching commit under policy %s",
    (policy) => {
      expect(
        applyPolicy({
          ...baseContext,
          policy,
          tagExists: true,
          tagCommit: "actual-commit",
          expectedCommit: "expected-commit",
          commitMatches: false,
        }),
      ).toEqual({
        message:
          'Release tag "v1.2.3" points to commit "actual-commit", not expected commit "expected-commit".',
      });
    },
  );
});
