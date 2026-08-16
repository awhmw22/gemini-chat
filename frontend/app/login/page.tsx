"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  isLoggedIn,
  login,
} from "@/lib/api";


export default function LoginPage() {

  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");


  // ==========================================================
  // Redirect already logged-in users
  // ==========================================================

  useEffect(() => {

    if (isLoggedIn()) {
      router.replace("/chat");
    }

  }, [router]);


  // ==========================================================
  // Login
  // ==========================================================

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ) {

    event.preventDefault();

    setError("");

    const cleanEmail =
      email.trim();

    if (!cleanEmail) {
      setError(
        "Please enter your email.",
      );
      return;
    }

    if (!password) {
      setError(
        "Please enter your password.",
      );
      return;
    }

    setLoading(true);

    try {

      await login(
        cleanEmail,
        password,
      );

      // IMPORTANT:
      // Redirect only after the login
      // request has successfully completed.

      router.replace("/chat");

    } catch (error) {

      console.error(
        "Login error:",
        error,
      );

      setError(
        error instanceof Error
          ? error.message
          : "Login failed.",
      );

    } finally {

      setLoading(false);

    }
  }


  // ==========================================================
  // UI
  // ==========================================================

  return (

    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white">

      <div className="w-full max-w-md">

        <div className="mb-8 text-center">

          <h1 className="text-3xl font-bold">
            Welcome back
          </h1>

          <p className="mt-2 text-gray-400">
            Sign in to your Gemini Chat account.
          </p>

        </div>


        <form
          onSubmit={handleLogin}
          className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-xl"
        >

          {/* Email */}

          <div className="mb-5">

            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-gray-300"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none transition focus:border-blue-500 disabled:opacity-50"
            />

          </div>


          {/* Password */}

          <div className="mb-5">

            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-gray-300"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              placeholder="Your password"
              autoComplete="current-password"
              disabled={loading}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none transition focus:border-blue-500 disabled:opacity-50"
            />

          </div>


          {/* Error */}

          {error && (

            <div className="mb-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">

              {error}

            </div>

          )}


          {/* Submit */}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >

            {loading
              ? "Signing in..."
              : "Sign in"}

          </button>

        </form>

      </div>

    </main>

  );
}