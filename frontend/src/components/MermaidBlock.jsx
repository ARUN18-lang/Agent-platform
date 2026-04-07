import { useEffect, useRef } from "react";
import mermaid from "mermaid";

let configured = false;
let mermaidRenderSeq = 0;

function ensureMermaid() {
  if (configured) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    securityLevel: "strict",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  });
  configured = true;
}

/**
 * Renders a Mermaid diagram from fenced ```mermaid blocks in assistant messages.
 */
export default function MermaidBlock({ code }) {
  const ref = useRef(null);

  useEffect(() => {
    ensureMermaid();
    const el = ref.current;
    if (!el || !code?.trim()) return;

    let cancelled = false;
    el.innerHTML = "";
    const diagramId = `mermaid-${++mermaidRenderSeq}-${Date.now()}`;

    mermaid
      .render(diagramId, code.trim())
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      })
      .catch((err) => {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = "";
          const pre = document.createElement("pre");
          pre.className = "mermaid-error";
          pre.textContent = err?.message || String(err);
          ref.current.appendChild(pre);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return <div className="mermaid-block" ref={ref} />;
}
