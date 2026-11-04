export interface VerificationInputs {
  readonly workspace: string;
  readonly versionFile: string;
  readonly tagPrefix: string;
  readonly tag?: string;
  readonly expectedCommit?: string;
  readonly policy: string;
}

export type ReleaseTagPolicy =
  "allow-missing" | "require-existing" | "require-missing";

export interface VerificationResult {
  readonly version?: string;
  readonly tag?: string;
  readonly tagExists?: boolean;
  readonly tagCommit?: string;
  readonly expectedCommit?: string;
  readonly commitMatches?: boolean;
  readonly policy?: ReleaseTagPolicy;
}

export interface VerificationFailure {
  readonly message: string;
}

export interface VerificationOutcome {
  readonly result: VerificationResult;
  readonly error?: VerificationFailure;
}

export type ReadVersion = (
  workspace: string,
  versionFile: string,
) => Promise<string>;

export type TagInspection =
  | { readonly exists: false }
  | { readonly exists: true; readonly commit?: string };

export interface GitOperations {
  findRepositoryRoot(): Promise<string>;
  assertNotShallow(): Promise<void>;
  assertValidTag(tag: string): Promise<void>;
  inspectTag(tag: string): Promise<TagInspection>;
  resolveCommit(revision: string): Promise<string>;
}

export interface VerificationDependencies {
  readonly readVersion: ReadVersion;
  readonly git: GitOperations;
}
