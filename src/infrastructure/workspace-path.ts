import { realpath } from "node:fs/promises";
import path from "node:path";

export class WorkspacePathEscapeError extends Error {
  constructor(requestedPath: string) {
    super(`Version file "${requestedPath}" must remain inside the workspace.`);
    this.name = "WorkspacePathEscapeError";
  }
}

export async function resolveWorkspacePath(
  workspace: string,
  requestedPath: string,
): Promise<string> {
  const lexicalWorkspace = path.resolve(workspace);
  const lexicalCandidate = path.resolve(lexicalWorkspace, requestedPath);

  assertContained(lexicalWorkspace, lexicalCandidate, requestedPath);

  const [resolvedWorkspace, resolvedCandidate] = await Promise.all([
    realpath(lexicalWorkspace),
    realpath(lexicalCandidate),
  ]);

  assertContained(resolvedWorkspace, resolvedCandidate, requestedPath);

  return resolvedCandidate;
}

function assertContained(
  workspace: string,
  candidate: string,
  requestedPath: string,
): void {
  const relativePath = path.relative(workspace, candidate);
  const escapesWorkspace =
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);

  if (escapesWorkspace) {
    throw new WorkspacePathEscapeError(requestedPath);
  }
}
