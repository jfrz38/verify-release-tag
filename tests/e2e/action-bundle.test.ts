import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { GitRepository } from "../helpers/git-repository.js";

const bundledAction = fileURLToPath(
  new URL("../../dist/index.js", import.meta.url),
);

describe("bundled Action", () => {
  test("runs without node_modules and writes successful outputs to GITHUB_OUTPUT", async () => {
    const repository = await GitRepository.create();

    try {
      const expectedCommit = await repository.commit();
      await writeManifest(repository.directory, "1.2.3");

      const execution = await runBundle(repository.directory, {
        "expected-commit": "HEAD",
        policy: "allow-missing",
      });

      expect(execution.exitCode).toBe(0);
      expect(execution.outputs).toEqual({
        version: "1.2.3",
        tag: "v1.2.3",
        "tag-exists": "false",
        "tag-commit": "",
        "expected-commit": expectedCommit,
        "commit-matches": "",
        policy: "allow-missing",
      });
    } finally {
      await repository.remove();
    }
  });

  test("writes diagnostic outputs before a commit mismatch fails", async () => {
    const repository = await GitRepository.create();

    try {
      const tagCommit = await repository.commit();
      await repository.createLightweightTag("v1.2.3");
      const expectedCommit = await repository.commit();
      await writeManifest(repository.directory, "1.2.3");

      const execution = await runBundle(repository.directory, {
        "expected-commit": "HEAD",
        policy: "require-existing",
      });

      expect(execution.exitCode).toBe(1);
      expect(`${execution.stdout}\n${execution.stderr}`).toContain(
        `Release tag "v1.2.3" points to commit "${tagCommit}", not expected commit "${expectedCommit}".`,
      );
      expect(execution.outputs).toEqual({
        version: "1.2.3",
        tag: "v1.2.3",
        "tag-exists": "true",
        "tag-commit": tagCommit,
        "expected-commit": expectedCommit,
        "commit-matches": "false",
        policy: "require-existing",
      });
    } finally {
      await repository.remove();
    }
  });
});

interface BundleExecution {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly outputs: Readonly<Record<string, string>>;
}

async function runBundle(
  workspace: string,
  inputs: Readonly<Record<string, string>>,
): Promise<BundleExecution> {
  const executionDirectory = await mkdtemp(
    path.join(tmpdir(), "verify-release-tag-bundle-"),
  );
  const copiedBundle = path.join(executionDirectory, "index.js");
  const outputFile = path.join(executionDirectory, "github-output");

  try {
    await copyFile(bundledAction, copiedBundle);
    await writeFile(outputFile, "", "utf8");

    const result = await executeNode(copiedBundle, executionDirectory, {
      ...process.env,
      GITHUB_ACTIONS: "true",
      GITHUB_OUTPUT: outputFile,
      GITHUB_WORKSPACE: workspace,
      "INPUT_VERSION-FILE": "package.json",
      "INPUT_TAG-PREFIX": "v",
      INPUT_TAG: "",
      "INPUT_EXPECTED-COMMIT": "",
      INPUT_POLICY: "allow-missing",
      ...actionInputEnvironment(inputs),
    });
    const serializedOutputs = await readFile(outputFile, "utf8");

    return {
      ...result,
      outputs: parseFileCommandOutputs(serializedOutputs),
    };
  } finally {
    await rm(executionDirectory, { force: true, recursive: true });
  }
}

function executeNode(
  bundle: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
): Promise<Omit<BundleExecution, "outputs">> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundle], {
      cwd,
      env: environment,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function actionInputEnvironment(
  inputs: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(inputs).map(([name, value]) => [
      `INPUT_${name.toUpperCase()}`,
      value,
    ]),
  );
}

function parseFileCommandOutputs(
  contents: string,
): Readonly<Record<string, string>> {
  const lines = contents.split(/\r?\n/);
  const outputs: Record<string, string> = {};

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index]?.match(/^([^<]+)<<(.+)$/);

    if (header === null || header === undefined) {
      continue;
    }

    const [, name, delimiter] = header;
    const valueLines: string[] = [];

    index += 1;
    while (index < lines.length && lines[index] !== delimiter) {
      valueLines.push(lines[index]!);
      index += 1;
    }

    outputs[name!] = valueLines.join("\n");
  }

  return outputs;
}

function writeManifest(workspace: string, version: string): Promise<void> {
  return writeFile(
    path.join(workspace, "package.json"),
    `${JSON.stringify({ version }, undefined, 2)}\n`,
    "utf8",
  );
}
