import { ServerSentEventGenerator } from '@starfederation/datastar-sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';

const registry = new Map<string, Set<ServerSentEventGenerator>>();
const pendingScoreBroadcasts = new Map<string, NodeJS.Timeout>();

export const sseRegistry = {
  connect(sessionId: string, _userId: string, req: IncomingMessage, res: ServerResponse): void {
    ServerSentEventGenerator.stream(req, res, async (sse) => {
      if (!registry.has(sessionId)) registry.set(sessionId, new Set());
      registry.get(sessionId)!.add(sse);

      req.on('close', () => {
        const clients = registry.get(sessionId);
        if (clients) {
          clients.delete(sse);
          if (clients.size === 0) registry.delete(sessionId);
        }
      });

      sse.patchSignals(JSON.stringify({ sessionId, connected: true }));
    }, { keepalive: true });
  },

  broadcast(sessionId: string, fn: (sse: ServerSentEventGenerator) => void): void {
    const clients = registry.get(sessionId);
    if (!clients) return;
    for (const sse of clients) {
      try { fn(sse); } catch { clients.delete(sse); }
    }
  },

  /**
   * Tells open session pages the scoreboard changed (a score saved or removed,
   * a round closed). Pages fetch the re-rendered scoreboard themselves, so one
   * version bump covers every kind of change. Rapid taps are coalesced.
   */
  broadcastScoresChanged(sessionId: string): void {
    clearTimeout(pendingScoreBroadcasts.get(sessionId));
    pendingScoreBroadcasts.set(sessionId, setTimeout(() => {
      pendingScoreBroadcasts.delete(sessionId);
      this.broadcast(sessionId, (sse) => {
        sse.patchSignals(JSON.stringify({ scoresVersion: Date.now() }));
      });
    }, 150));
  },

  broadcastSessionComplete(sessionId: string): void {
    this.broadcast(sessionId, (sse) => {
      sse.patchSignals(JSON.stringify({ sessionStatus: 'completed' }));
    });
  },

  broadcastHtml(sessionId: string, selector: string, html: string): void {
    this.broadcast(sessionId, (sse) => {
      sse.patchElements(html, { selector });
    });
  },
};
