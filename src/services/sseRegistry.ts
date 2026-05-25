import { ServerSentEventGenerator } from '@starfederation/datastar-sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';

const registry = new Map<string, Set<ServerSentEventGenerator>>();

export interface ScoreEntry {
  participant_id: string | number;
  category_id?: string | number | null;
  round?: number | null;
  value: number;
}

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

  broadcastScoreUpdate(sessionId: string, entry: ScoreEntry): void {
    this.broadcast(sessionId, (sse) => {
      sse.patchSignals(JSON.stringify({
        [`score_${entry.participant_id}_${entry.category_id ?? 'total'}_${entry.round ?? 0}`]: entry.value,
      }));
    });
  },

  broadcastFullRefresh(sessionId: string): void {
    this.broadcast(sessionId, (sse) => {
      sse.patchSignals(JSON.stringify({ needsRefresh: true }));
    });
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
