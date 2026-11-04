import { execFile } from "node:child_process";
import path from "node:path";

export type TagInspection =
  | { readonly exists: false }
  | { readonly exists: true; readonly commit?: string };

interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export class GitClient {
  constructor(private readonly workspace: string) {}

  async findRepositoryRoot(): Promise<string> {
    const result = await this.run(["rev-parse", "--show-toplevel"]);

    if (result.exitCode !== 0) {
      throw new Error(
        `Directory "${this.workspace}" is not inside a Git repository.`,
        { cause: commandFailure("locate the repository", result) },
      );
    }

    return path.resolve(this.workspace, result.stdout.trim());
  }

  async assertNotShallow(): Promise<void> {
    const result = await this.run(["rev-parse", "--is-shallow-repository"]);

    if (result.exitCode !== 0) {
      throw commandFailure("inspect whether the repository is shallow", result);
    }

    if (result.stdout.trim() === "true") {
      throw new Error(
        "The repository is shallow and may not contain all tags. Check out the repository with fetch-depth: 0.",
      );
    }

    if (result.stdout.trim() !== "false") {
      throw new Error(
        `Git returned an unexpected shallow-repository value: "${result.stdout.trim()}".`,
      );
    }
  }

  async assertValidTag(tag: string): Promise<void> {
    const result = await this.run(["check-ref-format", tagReference(tag)]);

    if (result.exitCode === 1) {
      throw new Error(`Release tag "${tag}" is not a valid Git reference.`);
    }

    if (result.exitCode !== 0) {
      throw commandFailure(`validate release tag "${tag}"`, result);
    }
  }

  async inspectTag(tag: string): Promise<TagInspection> {
    await this.assertValidTag(tag);
    const reference = tagReference(tag);
    const existence = await this.run([
      "show-ref",
      "--verify",
      "--quiet",
      reference,
    ]);

    if (existence.exitCode === 1) {
      return { exists: false };
    }

    if (existence.exitCode !== 0) {
      throw commandFailure(`inspect release tag "${tag}"`, existence);
    }

    const peeled = await this.run([
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${reference}^{commit}`,
    ]);

    assertEndOfOptionsSupported(peeled);

    if (peeled.exitCode !== 0) {
      return { exists: true };
    }

    return { exists: true, commit: peeled.stdout.trim() };
  }

  async resolveCommit(revision: string): Promise<string> {
    const result = await this.run([
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${revision}^{commit}`,
    ]);

    assertEndOfOptionsSupported(result);

    if (result.exitCode !== 0) {
      throw new Error(
        `Expected commit "${revision}" could not be resolved to a commit.`,
        {
          cause: commandFailure(
            `resolve expected commit "${revision}"`,
            result,
          ),
        },
      );
    }

    return result.stdout.trim();
  }

  private run(arguments_: readonly string[]): Promise<GitCommandResult> {
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        arguments_,
        {
          cwd: this.workspace,
          encoding: "utf8",
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error === null) {
            resolve({ exitCode: 0, stdout, stderr });
            return;
          }

          if (typeof error.code === "number") {
            resolve({ exitCode: error.code, stdout, stderr });
            return;
          }

          reject(error);
        },
      );
    });
  }
}

function tagReference(tag: string): string {
  return `refs/tags/${tag}`;
}

function assertEndOfOptionsSupported(result: GitCommandResult): void {
  if (
    result.exitCode !== 0 &&
    result.stderr.includes("end-of-options") &&
    result.stderr.toLowerCase().includes("unknown option")
  ) {
    throw new Error(
      'The installed Git does not support "--end-of-options". Git 2.20 or newer is required.',
    );
  }
}

function commandFailure(operation: string, result: GitCommandResult): Error {
  const details = result.stderr.trim();
  const suffix = details.length === 0 ? "" : ` ${details}`;
  return new Error(
    `Git failed to ${operation} (exit code ${result.exitCode}).${suffix}`,
  );
}
