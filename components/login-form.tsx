"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await signIn("credentials", {
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        redirect: false
      });
      if (!response || response.error) {
        setError("Email or password was not accepted.");
        return;
      }

      window.location.assign("/");
    } catch {
      setError("Email or password was not accepted.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" maxLength={254} required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required />
      {error && <div className="error-box" role="alert">{error}</div>}
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="login-help">New accounts are created by an authorized project operator.</p>
    </form>
  );
}
