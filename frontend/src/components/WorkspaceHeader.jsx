import { useState, useRef, useEffect } from "react";
import ConnectedAppsDock from "./ConnectedAppsDock.jsx";
import "./WorkspaceHeader.css";

function truncateTitle(text, max = 42) {
  if (!text || typeof text !== "string") return "";
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

export default function WorkspaceHeader({
  persistence,
  sessionsLoading,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onSignOut,
  isRunning,
  theme,
  onThemeChange,
  integrations,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    let raf = 0;
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    raf = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [menuOpen]);

  return (
    <header className="workspace-header">
      <div className="workspace-header-inner">
        <div className="workspace-brand">
          <span className="workspace-logo-mark" aria-hidden="true">
            N
          </span>
          <span className="workspace-logo-text">Nexus</span>
        </div>

        <ConnectedAppsDock integrations={integrations} variant="header" />

        <div className="workspace-header-spacer" />

        <div className="workspace-theme-toggle" role="group" aria-label="Theme">
          <button
            type="button"
            className={`workspace-theme-btn ${theme === "light" ? "workspace-theme-btn--active" : ""}`}
            onClick={() => onThemeChange?.("light")}
            title="Light theme"
            aria-pressed={theme === "light"}
          >
            <IconSun />
            <span>Light</span>
          </button>
          <button
            type="button"
            className={`workspace-theme-btn ${theme === "dark" ? "workspace-theme-btn--active" : ""}`}
            onClick={() => onThemeChange?.("dark")}
            title="Dark theme"
            aria-pressed={theme === "dark"}
          >
            <IconMoon />
            <span>Dark</span>
          </button>
        </div>

        {persistence && (
          <div className="workspace-session-wrap" ref={menuRef}>
            <button
              type="button"
              className="workspace-session-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              disabled={sessionsLoading}
            >
              <span className="workspace-session-label">
                {sessionsLoading
                  ? "Loading…"
                  : truncateTitle(sessions.find((s) => s.id === activeSessionId)?.title || "Conversation", 28)}
              </span>
              <span className="workspace-session-chevron" aria-hidden="true">
                ▾
              </span>
            </button>
            {menuOpen && (
              <div className="workspace-session-menu" role="listbox">
                <button
                  type="button"
                  className="workspace-session-menu-new"
                  onClick={() => {
                    setMenuOpen(false);
                    onNewChat?.();
                  }}
                >
                  New conversation
                </button>
                <ul className="workspace-session-list">
                  {sessions.length === 0 && !sessionsLoading && (
                    <li className="workspace-session-empty">No saved conversations yet.</li>
                  )}
                  {sessions.map((s) => (
                    <li key={s.id} className={s.id === activeSessionId ? "is-active" : ""}>
                      <button
                        type="button"
                        className="workspace-session-item"
                        onClick={() => {
                          onSelectSession(s.id);
                          setMenuOpen(false);
                        }}
                      >
                        {truncateTitle(s.title, 44)}
                        {s.messageCount > 0 && (
                          <span className="workspace-session-meta">{s.messageCount} msgs</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="workspace-session-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(s.id);
                        }}
                        title="Delete conversation"
                        aria-label={`Delete ${s.title}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!persistence && !sessionsLoading && (
          <span className="workspace-local-hint" title="Enable MongoDB on the server to save chats">
            Local session
          </span>
        )}

        <button
          type="button"
          className="workspace-icon-text-btn"
          onClick={onNewChat}
          disabled={isRunning}
          title="New chat"
        >
          New chat
        </button>

        {isRunning && (
          <span className="workspace-running-pill" role="status">
            <span className="workspace-running-dot" aria-hidden="true" />
            Working
          </span>
        )}

        {onSignOut && (
          <button type="button" className="workspace-sign-out" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
