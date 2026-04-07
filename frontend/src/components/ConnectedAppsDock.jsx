import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IntegrationBrandIcon } from "./integrationIcons.jsx";
import "./ConnectedAppsDock.css";

function IntegrationChip({ app }) {
  const desc =
    typeof app.description === "string" && app.description.trim()
      ? app.description.trim()
      : app.connected
        ? "Connected — tools available to the assistant."
        : "Not connected — enable in server environment.";
  const status = app.connected ? "Active" : "Inactive";
  const hitRef = useRef(null);
  const [tipPos, setTipPos] = useState(null);
  const tipId = useId();

  const updateTipPos = useCallback(() => {
    const el = hitRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTipPos({
      top: r.bottom + 8,
      left: r.left + r.width / 2,
    });
  }, []);

  const showTip = useCallback(() => {
    updateTipPos();
  }, [updateTipPos]);

  const hideTip = useCallback(() => {
    setTipPos(null);
  }, []);

  useEffect(() => {
    if (!tipPos) return;
    const onScroll = () => hideTip();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [tipPos, hideTip]);

  useEffect(() => {
    if (!tipPos) return;
    const onReposition = () => updateTipPos();
    window.addEventListener("resize", onReposition);
    return () => window.removeEventListener("resize", onReposition);
  }, [tipPos, updateTipPos]);

  const tooltipPortal =
    tipPos &&
    createPortal(
      <span
        id={tipId}
        className="connected-app-tooltip connected-app-tooltip--portal"
        role="tooltip"
        style={{
          position: "fixed",
          top: tipPos.top,
          left: tipPos.left,
          transform: "translateX(-50%)",
          zIndex: 99999,
        }}
      >
        <span className="connected-app-tooltip-title">{app.label}</span>
        <span className="connected-app-tooltip-status">{status}</span>
        <span className="connected-app-tooltip-desc">{desc}</span>
      </span>,
      document.body,
    );

  return (
    <>
      <span
        className="connected-app-chip"
        tabIndex={0}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
        aria-describedby={tipPos ? tipId : undefined}
      >
        <span
          ref={hitRef}
          className={`connected-app-hit ${app.connected ? "connected-app-hit--on" : ""}`}
          aria-hidden="true"
        >
          <IntegrationBrandIcon integrationKey={app.key} />
        </span>
      </span>
      {tooltipPortal}
    </>
  );
}

/**
 * @param {{ integrations: Array<{ key: string, label: string, icon: string, description?: string, connected?: boolean }>, variant?: 'header' }} props
 */
export default function ConnectedAppsDock({ integrations, variant = "header" }) {
  if (!integrations?.length) return null;
  const sorted = [...integrations].sort((a, b) => Number(b.connected) - Number(a.connected));
  return (
    <div
      className={`connected-apps-dock connected-apps-dock--${variant}`}
      aria-label="Integrations"
    >
      {sorted.map((app) => (
        <IntegrationChip key={app.key} app={app} />
      ))}
    </div>
  );
}
