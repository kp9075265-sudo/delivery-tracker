"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    await signOut({ redirectTo: "/login" });
  }

  return (
    <button className="secondary-button sign-out-button" type="button" onClick={() => void submit()} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
