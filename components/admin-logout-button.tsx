"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not end the admin session. Try again.");
      router.replace("/");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not end the admin session. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="secondary-button sign-out-button" type="button" onClick={() => void logout()} disabled={loading}>
        {loading ? "Signing out…" : "Admin log out"}
      </button>
      {error && <span role="alert" className="notification-error">{error}</span>}
    </>
  );
}
