import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import ChatWorkspace from "./ChatWorkspace.jsx";
import { isAuthenticated } from "./auth.js";

function ProtectedChat() {
  const authed = isAuthenticated();
  if (!authed) {
    return <Navigate to="/auth" replace />;
  }
  return <ChatWorkspace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/chat" element={<ProtectedChat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
