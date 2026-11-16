import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";

import { WorkspaceBrowserPreview } from "../files/FilePreviewPanel";

/** Loaded on demand: the file preview stack is too heavy for the TV shell's own bundle. */
export default function TvPdfItem(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly absolutePath: string;
  readonly workspaceRoot: string;
  readonly title: string;
}) {
  return <WorkspaceBrowserPreview {...props} draft={false} workspaceMutationId={null} />;
}
