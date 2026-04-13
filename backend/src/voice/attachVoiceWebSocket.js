import jwt from "jsonwebtoken";
import { WebSocketServer } from "ws";
import {
  insertVoiceSegment,
  processVoiceSegmentAsync,
  voiceInputsCol,
} from "../services/voiceInputs.js";
import { broadcastVoiceEvent, subscribeVoiceStream } from "./voiceSubscribers.js";

function jwtSecret() {
  return process.env.JWT_SECRET?.trim() || "";
}

function verifyTokenFromUrl(url) {
  const secret = jwtSecret();
  if (!secret) return { error: "JWT_SECRET not configured" };
  let token;
  try {
    const u = new URL(url, "http://localhost");
    token = u.searchParams.get("token")?.trim();
  } catch {
    return { error: "Invalid URL" };
  }
  if (!token) return { error: "Missing token" };
  try {
    const payload = jwt.verify(token, secret);
    const id = payload.sub;
    const email = payload.email;
    if (!id || !email) return { error: "Invalid token" };
    return { userId: String(id), email: String(email) };
  } catch {
    return { error: "Invalid or expired token" };
  }
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * @param {import('http').Server} server
 */
export function attachVoiceWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 12 * 1024 * 1024 });

  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host || "localhost";
    let pathname;
    try {
      pathname = new URL(request.url || "", `http://${host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== "/api/agent/voice/ws") {
      return;
    }

    const auth = verifyTokenFromUrl(`http://${host}${request.url || ""}`);
    if (auth.error) {
      socket.write(`HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n${auth.error}`);
      socket.destroy();
      return;
    }

    if (!voiceInputsCol()) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\nMongoDB required");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, auth);
    });
  });

  wss.on("connection", (ws, _req, auth) => {
    const userId = auth.userId;
    ws.send(JSON.stringify({ type: "ready", message: "Send subscribe then segment messages." }));

    ws.on("message", async (data, isBinary) => {
      if (isBinary) {
        ws.send(JSON.stringify({ type: "error", message: "Expected JSON text control messages only" }));
        return;
      }

      const raw = data.toString();
      const msg = safeJsonParse(raw);
      if (!msg || typeof msg !== "object") {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (msg.type === "subscribe") {
        const streamId = typeof msg.streamId === "string" ? msg.streamId.trim() : "";
        if (!streamId || streamId.length > 128) {
          ws.send(JSON.stringify({ type: "error", message: "subscribe requires streamId" }));
          return;
        }
        subscribeVoiceStream(userId, streamId, ws);
        ws.send(JSON.stringify({ type: "subscribed", streamId }));
        return;
      }

      if (msg.type === "segment") {
        const streamId = typeof msg.streamId === "string" ? msg.streamId.trim() : "";
        const segmentIndex = Number(msg.segmentIndex);
        const mimeType = typeof msg.mimeType === "string" ? msg.mimeType : "audio/webm";
        const b64 = typeof msg.data === "string" ? msg.data : "";

        if (!streamId || streamId.length > 128) {
          ws.send(JSON.stringify({ type: "error", message: "segment requires streamId" }));
          return;
        }
        if (!Number.isFinite(segmentIndex) || segmentIndex < 0) {
          ws.send(JSON.stringify({ type: "error", message: "segment requires segmentIndex" }));
          return;
        }
        if (!b64) {
          ws.send(JSON.stringify({ type: "error", message: "segment requires base64 data" }));
          return;
        }

        let buf;
        try {
          buf = Buffer.from(b64, "base64");
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Invalid base64" }));
          return;
        }
        if (!buf.length) {
          ws.send(JSON.stringify({ type: "error", message: "Empty audio" }));
          return;
        }

        subscribeVoiceStream(userId, streamId, ws);

        try {
          const docId = await insertVoiceSegment({
            userId,
            streamId,
            segmentIndex,
            mimeType,
            audioBuffer: buf,
          });

          ws.send(
            JSON.stringify({
              type: "segment_accepted",
              segmentId: docId.toString(),
              streamId,
              segmentIndex,
              status: "pending",
            })
          );

          void processVoiceSegmentAsync(docId, (evt) => {
            if (evt.type === "transcript" || evt.type === "transcript_error") {
              broadcastVoiceEvent(userId, streamId, evt);
            }
          });
        } catch (e) {
          console.error("voice ws segment:", e);
          ws.send(
            JSON.stringify({
              type: "error",
              message: e?.message || "Could not store segment",
            })
          );
        }
        return;
      }

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      ws.send(JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` }));
    });
  });

  return wss;
}
