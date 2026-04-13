/** @typedef {import('ws').WebSocket} WS */

const streamSubscribers = new Map();

/**
 * @param {string} userId
 * @param {string} streamId
 * @param {WS} ws
 */
export function subscribeVoiceStream(userId, streamId, ws) {
  const key = `${userId}:${streamId}`;
  const prev = ws.voiceStreamKey;
  if (prev && prev !== key) {
    streamSubscribers.get(prev)?.delete(ws);
    if (streamSubscribers.get(prev)?.size === 0) {
      streamSubscribers.delete(prev);
    }
  }

  if (!streamSubscribers.has(key)) {
    streamSubscribers.set(key, new Set());
  }
  streamSubscribers.get(key).add(ws);
  ws.voiceStreamKey = key;

  if (!ws.voiceCloseHooked) {
    ws.voiceCloseHooked = true;
    ws.on("close", () => {
      const k = ws.voiceStreamKey;
      if (!k) return;
      streamSubscribers.get(k)?.delete(ws);
      if (streamSubscribers.get(k)?.size === 0) {
        streamSubscribers.delete(k);
      }
    });
  }
}

/**
 * @param {string} userId
 * @param {string} streamId
 * @param {object} payload
 */
export function broadcastVoiceEvent(userId, streamId, payload) {
  const key = `${userId}:${streamId}`;
  const set = streamSubscribers.get(key);
  if (!set) return;
  const raw = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === 1) {
      try {
        ws.send(raw);
      } catch {
        /* ignore */
      }
    }
  }
}
