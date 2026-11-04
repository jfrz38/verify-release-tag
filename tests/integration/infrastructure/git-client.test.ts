import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { GitClient } from "../../../src/infrastructure/git-client.js";
import { GitRepository } from "../../helpers/git-repository.js";

const repositories: GitRepository[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all([
    ...repositories.splice(0).map((repository) => repository.remove()),
    ...temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  ]);
});

describe("GitClient", () => {
  test("finds the repository root from a worktree directory", async () => {
    const repository = await createRepository();
    const client = new GitClient(repository.directory);
    const repositoryRoot = await realpath(repository.directory);

    await expect(client.findRepositoryRoot()).resolves.toBe(repositoryRoot);
  });

  test("rejects a directory outside a Git repository", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "verify-release-tag-none-"),
    );
    temporaryDirectories.push(directory);

    await expect(new GitClient(directory).findRepositoryRoot()).rejects.toThrow(
      `Directory "${directory}" is not inside a Git repository.`,
    );
  });

  test("accepts a complete repository", async () => {
    const repository = await createRepositoryWithCommit();

    await expect(
      new GitClient(repository.directory).assertNotShallow(),
    ).resolves.toBeUndefined();
  });

  test("rejects a shallow repository with checkout guidance", async () => {
    const repository = await createRepositoryWithCommit();
    await repository.commit();
    const shallow = await repository.shallowClone();
    repositories.push(shallow);

    await expect(
      new GitClient(shallow.directory).assertNotShallow(),
    ).rejects.toThrow(
      "The repository is shallow and may not contain all tags. Check out the repository with fetch-depth: 0.",
    );
  });

  test.each(["v1.2.3", "release/1.2.3", "1.2.3-rc.1"])(
    "accepts valid tag name %s",
    async (tag) => {
      const repository = await createRepositoryWithCommit();

      await expect(
        new GitClient(repository.directory).assertValidTag(tag),
      ).resolves.toBeUndefined();
    },
  );

  test.each(["", "release tag", "release..tag", "release~tag"])(
    "rejects invalid tag name %j",
    async (tag) => {
      const repository = await createRepositoryWithCommit();

      await expect(
        new GitClient(repository.directory).assertValidTag(tag),
      ).rejects.toThrow(`Release tag "${tag}" is not a valid Git reference.`);
    },
  );

  test("reports an absent exact tag despite a similarly named tag", async () => {
    const repository = await createRepositoryWithCommit();
    await repository.createLightweightTag("v1.2.30");

    await expect(
      new GitClient(repository.directory).inspectTag("v1.2.3"),
    ).resolves.toEqual({ exists: false });
  });

  test("resolves a lightweight tag to its complete commit ID", async () => {
    const repository = await createRepository();
    const commit = await repository.commit();
    await repository.createLightweightTag("v1.2.3");

    await expect(
      new GitClient(repository.directory).inspectTag("v1.2.3"),
    ).resolves.toEqual({ exists: true, commit });
  });

  test("peels an annotated tag to its complete commit ID", async () => {
    const repository = await createRepository();
    const commit = await repository.commit();
    await repository.createAnnotatedTag("v1.2.3");

    await expect(
      new GitClient(repository.directory).inspectTag("v1.2.3"),
    ).resolves.toEqual({ exists: true, commit });
  });

  test.each(["blob", "tree"])(
    "keeps a %s tag present when it cannot be peeled to a commit",
    async (objectType) => {
      const repository = await createRepositoryWithCommit();
      if (objectType === "blob") {
        await repository.createBlobTag("v1.2.3");
      } else {
        await repository.createTreeTag("v1.2.3");
      }

      await expect(
        new GitClient(repository.directory).inspectTag("v1.2.3"),
      ).resolves.toEqual({ exists: true });
    },
  );

  test("resolves HEAD, branches, and complete or abbreviated object IDs", async () => {
    const repository = await createRepository();
    const commit = await repository.commit();
    await repository.createBranch("release-candidate");
    const client = new GitClient(repository.directory);

    for (const revision of [
      "HEAD",
      "release-candidate",
      commit,
      commit.slice(0, 8),
    ]) {
      await expect(client.resolveCommit(revision)).resolves.toBe(commit);
    }
  });

  test("rejects an unknown expected revision", async () => {
    const repository = await createRepositoryWithCommit();

    await expect(
      new GitClient(repository.directory).resolveCommit("missing-revision"),
    ).rejects.toThrow(
      'Expected commit "missing-revision" could not be resolved to a commit.',
    );
  });

  test("does not interpret a revision beginning with a dash as an option", async () => {
    const repository = await createRepositoryWithCommit();

    await expect(
      new GitClient(repository.directory).resolveCommit("--help"),
    ).rejects.toThrow(
      'Expected commit "--help" could not be resolved to a commit.',
    );
  });
});

async function createRepository(): Promise<GitRepository> {
  const repository = await GitRepository.create();
  repositories.push(repository);
  return repository;
}

async function createRepositoryWithCommit(): Promise<GitRepository> {
  const repository = await createRepository();
  await repository.commit();
  return repository;
}
