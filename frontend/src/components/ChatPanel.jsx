import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { authHeaders } from "../api.js";
import MermaidBlock from "./MermaidBlock.jsx";
import "./ChatPanel.css";

/** @param {Array<{ attachments?: Array<{ id: string, filename?: string, kind?: string }> }>} steps */
function uniqueAttachmentsFromSteps(steps) {
  const seen = new Set();
  const out = [];
  for (const s of steps || []) {
    for (const a of s.attachments || []) {
      if (!a?.id || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/** @param {{ id: string, filename?: string, kind?: string }} att */
async function downloadExportToDisk(att) {
  const res = await fetch(`/api/exports/${encodeURIComponent(att.id)}`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    let msg = res.statusText || `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.filename || (att.kind === "pdf" ? "document.pdf" : "presentation.pptx");
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function PresentationDownloadBar({ attachments }) {
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);

  if (!attachments?.length) return null;

  const download = async (att) => {
    setErr(null);
    setBusyId(att.id);
    try {
      await downloadExportToDisk(att);
    } catch (e) {
      setErr(e?.message || "Download failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="presentation-download-bar" role="region" aria-label="Generated presentation files">
      <div className="presentation-download-bar-inner">
        <span className="presentation-download-label">Presentation ready</span>
        <div className="presentation-download-actions">
          {attachments.map((att) => (
            <button
              key={att.id}
              type="button"
              className="presentation-download-btn"
              disabled={busyId === att.id}
              onClick={() => download(att)}
            >
              {busyId === att.id
                ? "Downloading…"
                : att.kind === "pdf"
                  ? `Download PDF${att.filename ? ` (${att.filename})` : ""}`
                  : `Download presentation${att.filename ? ` (${att.filename})` : ""}`}
            </button>
          ))}
        </div>
      </div>
      {err ? (
        <p className="presentation-download-err" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

const EXAMPLE_PROMPTS = [
  "List my GitHub repos and pick one — summarize open issues",
  "Post a short status update to Slack (I’ll paste the real channel when asked)",
  "Search Jira for open issues in my project and list the top five",
  "Draft a short email reply summarizing the latest thread from alerts@company.com",
  "Check WhatsApp Business status and outline how to message a customer safely",
  "Sketch a Mermaid flowchart of our request → router → MCP tools → response path",
];

const MARKDOWN_COMPONENTS = {
  code({ className, children, ...props }) {
    const lang = /language-(\w+)/.exec(className || "")?.[1];
    const text = String(children).replace(/\n$/, "");
    if (lang === "mermaid") {
      return <MermaidBlock code={text} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

function StepAttachmentDownload({ att }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  return (
    <div className="step-attachment-download">
      <button
        type="button"
        className="step-export-download-btn"
        disabled={busy}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            await downloadExportToDisk(att);
          } catch (e) {
            setErr(e?.message || "Download failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Downloading…" : att.kind === "pdf" ? "Download PDF" : "Download file"}
      </button>
      {err ? (
        <span className="step-export-err" role="alert">
          {err}
        </span>
      ) : null}
    </div>
  );
}

function parseNamespacedTool(name) {
  if (!name || typeof name !== "string") return { server: null, short: name || "" };
  const idx = name.indexOf("__");
  if (idx === -1) return { server: null, short: name };
  return {
    server: name.slice(0, idx),
    short: name.slice(idx + 2),
  };
}

function StepCopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const t = typeof text === "string" ? text : JSON.stringify(text, null, 2);
    void navigator.clipboard?.writeText(t).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button type="button" className="step-copy" onClick={copy} title={`Copy ${label}`}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StepsLog({ steps, live }) {
  const [open, setOpen] = useState(!!live);

  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);

  const doneCount = steps.filter((s) => s.result != null || s.success === false).length;

  return (
    <div className={`steps-container ${live ? "steps-container--live" : ""}`}>
      <button
        type="button"
        className="steps-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="steps-toggle-main">
          <span className="steps-icon" aria-hidden="true">
            ⚡
          </span>
          <span className="steps-title">Tool activity</span>
          <span className="steps-meta">
            {doneCount}/{steps.length} done
          </span>
        </span>
        <span className="steps-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="steps-body">
          {steps.map((step, i) => (
            <StepRow key={`${step.tool}-${i}`} step={step} index={i} isLast={i === steps.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * E2B run_code returns JSON with results[].png (base64). Extract images for display; shorten PNG in text preview.
 * @returns {{ images: string[], previewText: string } | null}
 */
function parseE2BRunOutput(raw) {
  if (typeof raw !== "string" || raw.length < 20) return null;
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || !Array.isArray(j.results)) return null;
    const images = [];
    const stripped =
      typeof structuredClone === "function" ? structuredClone(j) : JSON.parse(JSON.stringify(j));
    for (const r of stripped.results) {
      if (r && typeof r.png === "string" && r.png.length > 100) {
        images.push(`data:image/png;base64,${r.png}`);
        r.png = `[PNG chart, ${r.png.length} base64 characters — rendered above]`;
      }
    }
    return { images, previewText: JSON.stringify(stripped, null, 2) };
  } catch {
    return null;
  }
}

function StepRow({ step, index, isLast }) {
  const { server, short } = parseNamespacedTool(step.tool);
  const pending = step.result == null && step.success !== false;
  const failed = step.success === false;
  const done = !pending && !failed;
  const e2bCharts =
    step.tool === "e2b__run_code" && step.result != null ? parseE2BRunOutput(String(step.result)) : null;

  return (
    <div
      className={`step-item ${failed ? "failed" : done ? "done" : "pending"}`}
      style={{ "--step-i": index }}
    >
      <div className="step-rail" aria-hidden="true">
        <span className="step-rail-dot" />
        {!isLast && <span className="step-rail-line" />}
      </div>
      <div className="step-main">
        <div className="step-header">
          <span className="step-status" aria-hidden="true">
            {failed ? "✗" : done ? "✓" : "↻"}
          </span>
          <div className="step-tool-row">
            {server && <span className="step-server">{server}</span>}
            <code className="step-tool">{short || step.tool}</code>
          </div>
        </div>
        {step.args && Object.keys(step.args).length > 0 && (
          <div className="step-block">
            <div className="step-block-head">
              <span>Input</span>
              <StepCopyButton text={JSON.stringify(step.args, null, 2)} label="input" />
            </div>
            <pre className="step-args">{JSON.stringify(step.args, null, 2)}</pre>
          </div>
        )}
        {step.result != null && step.result !== "" && (
          <div className="step-block">
            <div className="step-block-head">
              <span>Output</span>
              <StepCopyButton text={String(step.result)} label="output" />
            </div>
            {e2bCharts?.images?.length > 0 && (
              <div className="step-e2b-charts" role="group" aria-label="Charts from code execution">
                {e2bCharts.images.map((src, i) => (
                  <img
                    key={`${step.tool}-${i}`}
                    className="step-e2b-chart-img"
                    src={src}
                    alt={`Chart ${i + 1} from sandbox`}
                  />
                ))}
              </div>
            )}
            <pre className="step-result">{e2bCharts?.previewText ?? String(step.result)}</pre>
            {step.attachments?.length > 0 && (
              <div className="step-attachments">
                {step.attachments.map((att) => (
                  <StepAttachmentDownload key={att.id} att={att} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IconSpreadsheetAttach() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v18M9 12h12" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V6m0 0l-4.5 4.5M12 6l4.5 4.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IconImageCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="M21 15l-4-4-6 6" />
    </svg>
  );
}

function AssistantMessage({ msg, markdownComponents }) {
  const bodyRef = useRef(null);
  const [flash, setFlash] = useState(null);
  const exportAttachments = uniqueAttachmentsFromSteps(msg.steps);

  const mayHaveVisual =
    /```mermaid|!\[[^\]]*\]\([^)]+\)|<img[\s>]/i.test(msg.content || "") ||
    /<svg[\s>]/i.test(msg.content || "");

  const flashDone = (key) => {
    setFlash(key);
    setTimeout(() => setFlash((f) => (f === key ? null : f)), 1600);
  };

  const copyResponse = () => {
    const t = msg.content || "";
    void navigator.clipboard?.writeText(t).then(() => flashDone("text"));
  };

  const copyVisual = () => {
    const root = bodyRef.current;
    const svg = root?.querySelector(".mermaid-block svg");
    if (svg) {
      void navigator.clipboard?.writeText(svg.outerHTML).then(() => flashDone("img"));
      return;
    }
    const img = root?.querySelector("img");
    if (img?.src) {
      void navigator.clipboard?.writeText(img.src).then(() => flashDone("img"));
      return;
    }
    const m = /!\[[^\]]*\]\((https?:[^)\s]+)\)/.exec(msg.content || "");
    if (m) {
      void navigator.clipboard?.writeText(m[1]).then(() => flashDone("img"));
      return;
    }
    flashDone("img-none");
  };

  return (
    <div className="assistant-message-wrap">
      <div className="assistant-msg-toolbar" role="toolbar" aria-label="Message actions">
        <button
          type="button"
          className="assistant-symbol-btn"
          onClick={copyResponse}
          title="Copy response"
          aria-label="Copy response"
        >
          <IconCopy />
        </button>
        <button
          type="button"
          className={`assistant-symbol-btn ${mayHaveVisual ? "" : "assistant-symbol-btn--dim"}`}
          onClick={copyVisual}
          title={mayHaveVisual ? "Copy diagram (SVG) or image link" : "Copy diagram or image if present"}
          aria-label="Copy diagram or image"
        >
          <IconImageCopy />
        </button>
        {flash === "text" && <span className="assistant-copy-toast">Copied</span>}
        {flash === "img" && <span className="assistant-copy-toast">Copied</span>}
        {flash === "img-none" && <span className="assistant-copy-toast assistant-copy-toast--warn">Nothing to copy</span>}
      </div>
      <div className="assistant-bubble">
        {msg.steps?.length > 0 && (
          <div className="assistant-tools">
            <StepsLog steps={msg.steps} />
          </div>
        )}
        <PresentationDownloadBar attachments={exportAttachments} />
        <div className="markdown assistant-markdown" ref={bodyRef}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {msg.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({
  toolsError,
  messages,
  setMessages,
  onConversationUpdated,
  onNewChat,
  onRunningChange,
}) {
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [liveSteps, setLiveSteps] = useState([]);
  /** @type {React.MutableRefObject<HTMLInputElement | null>} */
  const fileInputRef = useRef(null);
  /** Pending uploads for the next message (max 5) */
  const [pendingFiles, setPendingFiles] = useState([]);
  const pendingFilesRef = useRef([]);
  const [uploadError, setUploadError] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const msgIdRef = useRef(0);

  const nextMsgId = useCallback(() => {
    msgIdRef.current += 1;
    return `m-${msgIdRef.current}`;
  }, []);

  const schedulePersist = useCallback(
    (next) => {
      if (!onConversationUpdated) return;
      queueMicrotask(() => {
        void onConversationUpdated(next);
      });
    },
    [onConversationUpdated]
  );

  const liveExportAttachments = uniqueAttachmentsFromSteps(liveSteps);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveSteps, isRunning]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    let max = 0;
    for (const m of messages) {
      const match = /^m-(\d+)$/.exec(m.id || "");
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    msgIdRef.current = max;
  }, [messages]);

  const clearChat = useCallback(() => {
    if (isRunning) return;
    setMessages([]);
    msgIdRef.current = 0;
    setLiveSteps([]);
    setPendingFiles([]);
    pendingFilesRef.current = [];
    setUploadError(null);
    schedulePersist([]);
  }, [isRunning, setMessages, schedulePersist]);

  const removePendingFile = useCallback((id) => {
    setPendingFiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      pendingFilesRef.current = next;
      return next;
    });
  }, []);

  const onPickSpreadsheet = useCallback(async (e) => {
    const list = e.target?.files;
    e.target.value = "";
    if (!list?.length || isRunning) return;
    setUploadError(null);
    for (const file of Array.from(list)) {
      if (pendingFilesRef.current.length >= 5) {
        setUploadError("Maximum 5 files per message.");
        break;
      }
      const lower = file.name.toLowerCase();
      if (!/\.(csv|xlsx|xls)$/.test(lower)) {
        setUploadError("Only .csv, .xlsx, or .xls files are supported.");
        continue;
      }
      const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setPendingFiles((prev) => {
        if (prev.length >= 5) return prev;
        const next = [...prev, { id: localId, filename: file.name || "attachment", uploading: true }];
        pendingFilesRef.current = next;
        return next;
      });
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/agent/attachments", {
          method: "POST",
          headers: { ...authHeaders() },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPendingFiles((prev) => {
            const next = prev.filter((p) => p.id !== localId);
            pendingFilesRef.current = next;
            return next;
          });
          setUploadError(data?.error || res.statusText || "Upload failed");
          continue;
        }
        const id = data?.id != null ? String(data.id) : "";
        const filename =
          typeof data.filename === "string" && data.filename.trim()
            ? data.filename.trim()
            : file.name || "attachment";
        if (!id) {
          setPendingFiles((prev) => {
            const next = prev.filter((p) => p.id !== localId);
            pendingFilesRef.current = next;
            return next;
          });
          setUploadError("Invalid upload response");
          continue;
        }
        setPendingFiles((prev) => {
          const next = prev.map((p) =>
            p.id === localId ? { id, filename, uploading: false } : p
          );
          pendingFilesRef.current = next;
          return next;
        });
      } catch (err) {
        setPendingFiles((prev) => {
          const next = prev.filter((p) => p.id !== localId);
          pendingFilesRef.current = next;
          return next;
        });
        setUploadError(err?.message || "Upload failed");
      }
    }
  }, [isRunning]);

  const sendMessage = async (text) => {
    const inputBeforeSend = input;
    const typed = text != null ? String(text).trim() : inputBeforeSend.trim();
    const hasUploading = pendingFiles.some((p) => p.uploading);
    const readyFiles = pendingFiles.filter((p) => !p.uploading);
    const userText =
      typed ||
      (readyFiles.length > 0 ? "Analyze the attached file(s) and report insights relevant to my question." : "");
    if (!userText || isRunning || hasUploading) return;
    if (!typed.trim() && readyFiles.length === 0) return;

    const filesSnapshot = readyFiles.map((p) => ({ id: p.id, filename: p.filename }));
    const attachmentIds = filesSnapshot.map((p) => p.id);
    const attachmentNames = filesSnapshot
      .map((p) => p.filename)
      .filter((n) => typeof n === "string" && n.trim());

    setInput("");
    setPendingFiles([]);
    pendingFilesRef.current = [];
    setUploadError(null);
    setIsRunning(true);
    onRunningChange?.(true);
    setLiveSteps([]);

    const userMsg = {
      id: nextMsgId(),
      role: "user",
      content: userText,
      ...(attachmentNames.length ? { attachmentNames } : {}),
    };
    const history = [...messages, userMsg];
    setMessages(history);
    schedulePersist(history);

    const apiMessages = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content ?? "" }));

    let sseEvent = "message";
    let streamSettled = false;

    const rollbackUserTurn = () => {
      setInput(inputBeforeSend);
      setPendingFiles(filesSnapshot);
      pendingFilesRef.current = filesSnapshot;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "user" && last?.id === userMsg.id) {
          const next = prev.slice(0, -1);
          schedulePersist(next);
          return next;
        }
        return prev;
      });
    };

    const dispatchSse = (eventName, data) => {
      if (eventName === "error") {
        const assistantMsg = {
          id: nextMsgId(),
          role: "assistant",
          content: `**Something went wrong** — ${data.message || "Please try again."}`,
          steps: [],
        };
        setMessages((prev) => {
          const next = [...prev, assistantMsg];
          schedulePersist(next);
          return next;
        });
        setLiveSteps([]);
        setIsRunning(false);
        onRunningChange?.(false);
        streamSettled = true;
        return;
      }

      if (eventName === "done") {
        const assistantMsg = {
          id: nextMsgId(),
          role: "assistant",
          content: data.content ?? "",
          steps: data.steps || [],
        };
        setMessages((prev) => {
          const next = [...prev, assistantMsg];
          schedulePersist(next);
          return next;
        });
        setLiveSteps([]);
        setIsRunning(false);
        onRunningChange?.(false);
        streamSettled = true;
        return;
      }

      if (eventName === "status") {
        /* optional: could show data.status in UI */
        return;
      }

      if (eventName === "tool_call") {
        setLiveSteps((prev) => [...prev, { tool: data.tool, args: data.args }]);
        return;
      }

      if (eventName === "tool_result") {
        setLiveSteps((prev) => {
          const idx = prev.findIndex((s) => s.tool === data.tool && s.result === undefined);
          const attachments = Array.isArray(data.attachments) ? data.attachments : [];
          if (idx < 0) {
            return [...prev, { tool: data.tool, result: data.result, success: data.success, attachments }];
          }
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            result: data.result,
            success: data.success,
            attachments,
          };
          return next;
        });
      }
    };

    const feedLine = (line) => {
      if (!line.trim()) return;
      if (line.startsWith("event: ")) {
        sseEvent = line.slice(7).trim();
        return;
      }
      if (line.startsWith("data: ")) {
        const raw = line.slice(6);
        try {
          const data = JSON.parse(raw);
          dispatchSse(sseEvent, data);
        } catch {
          /* ignore malformed chunk */
        }
        sseEvent = "message";
      }
    };

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          messages: apiMessages,
          ...(attachmentIds.length ? { attachmentIds } : {}),
        }),
      });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/event-stream")) {
        const errText = await res.text();
        let msg = errText || res.statusText || `HTTP ${res.status}`;
        try {
          const j = JSON.parse(errText);
          if (j.error) msg = j.error;
        } catch {
          /* plain text */
        }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      sseEvent = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          feedLine(line);
        }
      }

      for (const line of buffer.split("\n")) {
        feedLine(line);
      }
    } catch (err) {
      rollbackUserTurn();
      const assistantMsg = {
        id: nextMsgId(),
        role: "assistant",
        content: `**Could not reach the assistant** — ${err.message}`,
        steps: [],
      };
      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        schedulePersist(next);
        return next;
      });
      setIsRunning(false);
      onRunningChange?.(false);
      streamSettled = true;
      setLiveSteps([]);
    }

    if (!streamSettled) {
      rollbackUserTurn();
      const assistantMsg = {
        id: nextMsgId(),
        role: "assistant",
        content:
          "**Stream ended unexpectedly** — your draft and attachments were restored; try sending again.",
        steps: [],
      };
      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        schedulePersist(next);
        return next;
      });
      setIsRunning(false);
      onRunningChange?.(false);
    }

    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-panel chat-panel--workspace">
      {toolsError && (
        <div className="chat-banner chat-banner--warn chat-banner--inline" role="status">
          Some integrations could not be loaded. You can still chat; connected tools may be limited.
        </div>
      )}

      <div className="messages-area" role="log" aria-label="Conversation">
        {messages.length === 0 && !isRunning && (
          <div className="empty-state">
            <div className="empty-glow" aria-hidden="true" />
            <h2 className="empty-headline">What&apos;s on your mind today?</h2>
            <p className="empty-sub">
              Ask anything — email, calendar, code, diagrams, or your connected apps. The assistant uses tools when
              they&apos;re available.
            </p>
            <div className="example-prompts">
              {EXAMPLE_PROMPTS.map((p) => (
                <button key={p} type="button" className="example-chip" onClick={() => sendMessage(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <article key={msg.id} className={`message-row message-row--${msg.role}`}>
            <div className="message-avatar" aria-hidden="true">
              {msg.role === "user" ? "You" : "AI"}
            </div>
            <div className="message-body">
              {msg.role === "user" ? (
                <div className="user-bubble">
                  {(Array.isArray(msg.attachmentNames) ? msg.attachmentNames : []).filter(Boolean).length >
                    0 && (
                    <div className="user-attachment-chips" aria-label="Attached files">
                      {(Array.isArray(msg.attachmentNames) ? msg.attachmentNames : [])
                        .filter(Boolean)
                        .map((n, i) => (
                          <span key={`${n}-${i}`} className="user-attachment-chip" title={n}>
                            📎 {n}
                          </span>
                        ))}
                    </div>
                  )}
                  <div className="user-bubble-text">{msg.content}</div>
                </div>
              ) : (
                <AssistantMessage msg={msg} markdownComponents={MARKDOWN_COMPONENTS} />
              )}
            </div>
          </article>
        ))}

        {isRunning && (
          <article className="message-row message-row--assistant message-row--live" aria-busy="true">
            <div className="message-avatar message-avatar--pulse" aria-hidden="true">
              AI
            </div>
            <div className="message-body">
              <div className="assistant-bubble assistant-bubble--live">
                {liveSteps.length > 0 && (
                  <div className="assistant-tools">
                    <StepsLog steps={liveSteps} live />
                  </div>
                )}
                <PresentationDownloadBar attachments={liveExportAttachments} />
                <div className="thinking" aria-label="Working">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </div>
              </div>
            </div>
          </article>
        )}

        <div ref={bottomRef} className="scroll-anchor" />
      </div>

      <div className="input-area">
        <div className="input-area-stack">
          <div className="input-toolbar">
            {messages.length > 0 && (
              <button
                type="button"
                className="input-clear-chat"
                onClick={clearChat}
                disabled={isRunning}
                title="Clear messages in this chat"
              >
                Clear chat
              </button>
            )}
          </div>
          {uploadError ? (
            <p className="chat-upload-err" role="alert">
              {uploadError}
            </p>
          ) : null}
          {pendingFiles.length > 0 ? (
            <div className="pending-attachments" aria-label="Files to send with next message">
              {pendingFiles.map((p) => (
                <span
                  key={p.id}
                  className={`pending-attachment-chip ${p.uploading ? "pending-attachment-chip--busy" : ""}`}
                >
                  <span className="pending-attachment-name" title={p.filename}>
                    {p.uploading ? (
                      <span className="pending-upload-dot" aria-hidden="true" />
                    ) : (
                      <span className="pending-attach-icon" aria-hidden="true">
                        📎
                      </span>
                    )}
                    {p.filename}
                    {p.uploading ? (
                      <span className="pending-upload-label">Uploading…</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="pending-attachment-remove"
                    onClick={() => removePendingFile(p.id)}
                    disabled={isRunning || p.uploading}
                    aria-label={`Remove ${p.filename}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            multiple
            className="chat-file-input-hidden"
            tabIndex={-1}
            aria-hidden
            onChange={onPickSpreadsheet}
          />
          <div className="input-box input-box--pill">
            <button
              type="button"
              className="chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning}
              title="Attach CSV or Excel"
              aria-label="Attach CSV or Excel"
            >
              <IconSpreadsheetAttach />
            </button>
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Ask anything"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={isRunning}
              aria-label="Message"
            />
            <button
              type="button"
              className={`send-btn ${isRunning ? "disabled" : input.trim() || pendingFiles.length ? "active" : ""}`}
              onClick={() => sendMessage()}
              disabled={
                isRunning ||
                pendingFiles.some((p) => p.uploading) ||
                (!input.trim() && pendingFiles.filter((p) => !p.uploading).length === 0)
              }
              title="Send"
              aria-label="Send message"
            >
              {isRunning ? <span className="spin-sm" aria-hidden="true" /> : <SendIcon />}
            </button>
          </div>
        </div>
        <div className="input-footer">
          <p className="input-hint">
            <kbd>Enter</kbd> send · <kbd>Shift</kbd>+<kbd>Enter</kbd> line break · spreadsheet icon attaches CSV/Excel
            {pendingFiles.some((p) => p.uploading) ? (
              <span className="input-hint--dim"> · wait for uploads to finish before sending</span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
