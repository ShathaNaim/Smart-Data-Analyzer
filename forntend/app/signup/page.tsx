"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiUrl } from "../lib/api";
import { announceWorkspaceChange } from "../lib/workspace";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/auth/signup"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          typeof data?.detail === "string"
            ? data.detail
            : response.status === 422
              ? "Enter a valid email and a password of 15–128 characters."
              : "Could not create your account. Please try again.";

        throw new Error(message);
      }

      // Reload the app so previous guest UI state is discarded.
      announceWorkspaceChange();
      window.location.replace("/");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not connect. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-black text-stone-900">
          Create an account
        </h1>

        <p className="mt-2 text-sm text-stone-600">
          Registration is optional. You can continue using the app as a guest.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm font-semibold text-stone-800"
            >
              Email
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={320}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="signup-password"
              className="block text-sm font-semibold text-stone-800"
            >
              Password
            </label>
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={15}
              maxLength={128}
              aria-describedby="signup-password-hint"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
            />
            <p
              id="signup-password-hint"
              className="mt-2 text-xs text-stone-500"
            >
              Use 15–128 characters. A long passphrase works well.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-stone-950 hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-stone-600">
          Already have an account?{" "}
          <Link href="/signin" className="font-semibold text-amber-800 underline">
            Sign in
          </Link>
        </p>

        <Link
          href="/"
          className="mt-4 inline-block text-sm text-stone-600 underline"
        >
          Continue as guest
        </Link>
      </section>
    </main>
  );
}