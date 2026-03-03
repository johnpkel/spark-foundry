/**
 * GET /api/logs — Server-Sent Events stream for activity log entries.
 *
 * On connect: sends all buffered entries as a single `init` event,
 * then subscribes to the EventEmitter for real-time new entries.
 * On client disconnect: automatically unsubscribes.
 */

import { NextRequest } from 'next/server';
import { getRecentEntries, clearEntries, logEmitter, type LogEntry } from '@/lib/activity-logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Client may have disconnected
        }
      };

      // Send existing entries immediately on connect
      send('init', getRecentEntries());

      // Subscribe to new entries
      const onEntry = (entry: LogEntry) => send('entry', entry);
      const onClear = () => send('clear', null);

      logEmitter.on('entry', onEntry);
      logEmitter.on('clear', onClear);

      // Clean up when the client disconnects
      request.signal.addEventListener('abort', () => {
        logEmitter.off('entry', onEntry);
        logEmitter.off('clear', onClear);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function DELETE() {
  clearEntries();
  return new Response(null, { status: 204 });
}
