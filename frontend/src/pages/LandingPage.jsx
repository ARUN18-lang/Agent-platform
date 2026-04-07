import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";

const FEATURES = [
  {
    icon: "◇",
    title: "One assistant, many workflows",
    description:
      "Stop jumping between tabs. Nexus keeps context across your day so you can plan, execute, and follow up without losing the thread.",
  },
  {
    icon: "◎",
    title: "Built for how teams actually work",
    description:
      "From quick questions to multi-step projects, the same workspace adapts—whether you are coordinating with others or heads-down in focus time.",
  },
  {
    icon: "⚡",
    title: "Faster from intent to outcome",
    description:
      "Describe what you need in plain language. Nexus breaks work into clear steps and carries them through so you spend less time on busywork.",
  },
  {
    icon: "◈",
    title: "Privacy-minded by design",
    description:
      "Your conversations stay oriented around your goals. Enterprise-friendly patterns help you keep sensitive work inside boundaries you control.",
  },
  {
    icon: "✦",
    title: "Consistent quality, every session",
    description:
      "Structured reasoning and memory across turns mean you are not re-explaining the same context every time you open the app.",
  },
  {
    icon: "⬡",
    title: "Ready when you scale",
    description:
      "Start solo or roll out to a team. The same foundation supports heavier automation as your processes grow more sophisticated.",
  },
];

export default function LandingPage() {
  const [integrations, setIntegrations] = useState([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [integrationsError, setIntegrationsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
        return data;
      })
      .then((d) => {
        if (cancelled) return;
        setIntegrations(d.integrations || []);
        setIntegrationsError(null);
      })
      .catch((e) => {
        if (!cancelled) setIntegrationsError(e.message || "Could not load integrations");
      })
      .finally(() => {
        if (!cancelled) setIntegrationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedIntegrations = useMemo(() => {
    return [...integrations].sort((a, b) => Number(b.connected) - Number(a.connected));
  }, [integrations]);

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-logo">
            <span className="landing-logo-mark" aria-hidden="true">
              N
            </span>
            <span className="landing-logo-text">Nexus</span>
          </div>
          <Link to="/auth" className="landing-header-link">
            Sign in
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-eyebrow">Automation workspace</p>
          <h1 className="landing-headline">Turn scattered work into one clear conversation.</h1>
          <p className="landing-lede">
            Nexus is an AI workspace for operators, founders, and teams who want dependable help across email, calendar,
            messaging, and code—without becoming a power-user of a dozen tools.
          </p>
          <div className="landing-cta-row">
            <Link to="/auth" className="landing-btn landing-btn--primary">
              Get started
            </Link>
            <p className="landing-cta-note">Free to try · No credit card required for the demo experience</p>
          </div>
        </section>

        <section className="landing-integrations" aria-labelledby="integrations-heading">
          <h2 id="integrations-heading" className="landing-integrations-heading">
            Integrations
          </h2>

          {integrationsLoading && (
            <p className="landing-integrations-status" role="status">
              Loading integrations…
            </p>
          )}
          {integrationsError && (
            <p className="landing-integrations-error" role="alert">
              {integrationsError}
            </p>
          )}

          {!integrationsLoading && !integrationsError && (
            <div className="landing-integrations-grid">
              {sortedIntegrations.map((app) => (
                <article
                  key={app.key}
                  className={`landing-app-card ${app.connected ? "landing-app-card--live" : ""}`}
                >
                  <div className="landing-app-card-top">
                    <span className="landing-app-icon" aria-hidden="true">
                      {app.icon}
                    </span>
                    <span className={`landing-app-badge ${app.connected ? "landing-app-badge--on" : "landing-app-badge--off"}`}>
                      {app.connected ? "Active" : "Coming soon"}
                    </span>
                  </div>
                  <h3 className="landing-app-title">{app.label}</h3>
                  <p className="landing-app-desc">{app.description}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="landing-features" aria-labelledby="features-heading">
          <h2 id="features-heading" className="landing-features-heading">
            Why teams choose Nexus
          </h2>
          <div className="landing-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="landing-card">
                <div className="landing-card-icon" aria-hidden="true">
                  {f.icon}
                </div>
                <h3 className="landing-card-title">{f.title}</h3>
                <p className="landing-card-desc">{f.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} Nexus. Built for focused work.</p>
      </footer>
    </div>
  );
}
