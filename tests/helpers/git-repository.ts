import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const isolatedGitEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
};

export class GitRepository {
  private commitSequence = 0;

  private constructor(readonly directory: string) {}

  static async create(): Promise<GitRepository> {
    const directory = await mkdtemp(
      path.join(tmpdir(), "verify-release-tag-git-"),
    );
    const repository = new GitRepository(directory);

    await repository.git("init");
    await repository.git("symbolic-ref", "HEAD", "refs/heads/main");
    await repository.git("config", "user.name", "Verify Release Tag Tests");
    await repository.git("config", "user.email", "tests@example.invalid");
    await repository.git("config", "commit.gpgSign", "false");

    return repository;
  }

  async commit(content?: string): Promise<string> {
    this.commitSequence += 1;
    const fileName = `commit-${this.commitSequence}.txt`;
    await writeFile(
      path.join(this.directory, fileName),
      content ?? `commit ${this.commitSequence}\n`,
      "utf8",
    );
    await this.git("add", "--", fileName);

    const timestamp = `2000-01-01T00:00:${String(this.commitSequence).padStart(2, "0")}Z`;
    await this.gitWithEnvironment(
      {
        GIT_AUTHOR_DATE: timestamp,
        GIT_COMMITTER_DATE: timestamp,
      },
      "commit",
      "-m",
      `commit ${this.commitSequence}`,
    );

    return this.git("rev-parse", "HEAD");
  }

  async createLightweightTag(name: string, target = "HEAD"): Promise<void> {
    await this.git("tag", name, target);
  }

  async createAnnotatedTag(name: string, target = "HEAD"): Promise<void> {
    await this.gitWithEnvironment(
      {
        GIT_COMMITTER_DATE: "2000-01-02T00:00:00Z",
      },
      "tag",
      "--annotate",
      name,
      target,
      "--message",
      name,
    );
  }

  async createBlobTag(name: string): Promise<void> {
    const fileName = "tagged-blob.txt";
    await writeFile(path.join(this.directory, fileName), "blob\n", "utf8");
    const objectId = await this.git("hash-object", "-w", "--", fileName);
    await this.git("update-ref", `refs/tags/${name}`, objectId);
  }

  async createTreeTag(name: string): Promise<void> {
    const objectId = await this.git("rev-parse", "HEAD^{tree}");
    await this.git("update-ref", `refs/tags/${name}`, objectId);
  }

  async createBranch(name: string, target = "HEAD"): Promise<void> {
    await this.git("branch", name, target);
  }

  async shallowClone(): Promise<GitRepository> {
    const directory = await mkdtemp(
      path.join(tmpdir(), "verify-release-tag-shallow-"),
    );
    await runGit(
      tmpdir(),
      ["clone", "--depth=1", pathToFileURL(this.directory).href, directory],
      {},
    );
    return new GitRepository(directory);
  }

  async remove(): Promise<void> {
    await rm(this.directory, { force: true, recursive: true });
  }

  private git(...arguments_: string[]): Promise<string> {
    return this.gitWithEnvironment({}, ...arguments_);
  }

  private gitWithEnvironment(
    environment: NodeJS.ProcessEnv,
    ...arguments_: string[]
  ): Promise<string> {
    return runGit(this.directory, arguments_, environment);
  }
}

function runGit(
  cwd: string,
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      arguments_,
      {
        cwd,
        encoding: "utf8",
        env: { ...isolatedGitEnvironment, ...environment },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            new Error(`Git command failed: ${stderr.trim()}`, { cause: error }),
          );
          return;
        }

        resolve(stdout.trim());
      },
    );
  });
}
