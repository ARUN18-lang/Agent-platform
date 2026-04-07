import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import "./App.css";
import { clearSession } from "./auth.js";
import { fetchJson, authHeaders } from "./api.js";

const CHAT_THEME_KEY = "nexus-chat-theme";

function readStoredChatTheme() {
  try {
    const v = localStorage.getItem(CHAT_THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

export default function ChatWorkspace() {
  const navigate = useNavigate();
  const [toolsError, setToolsError] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  const [persistence, setPersistence] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [workspaceTheme, setWorkspaceTheme] = useState(() =>
    typeof window !== "undefined" ? readStoredChatTheme() : "light"
  );

  const handleSignOut = useCallback(() => {
    clearSession();
    navigate("/", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("root-chat-light", "root-chat-dark");
    if (workspaceTheme === "light") html.classList.add("root-chat-light");
    else html.classList.add("root-chat-dark");
    try {
      localStorage.setItem(CHAT_THEME_KEY, workspaceTheme);
    } catch {
      /* ignore */
    }
    return () => {
      html.classList.remove("root-chat-light", "root-chat-dark");
    };
  }, [workspaceTheme]);

  useEffect(() => {
    fetchJson("/api/tools")
      .then(() => setToolsError(null))
      .catch((e) => setToolsError(e.message || "Could not load integrations"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations")
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (!cancelled) setIntegrations(Array.isArray(d.integrations) ? d.integrations : []);
      })
      .catch(() => {
        if (!cancelled) setIntegrations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const d = await fetchJson("/api/sessions");
      setPersistence(d.persistence === true);
      setSessions(d.sessions || []);
      return d;
    } catch {
      setPersistence(false);
      setSessions([]);
      return { sessions: [], persistence: false };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSessionsLoading(true);
      try {
        const d = await fetchJson("/api/sessions");
        if (cancelled) return;
        const hasPersistence = d.persistence === true;
        setPersistence(hasPersistence);
        const list = d.sessions || [];
        setSessions(list);
        if (hasPersistence) {
          if (list.length === 0) {
            const created = await fetchJson("/api/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            if (!cancelled && created.session) {
              setSessions([created.session]);
              setActiveSessionId(created.session.id);
            }
          } else if (!cancelled) {
            setActiveSessionId((prev) => prev ?? list[0].id);
          }
        } else if (!cancelled) {
          setActiveSessionId(null);
        }
      } catch {
        if (!cancelled) {
          setPersistence(false);
          setSessions([]);
          setActiveSessionId(null);
        }
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!persistence || !activeSessionId) return;
    let cancelled = false;
    setMessages([]);
    fetchJson(`/api/sessions/${activeSessionId}`)
      .then((d) => {
        if (!cancelled) setMessages(d.session?.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [persistence, activeSessionId]);

  const persistMessages = useCallback(
    async (msgs) => {
      if (!persistence || !activeSessionId) return;
      try {
        const d = await fetchJson(`/api/sessions/${activeSessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgs }),
        });
        const s = d.session;
        if (s) {
          setSessions((prev) =>
            prev.map((x) =>
              x.id === activeSessionId
                ? {
                    ...x,
                    title: s.title,
                    updatedAt: s.updatedAt,
                    messageCount:
                      s.messageCount ?? msgs.filter((m) => m.role === "user" || m.role === "assistant").length,
                  }
                : x
            )
          );
        }
      } catch (e) {
        console.warn("Save failed:", e.message);
      }
    },
    [persistence, activeSessionId]
  );

  const handleNewChat = useCallback(async () => {
    if (!persistence) {
      setMessages([]);
      return;
    }
    try {
      const d = await fetchJson("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (d.session) {
        setSessions((prev) => [d.session, ...prev.filter((x) => x.id !== d.session.id)]);
        setActiveSessionId(d.session.id);
        setMessages([]);
      }
    } catch (e) {
      console.warn("Could not start a new conversation:", e.message);
    }
  }, [persistence]);

  const handleSelectSession = useCallback((id) => {
    setActiveSessionId(id);
  }, []);

  const handleDeleteSession = useCallback(
    async (id) => {
      if (!persistence) return;
      const wasActive = activeSessionId === id;
      try {
        const r = await fetch(`/api/sessions/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
        if (!r.ok && r.status !== 404) return;
      } catch {
        return;
      }
      const d = await refreshSessions();
      if (!wasActive) return;
      const list = d.sessions || [];
      if (list.length > 0) {
        setActiveSessionId(list[0].id);
      } else {
        try {
          const created = await fetchJson("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (created.session) {
            await refreshSessions();
            setActiveSessionId(created.session.id);
            setMessages([]);
          }
        } catch {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    },
    [persistence, activeSessionId, refreshSessions]
  );

  return (
    <div className={`app-shell ${workspaceTheme === "light" ? "app-shell--light" : "app-shell--dark"}`}>
      <WorkspaceHeader
        persistence={persistence}
        sessionsLoading={sessionsLoading}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onSignOut={handleSignOut}
        isRunning={isRunning}
        theme={workspaceTheme}
        onThemeChange={setWorkspaceTheme}
        integrations={integrations}
      />
      <main className="main-content">
        <ChatPanel
          key={activeSessionId || (persistence ? "loading" : "local")}
          toolsError={toolsError}
          messages={messages}
          setMessages={setMessages}
          onConversationUpdated={persistMessages}
          onNewChat={handleNewChat}
          onRunningChange={setIsRunning}
        />
      </main>
    </div>
  );
}
