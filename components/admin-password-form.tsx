"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not sign in as administrator.");
      setPassword("");
      router.replace("/admin");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign in as administrator.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="admin-password">Administrator password</label>
      <input
        id="admin-password"
        type="password"
        value={password}
        autoComplete="current-password"
        required
        maxLength={1024}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error && <p className="error-box" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Checking…" : "Open admin panel"}
      </button>
      <a className="nav-link" href="/">Return to public dashboard</a>
    </form>
  );
}
