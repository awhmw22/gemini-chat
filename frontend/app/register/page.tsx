"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  isLoggedIn,
  setToken,
} from "@/lib/api";


export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");


  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/chat");
    }
  }, [router]);


  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");

    if (password.length < 8) {
      setError(
        "Password must be at least 8 characters.",
      );

      return;
    }

    if (password !== confirmPassword) {
      setError(
        "Passwords do not match.",
      );

      return;
    }

    setLoading(true);

    try {

      // ==========================================
      // Register
      // ==========================================

      const registerResponse =
        await fetch(
          "http://127.0.0.1:8000/auth/register",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              email,
              password,
            }),
          },
        );


      const registerData =
        await registerResponse.json();


      if (!registerResponse.ok) {
        throw new Error(
          registerData.detail ||
            "Registration failed",
        );
      }


      // ==========================================
      // Automatically login
      // ==========================================

      const loginResponse =
        await fetch(
          "http://127.0.0.1:8000/auth/login",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              email,
              password,
            }),
          },
        );


      const loginData =
        await loginResponse.json();


      if (!loginResponse.ok) {
        throw new Error(
          loginData.detail ||
            "Registration succeeded, but login failed.",
        );
      }


      setToken(
        loginData.access_token,
      );


      router.replace("/chat");

    } catch (error) {

      setError(
        error instanceof Error
          ? error.message
          : "Registration failed.",
      );

    } finally {

      setLoading(false);

    }
  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white">

      <div className="w-full max-w-md">

        <div className="mb-8 text-center">

          <h1 className="text-3xl font-bold">
            Create your account
          </h1>

          <p className="mt-2 text-gray-400">
            Start chatting with Gemini
          </p>

        </div>


        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-xl"
        >

          {error && (
            <div className="mb-5 rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
              {error}
            </div>
          )}


          <div className="space-y-5">

            <div>

              <label className="mb-2 block text-sm font-medium text-gray-300">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value,
                  )
                }
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />

            </div>


            <div>

              <label className="mb-2 block text-sm font-medium text-gray-300">
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value,
                  )
                }
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />

            </div>


            <div>

              <label className="mb-2 block text-sm font-medium text-gray-300">
                Confirm password
              </label>

              <input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(
                    event.target.value,
                  )
                }
                placeholder="Repeat your password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />

            </div>


            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Creating account..."
                : "Create account"}
            </button>

          </div>


          <p className="mt-6 text-center text-sm text-gray-400">

            Already have an account?{" "}

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/login",
                )
              }
              className="font-medium text-blue-400 hover:text-blue-300"
            >
              Sign in
            </button>

          </p>

        </form>

      </div>

    </main>
  );
}