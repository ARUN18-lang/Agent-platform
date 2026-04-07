import "./Sidebar.css";

function truncateTitle(text, max = 36) {
  if (!text || typeof text !== "string") return "";
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export default function Sidebar({
  persistence,
  sessionsLoading,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  collapsed,
  onToggleCollapse,
  wide,
  onToggleWide,
  onSignOut,
}) {
  return (
    <aside
      className={`sidebar ${collapsed ? "sidebar--collapsed" : ""} ${wide && !collapsed ? "sidebar--wide" : ""}`}
      aria-label="Navigation"
    >
      <div className="sidebar-toolbar">
        {!collapsed && (
          <div className="sidebar-brand-block">
            <div className="logo">
              <span className="logo-mark" aria-hidden="true">
                N
              </span>
              <span className="logo-text">NEXUS</span>
            </div>
            <p className="logo-sub">Automation workspace</p>
          </div>
        )}
        {collapsed && (
          <div className="sidebar-brand-collapsed" aria-hidden="true">
            <span className="logo-mark">N</span>
          </div>
        )}
        <div className="sidebar-toolbar-actions">
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand panel" : "Minimize panel"}
            aria-label={collapsed ? "Expand panel" : "Minimize panel"}
          >
            {collapsed ? "⟩" : "⟨"}
          </button>
          {!collapsed && (
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={onToggleWide}
              title={wide ? "Default panel width" : "Wider panel"}
              aria-label={wide ? "Default panel width" : "Wider panel"}
            >
              {wide ? "⊟" : "⊞"}
            </button>
          )}
        </div>
      </div>

      {!collapsed && persistence && (
        <div className="sidebar-section sidebar-section--sessions">
          <div className="section-row">
            <div className="section-label">Conversations</div>
            <button type="button" className="section-action" onClick={onNewChat} disabled={sessionsLoading}>
              New
            </button>
          </div>
          {sessionsLoading && (
            <div className="loading-pill" role="status" aria-live="polite">
              <span className="dot-pulse" aria-hidden="true" />
              Loading…
            </div>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <p className="sessions-hint">No saved conversations yet. Start one from the main area.</p>
          )}
          <ul className="session-list" aria-label="Your conversations">
            {sessions.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <li key={s.id} className={`session-item ${active ? "session-item--active" : ""}`}>
                  <button
                    type="button"
                    className="session-item-main"
                    onClick={() => onSelectSession(s.id)}
                    title={s.title}
                  >
                    <span className="session-item-title">{truncateTitle(s.title, 40)}</span>
                    {s.messageCount > 0 && (
                      <span className="session-item-meta">{s.messageCount} messages</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="session-item-delete"
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
              );
            })}
          </ul>
        </div>
      )}

      {!collapsed && !persistence && !sessionsLoading && (
        <div className="sidebar-section sidebar-section--sessions">
          <div className="section-label">Conversations</div>
          <p className="sessions-off-hint">
            Connect a database on the server to save and switch between multiple chats. This session is only kept in your
            browser for now.
          </p>
        </div>
      )}

      <div className="sidebar-section sidebar-section--grow sidebar-section--spacer" aria-hidden="true" />

      {!collapsed && onSignOut && (
        <div className="sidebar-footer">
          <button type="button" className="sidebar-sign-out" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
