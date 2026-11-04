import { describe, expect, test, vi } from "vitest";

import { verifyReleaseTag } from "../../../src/application/verify-release-tag.js";
import type {
  GitOperations,
  ReadVersion,
  VerificationDependencies,
  VerificationInputs,
} from "../../../src/application/verification-types.js";

const defaultInputs: VerificationInputs = {
  workspace: "/workspace",
  versionFile: "package.json",
  tagPrefix: "v",
  policy: "allow-missing",
};

describe("verifyReleaseTag", () => {
  test.each([
    ["the conventional prefix", "v", "1.2.3", "v1.2.3"],
    ["an empty prefix", "", "1.2.3", "1.2.3"],
    ["a custom prefix", "release/", "1.2.3", "release/1.2.3"],
    ["a prerelease version", "v", "1.2.3-rc.1+build.5", "v1.2.3-rc.1+build.5"],
    ["untrimmed values", " Release-", " 1.2.3 ", " Release- 1.2.3 "],
  ])(
    "derives the exact tag with %s",
    async (_description, tagPrefix, version, tag) => {
      const dependencies = createDependencies(version);

      const outcome = await verifyReleaseTag(
        { ...defaultInputs, tagPrefix },
        dependencies,
      );

      expect(outcome).toEqual({
        result: {
          policy: "allow-missing",
          version,
          tag,
          tagExists: false,
        },
      });
      expect(dependencies.git.assertValidTag).toHaveBeenCalledWith(tag);
      expect(dependencies.git.inspectTag).toHaveBeenCalledWith(tag);
    },
  );

  test("passes the configured workspace and file to its collaborators", async () => {
    const dependencies = createDependencies();

    await verifyReleaseTag(
      {
        ...defaultInputs,
        workspace: "/other-workspace",
        versionFile: "packages/app.json",
      },
      dependencies,
    );

    expect(dependencies.git.findRepositoryRoot).toHaveBeenCalledOnce();
    expect(dependencies.readVersion).toHaveBeenCalledWith(
      "/other-workspace",
      "packages/app.json",
    );
  });

  test.each([
    ["omitted", undefined],
    ["empty", ""],
    ["identical", "v1.2.3"],
  ])("accepts an %s explicit tag", async (_description, explicitTag) => {
    const inputs: VerificationInputs =
      explicitTag === undefined
        ? defaultInputs
        : { ...defaultInputs, tag: explicitTag };

    await expect(
      verifyReleaseTag(inputs, createDependencies()),
    ).resolves.toEqual({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: false,
      },
    });
  });

  test.each([
    ["a different tag", "v1.2.4"],
    ["a case-only difference", "V1.2.3"],
  ])("rejects %s before inspecting refs", async (_description, explicitTag) => {
    const dependencies = createDependencies();

    const outcome = await verifyReleaseTag(
      { ...defaultInputs, tag: explicitTag },
      dependencies,
    );

    expect(outcome).toEqual({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
      },
      error: {
        message: `Requested release tag "${explicitTag}" does not match the expected tag "v1.2.3" derived from version "1.2.3".`,
      },
    });
    expect(dependencies.git.inspectTag).not.toHaveBeenCalled();
  });

  test("rejects an unsupported policy before repository inspection", async () => {
    const dependencies = createDependencies();

    const outcome = await verifyReleaseTag(
      { ...defaultInputs, policy: "ALLOW-MISSING" },
      dependencies,
    );

    expect(outcome).toEqual({
      result: {},
      error: {
        message:
          'Unsupported policy "ALLOW-MISSING". Expected "allow-missing", "require-existing", or "require-missing".',
      },
    });
    expect(dependencies.git.findRepositoryRoot).not.toHaveBeenCalled();
  });

  test("rejects expected-commit with require-missing before repository inspection", async () => {
    const dependencies = createDependencies();

    const outcome = await verifyReleaseTag(
      {
        ...defaultInputs,
        policy: "require-missing",
        expectedCommit: "HEAD",
      },
      dependencies,
    );

    expect(outcome).toEqual({
      result: { policy: "require-missing" },
      error: {
        message:
          'Input "expected-commit" cannot be used with policy "require-missing" because this policy rejects every existing tag.',
      },
    });
    expect(dependencies.git.findRepositoryRoot).not.toHaveBeenCalled();
  });

  test("treats an empty expected-commit as omitted", async () => {
    const dependencies = createDependencies();

    const outcome = await verifyReleaseTag(
      {
        ...defaultInputs,
        policy: "require-missing",
        expectedCommit: "",
      },
      dependencies,
    );

    expect(outcome).toEqual({
      result: {
        policy: "require-missing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: false,
      },
    });
    expect(dependencies.git.resolveCommit).not.toHaveBeenCalled();
  });

  test("returns a structured failure when the workspace is not in a repository", async () => {
    const dependencies = createDependencies();
    dependencies.git.findRepositoryRoot.mockRejectedValue(
      new Error('Directory "/workspace" is not inside a Git repository.'),
    );

    await expect(
      verifyReleaseTag(defaultInputs, dependencies),
    ).resolves.toEqual({
      result: { policy: "allow-missing" },
      error: {
        message: 'Directory "/workspace" is not inside a Git repository.',
      },
    });
    expect(dependencies.git.assertNotShallow).not.toHaveBeenCalled();
    expect(dependencies.readVersion).not.toHaveBeenCalled();
  });

  test("rejects a shallow repository before reading the version", async () => {
    const dependencies = createDependencies();
    dependencies.git.assertNotShallow.mockRejectedValue(
      new Error(
        "The repository is shallow and may not contain all tags. Check out the repository with fetch-depth: 0.",
      ),
    );

    const outcome = await verifyReleaseTag(defaultInputs, dependencies);

    expect(outcome.error?.message).toContain("repository is shallow");
    expect(outcome.result).toEqual({ policy: "allow-missing" });
    expect(dependencies.readVersion).not.toHaveBeenCalled();
  });

  test("returns a structured failure when the version cannot be read", async () => {
    const dependencies = createDependencies();
    dependencies.readVersion.mockRejectedValue(
      new Error('Version file "package.json" does not exist.'),
    );

    await expect(
      verifyReleaseTag(defaultInputs, dependencies),
    ).resolves.toEqual({
      result: { policy: "allow-missing" },
      error: {
        message: 'Version file "package.json" does not exist.',
      },
    });
  });

  test("retains the derived values when the tag format is invalid", async () => {
    const dependencies = createDependencies();
    dependencies.git.assertValidTag.mockRejectedValue(
      new Error('Release tag "v1.2.3" is not a valid Git reference.'),
    );

    await expect(
      verifyReleaseTag(defaultInputs, dependencies),
    ).resolves.toEqual({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
      },
      error: {
        message: 'Release tag "v1.2.3" is not a valid Git reference.',
      },
    });
    expect(dependencies.git.inspectTag).not.toHaveBeenCalled();
  });

  test("resolves an expected commit even when the tag is absent", async () => {
    const dependencies = createDependencies();
    dependencies.git.resolveCommit.mockResolvedValue("expected-full-id");

    const outcome = await verifyReleaseTag(
      { ...defaultInputs, expectedCommit: "HEAD" },
      dependencies,
    );

    expect(outcome).toEqual({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: false,
        expectedCommit: "expected-full-id",
      },
    });
    expect(dependencies.git.resolveCommit).toHaveBeenCalledWith("HEAD");
  });

  test("reports an unresolvable expected commit with prior results", async () => {
    const dependencies = createDependencies();
    dependencies.git.resolveCommit.mockRejectedValue(
      new Error('Expected commit "missing" could not be resolved to a commit.'),
    );

    await expect(
      verifyReleaseTag(
        { ...defaultInputs, expectedCommit: "missing" },
        dependencies,
      ),
    ).resolves.toEqual({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: false,
      },
      error: {
        message: 'Expected commit "missing" could not be resolved to a commit.',
      },
    });
  });

  test("returns tag data when no comparison was requested", async () => {
    const dependencies = createDependencies();
    dependencies.git.inspectTag.mockResolvedValue({
      exists: true,
      commit: "tag-full-id",
    });

    await expect(
      verifyReleaseTag(defaultInputs, dependencies),
    ).resolves.toEqual({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: true,
        tagCommit: "tag-full-id",
      },
    });
    expect(dependencies.git.resolveCommit).not.toHaveBeenCalled();
  });

  test("compares complete commit IDs", async () => {
    const dependencies = createDependencies();
    dependencies.git.inspectTag.mockResolvedValue({
      exists: true,
      commit: "same-full-id",
    });
    dependencies.git.resolveCommit.mockResolvedValue("same-full-id");

    await expect(
      verifyReleaseTag(
        { ...defaultInputs, expectedCommit: "abbreviated" },
        dependencies,
      ),
    ).resolves.toEqual({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: true,
        tagCommit: "same-full-id",
        expectedCommit: "same-full-id",
        commitMatches: true,
      },
    });
  });

  test("returns both commits before reporting a mismatch", async () => {
    const dependencies = createDependencies();
    dependencies.git.inspectTag.mockResolvedValue({
      exists: true,
      commit: "actual-full-id",
    });
    dependencies.git.resolveCommit.mockResolvedValue("expected-full-id");

    const outcome = await verifyReleaseTag(
      {
        ...defaultInputs,
        policy: "require-existing",
        expectedCommit: "HEAD",
      },
      dependencies,
    );

    expect(outcome).toEqual({
      result: {
        policy: "require-existing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: true,
        tagCommit: "actual-full-id",
        expectedCommit: "expected-full-id",
        commitMatches: false,
      },
      error: {
        message:
          'Release tag "v1.2.3" points to commit "actual-full-id", not expected commit "expected-full-id".',
      },
    });
  });

  test("distinguishes an existing non-commit tag from an absent tag", async () => {
    const dependencies = createDependencies();
    dependencies.git.inspectTag.mockResolvedValue({ exists: true });

    await expect(
      verifyReleaseTag(defaultInputs, dependencies),
    ).resolves.toEqual({
      result: {
        policy: "allow-missing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: true,
      },
      error: {
        message: 'Tag "v1.2.3" exists but does not resolve to a commit.',
      },
    });
  });

  test("applies require-existing after resolving an expected commit", async () => {
    const dependencies = createDependencies();
    dependencies.git.resolveCommit.mockResolvedValue("expected-full-id");

    const outcome = await verifyReleaseTag(
      {
        ...defaultInputs,
        policy: "require-existing",
        expectedCommit: "HEAD",
      },
      dependencies,
    );

    expect(outcome).toEqual({
      result: {
        policy: "require-existing",
        version: "1.2.3",
        tag: "v1.2.3",
        tagExists: false,
        expectedCommit: "expected-full-id",
      },
      error: {
        message:
          'Release tag "v1.2.3" does not exist and policy "require-existing" requires it.',
      },
    });
  });

  test("applies require-missing to an existing tag", async () => {
    const dependencies = createDependencies();
    dependencies.git.inspectTag.mockResolvedValue({
      exists: true,
      commit: "tag-full-id",
    });

    const outcome = await verifyReleaseTag(
      { ...defaultInputs, policy: "require-missing" },
      dependencies,
    );

    expect(outcome.error).toEqual({
      message:
        'Release tag "v1.2.3" already exists and policy "require-missing" requires it to be absent.',
    });
  });

  test("follows the documented validation and inspection order", async () => {
    const calls: string[] = [];
    const dependencies = createDependencies();
    dependencies.git.findRepositoryRoot.mockImplementation(async () => {
      calls.push("repository");
      return "/workspace";
    });
    dependencies.git.assertNotShallow.mockImplementation(async () => {
      calls.push("shallow");
    });
    dependencies.readVersion.mockImplementation(async () => {
      calls.push("version");
      return "1.2.3";
    });
    dependencies.git.assertValidTag.mockImplementation(async () => {
      calls.push("tag-format");
    });
    dependencies.git.inspectTag.mockImplementation(async () => {
      calls.push("tag-inspection");
      return { exists: false };
    });
    dependencies.git.resolveCommit.mockImplementation(async () => {
      calls.push("expected-commit");
      return "expected-full-id";
    });

    await verifyReleaseTag(
      { ...defaultInputs, expectedCommit: "HEAD" },
      dependencies,
    );

    expect(calls).toEqual([
      "repository",
      "shallow",
      "version",
      "tag-format",
      "tag-inspection",
      "expected-commit",
    ]);
  });

  test("does not hide a non-Error failure", async () => {
    const failure = { reason: "unexpected" };
    const dependencies = createDependencies();
    dependencies.readVersion.mockRejectedValue(failure);

    await expect(verifyReleaseTag(defaultInputs, dependencies)).rejects.toBe(
      failure,
    );
  });
});

function createDependencies(version = "1.2.3") {
  const git = {
    findRepositoryRoot: vi
      .fn<GitOperations["findRepositoryRoot"]>()
      .mockResolvedValue("/workspace"),
    assertNotShallow: vi
      .fn<GitOperations["assertNotShallow"]>()
      .mockResolvedValue(undefined),
    assertValidTag: vi
      .fn<GitOperations["assertValidTag"]>()
      .mockResolvedValue(undefined),
    inspectTag: vi
      .fn<GitOperations["inspectTag"]>()
      .mockResolvedValue({ exists: false }),
    resolveCommit: vi
      .fn<GitOperations["resolveCommit"]>()
      .mockResolvedValue("expected-full-id"),
  } satisfies GitOperations;

  return {
    readVersion: vi.fn<ReadVersion>().mockResolvedValue(version),
    git,
  } satisfies VerificationDependencies;
}
