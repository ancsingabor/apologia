"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/shared/Button";
import { Input } from "@/components/shared/Input";
import { ErrorMessage } from "@/components/shared/ErrorMessage";
import { copy } from "@/config/copy";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-primary-border bg-primary-subtle px-4 py-3">
        <p className="text-sm text-primary">{copy.login.checkEmail}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <Input
        type="email"
        label={copy.login.emailLabel}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <Button
        type="submit"
        className="w-full"
        loading={status === "loading"}
      >
        {copy.login.submit}
      </Button>
    </form>
  );
}
