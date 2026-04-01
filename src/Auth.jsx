import { useState } from "react";
import { supabase } from "./supabase";

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleLogin() {
    setLoading(true); setError(""); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleRegister() {
    setLoading(true); setError(""); setMessage("");
    if (password.length < 6) { setError("Passwort muss mindestens 6 Zeichen haben."); setLoading(false); return; }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    else setMessage("✓ Bestätigungs-E-Mail gesendet! Bitte E-Mail bestätigen.");
    setLoading(false);
  }

  async function handleForgot() {
    setLoading(true); setError(""); setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setError(error.message);
    else setMessage("✓ Reset-Link wurde an deine E-Mail gesendet.");
    setLoading(false);
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .auth-root {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', sans-serif;
      background:
        radial-gradient(ellipse 800px 600px at 0% 0%, #2a1200 0%, transparent 60%),
        radial-gradient(ellipse 600px 600px at 100% 0%, #1a0800 0%, transparent 55%),
        radial-gradient(ellipse 700px 500px at 50% 100%, #0d0500 0%, transparent 60%),
        #080808;
      position: relative;
    }
    .auth-root::before {
      content: '';
      position: fixed; inset: 0;
      background:
        radial-gradient(ellipse 500px 400px at 15% 25%, #ff6b2b18 0%, transparent 65%),
        radial-gradient(ellipse 400px 300px at 85% 70%, #ff4d0012 0%, transparent 60%);
      pointer-events: none;
    }
    .auth-card {
      background: linear-gradient(135deg, #ffffff0f 0%, #ffffff07 100%);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid #ffffff18;
      border-top: 1px solid #ffffff28;
      border-radius: 24px;
      padding: 40px 32px;
      width: 100%;
      max-width: 400px;
      margin: 20px;
      box-shadow: 0 8px 32px #0000004a;
      position: relative;
      z-index: 1;
    }
    .auth-title {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 32px;
      color: #ff6b2b;
      letter-spacing: 3px;
      margin-bottom: 4px;
    }
    .auth-sub {
      font-size: 11px;
      color: #ffffff44;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 32px;
    }
    .auth-label {
      font-size: 9px;
      color: #ffffff44;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .auth-input {
      background: #ffffff09;
      border: 1px solid #ffffff18;
      border-radius: 12px;
      color: #f0f0f0;
      padding: 12px 16px;
      font-family: 'Outfit', sans-serif;
      font-size: 14px;
      width: 100%;
      outline: none;
      transition: all 0.25s;
      margin-bottom: 16px;
    }
    .auth-input:focus {
      border-color: #ff6b2baa;
      background: #ff6b2b0d;
      box-shadow: 0 0 0 3px #ff6b2b22;
    }
    .auth-input::placeholder { color: #ffffff2a; }
    .auth-btn {
      background: linear-gradient(135deg, #ff5500, #ff7a35, #ff6b2b);
      border: 1px solid #ff8c4d55;
      border-top: 1px solid #ffaa7766;
      border-radius: 12px;
      color: #fff;
      cursor: pointer;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 18px;
      letter-spacing: 2px;
      padding: 14px;
      width: 100%;
      transition: all 0.3s;
      box-shadow: 0 6px 28px #ff6b2b55;
      margin-bottom: 16px;
    }
    .auth-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 36px #ff6b2b77; }
    .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .auth-link {
      background: none;
      border: none;
      color: #ff6b2b;
      cursor: pointer;
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      text-decoration: underline;
      padding: 0;
    }
    .auth-link:hover { color: #ff8c4d; }
    .auth-error {
      background: #ff444415;
      border: 1px solid #ff444433;
      border-radius: 10px;
      color: #ff6666;
      font-size: 12px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    .auth-success {
      background: #4caf8215;
      border: 1px solid #4caf8233;
      border-radius: 10px;
      color: #4caf82;
      font-size: 12px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    .auth-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .auth-divider-line { flex: 1; height: 1px; background: #ffffff12; }
    .auth-divider-text { font-size: 11px; color: #ffffff33; }
  `;

  return (
    <div className="auth-root">
      <style>{css}</style>
      <div className="auth-card">
        <div className="auth-title">BODY CHALLENGE</div>
        <div className="auth-sub">
          {mode === "login" && "Einloggen"}
          {mode === "register" && "Registrieren"}
          {mode === "forgot" && "Passwort zurücksetzen"}
        </div>

        {error && <div className="auth-error">⚠ {error}</div>}
        {message && <div className="auth-success">{message}</div>}

        <div className="auth-label">E-MAIL</div>
        <input className="auth-input" type="email" placeholder="name@example.com"
          value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : mode === "register" ? handleRegister() : handleForgot())}
        />

        {mode !== "forgot" && (
          <>
            <div className="auth-label">PASSWORT</div>
            <input className="auth-input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (mode === "login" ? handleLogin() : handleRegister())}
            />
          </>
        )}

        <button className="auth-btn" disabled={loading}
          onClick={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot}>
          {loading ? "..." : mode === "login" ? "EINLOGGEN" : mode === "register" ? "REGISTRIEREN" : "LINK SENDEN"}
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          {mode === "login" && (
            <>
              <span style={{ fontSize: 13, color: "#ffffff44" }}>
                Noch kein Account?{" "}
                <button className="auth-link" onClick={() => { setMode("register"); setError(""); setMessage(""); }}>
                  Registrieren
                </button>
              </span>
              <button className="auth-link" style={{ fontSize: 12, color: "#ffffff33" }}
                onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>
                Passwort vergessen?
              </button>
            </>
          )}
          {mode === "register" && (
            <span style={{ fontSize: 13, color: "#ffffff44" }}>
              Bereits registriert?{" "}
              <button className="auth-link" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>
                Einloggen
              </button>
            </span>
          )}
          {mode === "forgot" && (
            <button className="auth-link" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>
              ← Zurück zum Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
