import { ServerSentEventGenerator } from '@starfederation/datastar-sdk';

/** Map<sessionId, Set<ServerSentEventGenerator>> */
const registry = new Map();

export const sseRegistry = {
  connect(sessionId, userId, req, res) {
    ServerSentEventGenerator.stream(req, res, async (sse) => {
      if (!registry.has(sessionId)) registry.set(sessionId, new Set());
      registry.get(sessionId).add(sse);

      req.on('close', () => {
        const clients = registry.get(sessionId);
        if (clients) {
          clients.delete(sse);
          if (clients.size === 0) registry.delete(sessionId);
        }
      });

      sse.patchSignals({ sessionId, connected: true });
    }, { keepalive: true });
  },

  broadcast(sessionId, fn) {
    const clients = registry.get(sessionId);
    if (!clients) return;
    for (const sse of clients) {
      try { fn(sse); } catch { clients.delete(sse); }
    }
  },

  broadcastScoreUpdate(sessionId, entry) {
    this.broadcast(sessionId, (sse) => {
      sse.patchSignals({
        [`score_${entry.participant_id}_${entry.category_id ?? 'total'}_${entry.round ?? 0}`]: entry.value,
      });
    });
  },

  broadcastFullRefresh(sessionId) {
    this.broadcast(sessionId, (sse) => {
      sse.patchSignals({ needsRefresh: true });
    });
  },

  broadcastSessionComplete(sessionId) {
    this.broadcast(sessionId, (sse) => {
      sse.patchSignals({ sessionStatus: 'completed' });
    });
  },

  broadcastHtml(sessionId, selector, html) {
    this.broadcast(sessionId, (sse) => {
      sse.patchElements(html, { selector });
    });
  },
};
