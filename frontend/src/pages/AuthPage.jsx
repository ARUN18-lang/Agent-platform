import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAuthenticated, setSession } from "../auth.js";
import "./AuthPage.css";

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/chat", { replace: true });
    }
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = mode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      if (!data.token) {
        setError("Invalid response from server.");
        return;
      }
      setSession(data.token, data.user?.email);
      navigate("/chat", { replace: true });
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <Link to="/" className="auth-back">
          ← Back
        </Link>
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            N
          </span>
          <span className="auth-brand-text">Nexus</span>
        </div>

        <h1 className="auth-title">{mode === "signin" ? "Welcome back" : "Create your workspace"}</h1>
        <p className="auth-subtitle">
          {mode === "signin"
            ? "Sign in to open your assistant and continue where you left off."
            : "Set up your account to start chatting with Nexus."}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={`auth-tab ${mode === "signin" ? "auth-tab--active" : ""}`}
            onClick={() => {
              setMode("signin");
              setError("");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={`auth-tab ${mode === "signup" ? "auth-tab--active" : ""}`}
            onClick={() => {
              setMode("signup");
              setError("");
            }}
          >
            Sign up
          </button>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-label">
            Email
            <input
              type="email"
              className="auth-input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>
          <label className="auth-label">
            Password
            <input
              type="password"
              className="auth-input"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </label>
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="auth-demo-note">
          Accounts are stored in MongoDB on your server. Chat and tools require a valid sign-in session.
        </p>
      </div>
    </div>
  );
}
