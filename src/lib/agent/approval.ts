/**
 * Verification gate for write operations.
 *
 * Write/destructive tool calls pause and wait for user approval
 * before executing. Uses a simple in-memory Map with promise resolution.
 */

interface PendingApproval {
  resolve: (approved: boolean) => void;
  timeout: NodeJS.Timeout;
}

const pendingApprovals = new Map<string, PendingApproval>();

const APPROVAL_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Request user approval for a write operation.
 * Returns a promise that resolves to true (approved) or false (rejected/timeout).
 */
export function requestApproval(id: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      pendingApprovals.delete(id);
      resolve(false); // Auto-reject after timeout
    }, APPROVAL_TIMEOUT_MS);

    pendingApprovals.set(id, { resolve, timeout });
  });
}

/**
 * Resolve a pending approval. Called from the /api/chat/approve endpoint.
 */
export function resolveApproval(id: string, approved: boolean): boolean {
  const pending = pendingApprovals.get(id);
  if (!pending) return false;

  clearTimeout(pending.timeout);
  pendingApprovals.delete(id);
  pending.resolve(approved);
  return true;
}
