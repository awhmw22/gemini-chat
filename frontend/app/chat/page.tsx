"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  deleteConversation,
  getConversations,
  getCurrentUser,
  getMessages,
  getToken,
  logout,
  type Conversation,
  type Message,
  type User,
} from "@/lib/api";

// ============================================================
// API
// ============================================================

const API_URL = "http://localhost:8000";

// ============================================================
// PAGE
// ============================================================

export default function ChatPage() {
  const router = useRouter();

  // ==========================================================
  // STATE
  // ==========================================================

  const [user, setUser] =
    useState<User | null>(null);

  const [input, setInput] =
    useState("");

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [conversationId, setConversationId] =
    useState<number | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [loadingConversations, setLoadingConversations] =
    useState(false);

  // ==========================================================
  // LOAD USER
  // ==========================================================

  async function loadUser() {
    try {
      const currentUser =
        await getCurrentUser();

      setUser(currentUser);
    } catch (error) {
      console.error(
        "Failed to load current user:",
        error
      );

      logout();

      router.replace("/login");
    }
  }

  // ==========================================================
  // LOAD CONVERSATIONS
  // ==========================================================

  async function loadConversations() {
    try {
      setLoadingConversations(true);

      const data =
        await getConversations();

      setConversations(data);
    } catch (error) {
      console.error(
        "Failed to load conversations:",
        error
      );

      const token =
        getToken();

      if (!token) {
        router.replace("/login");
      }
    } finally {
      setLoadingConversations(false);
    }
  }

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    const token =
      getToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    loadUser();
    loadConversations();
  }, [router]);

  // ==========================================================
  // LOAD CONVERSATION
  // ==========================================================

  async function loadConversation(
    id: number
  ) {
    if (loading) {
      return;
    }

    try {
      setLoading(true);

      const data =
        await getMessages(id);

      setMessages(data);

      setConversationId(id);
    } catch (error) {
      console.error(
        "Failed to load messages:",
        error
      );

      alert(
        "Could not load this conversation."
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // NEW CHAT
  // ==========================================================

  function startNewChat() {
    if (loading) {
      return;
    }

    setConversationId(null);

    setMessages([]);

    setInput("");
  }

  // ==========================================================
  // DELETE CONVERSATION
  // ==========================================================

  async function handleDeleteConversation(
    id: number
  ) {
    const confirmed =
      window.confirm(
        "Delete this conversation permanently?"
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteConversation(id);

      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }

      await loadConversations();
    } catch (error) {
      console.error(
        "Failed to delete conversation:",
        error
      );

      alert(
        "Could not delete the conversation."
      );
    }
  }

  // ==========================================================
  // LOGOUT
  // ==========================================================

  function handleLogout() {
    const confirmed =
      window.confirm(
        "Are you sure you want to logout?"
      );

    if (!confirmed) {
      return;
    }

    logout();

    router.replace("/login");
  }

  // ==========================================================
  // REMOVE FAILED MESSAGES
  // ==========================================================

  function removeFailedMessage(
    failedText: string
  ) {
    setMessages((previous) => {
      const updated = [...previous];

      // ------------------------------------------------------
      // Remove empty assistant placeholder
      // ------------------------------------------------------

      if (
        updated.length > 0 &&
        updated[
          updated.length - 1
        ].role === "assistant" &&
        updated[
          updated.length - 1
        ].content === ""
      ) {
        updated.pop();
      }

      // ------------------------------------------------------
      // Remove temporary user message
      // ------------------------------------------------------

      if (
        updated.length > 0 &&
        updated[
          updated.length - 1
        ].role === "user" &&
        updated[
          updated.length - 1
        ].content === failedText
      ) {
        updated.pop();
      }

      return updated;
    });
  }

  // ==========================================================
  // SEND MESSAGE
  // ==========================================================

  async function sendMessage(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const text =
      input.trim();

    // --------------------------------------------------------
    // Don't send empty messages.
    // --------------------------------------------------------

    if (!text || loading) {
      return;
    }

    // --------------------------------------------------------
    // Authentication
    // --------------------------------------------------------

    const token =
      getToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    // --------------------------------------------------------
    // Add temporary user message.
    // --------------------------------------------------------

    setMessages((previous) => [
      ...previous,
      {
        role: "user",
        content: text,
      },
    ]);

    // --------------------------------------------------------
    // Clear input.
    // --------------------------------------------------------

    setInput("");

    // --------------------------------------------------------
    // Start loading.
    // --------------------------------------------------------

    setLoading(true);

    // --------------------------------------------------------
    // Add assistant placeholder.
    // --------------------------------------------------------

    setMessages((previous) => [
      ...previous,
      {
        role: "assistant",
        content: "",
      },
    ]);

    let requestSucceeded = false;

    try {
      // ======================================================
      // REQUEST
      // ======================================================

      const response =
        await fetch(
          `${API_URL}/chat/stream`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify({
              message: text,
              conversation_id:
                conversationId,
            }),
          }
        );

      // ======================================================
      // AUTH ERROR
      // ======================================================

      if (response.status === 401) {
        removeFailedMessage(text);

        logout();

        router.replace("/login");

        return;
      }

      // ======================================================
      // SERVER ERROR
      // ======================================================

      if (!response.ok) {
        const errorText =
          await response.text();

        throw new Error(
          `Server error: ${response.status} ${errorText}`
        );
      }

      // ======================================================
      // STREAM CHECK
      // ======================================================

      if (!response.body) {
        throw new Error(
          "Server did not return a response stream."
        );
      }

      // ======================================================
      // STREAM READER
      // ======================================================

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let assistantText = "";

      let buffer = "";

      // ======================================================
      // READ STREAM
      // ======================================================

      while (true) {
        const {
          value,
          done,
        } = await reader.read();

        if (done) {
          break;
        }

        buffer +=
          decoder.decode(
            value,
            {
              stream: true,
            }
          );

        const lines =
          buffer.split("\n");

        buffer =
          lines.pop() ?? "";

        // ====================================================
        // PROCESS LINES
        // ====================================================

        for (const line of lines) {
          const trimmed =
            line.trim();

          if (!trimmed) {
            continue;
          }

          let data: any;

          try {
            data =
              JSON.parse(trimmed);
          } catch (parseError) {
            console.error(
              "Failed to parse stream JSON:",
              parseError,
              trimmed
            );

            continue;
          }

          // ==================================================
          // CONVERSATION
          // ==================================================

          if (
            data.type ===
            "conversation"
          ) {
            if (
              data.conversation_id != null
            ) {
              setConversationId(
                Number(
                  data.conversation_id
                )
              );
            }

            continue;
          }

          // ==================================================
          // TEXT CHUNK
          // ==================================================

          if (
            data.type === "chunk"
          ) {
            const chunk =
              data.content ?? "";

            assistantText +=
              chunk;

            setMessages(
              (previous) => {
                const updated =
                  [...previous];

                const lastIndex =
                  updated.length - 1;

                if (
                  lastIndex >= 0 &&
                  updated[
                    lastIndex
                  ].role === "assistant"
                ) {
                  updated[
                    lastIndex
                  ] = {
                    ...updated[
                      lastIndex
                    ],
                    content:
                      assistantText,
                  };
                }

                return updated;
              }
            );

            continue;
          }

          // ==================================================
          // DONE
          // ==================================================

          if (
            data.type === "done"
          ) {
            requestSucceeded = true;

            if (
              data.conversation_id != null
            ) {
              setConversationId(
                Number(
                  data.conversation_id
                )
              );
            }

            // Refresh sidebar only after success.
            await loadConversations();

            continue;
          }

          // ==================================================
          // BACKEND ERROR
          // ==================================================

          if (
            data.type === "error"
          ) {
            console.error(
              "Gemini backend error:",
              data.message
            );

            throw new Error(
              data.message ??
                "Gemini returned an error."
            );
          }
        }
      }

      // ======================================================
      // STREAM FINISHED
      // ======================================================

      if (!requestSucceeded) {
        throw new Error(
          "Gemini request ended without a successful completion."
        );
      }

      // ======================================================
      // EMPTY RESPONSE
      // ======================================================

      if (!assistantText.trim()) {
        throw new Error(
          "Gemini returned an empty response."
        );
      }
    } catch (error) {
      console.error(
        "Chat error:",
        error
      );

      // ------------------------------------------------------
      // Remove temporary user + assistant messages.
      // ------------------------------------------------------

      removeFailedMessage(text);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong.";

      // ------------------------------------------------------
      // Display friendly error.
      // ------------------------------------------------------

      let friendlyMessage =
        "Something went wrong. Please check the backend terminal.";

      const lowerError =
        errorMessage.toLowerCase();

      if (
        lowerError.includes("quota") ||
        lowerError.includes("rate limit")
      ) {
        friendlyMessage =
          "⚠️ Gemini API quota exceeded. Please wait a minute and try again.";
      } else if (
        errorMessage
          .toLowerCase()
          .includes("empty response")
      ) {
        friendlyMessage =
          "⚠️ Gemini returned an empty response. Please try again.";
      } else if (
        errorMessage
          .toLowerCase()
          .includes("server error")
      ) {
        friendlyMessage =
          "⚠️ The backend returned an error. Please check the backend terminal.";
      }

      setMessages(
        (previous) => [
          ...previous,
          {
            role: "assistant",
            content:
              friendlyMessage,
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl">

        {/* ==================================================
            SIDEBAR
        ================================================== */}

        <aside className="flex w-72 flex-col border-r border-gray-800 bg-gray-950">

          {/* ==================================================
              NEW CHAT
          ================================================== */}

          <div className="p-4">
            <button
              onClick={startNewChat}
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + New Chat
            </button>
          </div>

          {/* ==================================================
              CONVERSATIONS
          ================================================== */}

          <div className="flex-1 overflow-y-auto px-4">

            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Conversations
            </h2>

            {loadingConversations ? (
              <p className="text-sm text-gray-600">
                Loading...
              </p>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-gray-600">
                No conversations yet.
              </p>
            ) : (
              <div className="space-y-2">

                {conversations.map(
                  (conversation) => (
                    <div
                      key={
                        conversation.id
                      }
                      className={`group flex items-center gap-2 rounded-lg ${
                        conversation.id ===
                        conversationId
                          ? "bg-gray-800"
                          : "hover:bg-gray-900"
                      }`}
                    >

                      {/* Conversation */}

                      <button
                        onClick={() =>
                          loadConversation(
                            conversation.id
                          )
                        }
                        disabled={loading}
                        className="min-w-0 flex-1 truncate px-3 py-3 text-left text-sm text-gray-300 hover:text-white disabled:cursor-not-allowed"
                      >
                        {
                          conversation.title
                        }
                      </button>

                      {/* Delete */}

                      <button
                        onClick={() =>
                          handleDeleteConversation(
                            conversation.id
                          )
                        }
                        disabled={loading}
                        title="Delete conversation"
                        className="mr-2 rounded-md px-2 py-1 text-gray-500 opacity-0 transition hover:bg-red-950 hover:text-red-400 group-hover:opacity-100 disabled:cursor-not-allowed"
                      >
                        🗑
                      </button>

                    </div>
                  )
                )}

              </div>
            )}

          </div>

          {/* ==================================================
              USER
          ================================================== */}

          <div className="border-t border-gray-800 p-4">

            <div className="mb-3 rounded-lg bg-gray-900 p-3">

              <div className="flex items-center gap-3">

                {/* Avatar */}

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">

                  {user?.email
                    ? user.email
                        .charAt(0)
                        .toUpperCase()
                    : "U"}

                </div>

                {/* User info */}

                <div className="min-w-0 flex-1">

                  <p className="text-xs text-gray-500">
                    Signed in as
                  </p>

                  <p className="truncate text-sm font-medium text-white">
                    {user?.email ??
                      "Loading..."}
                  </p>

                </div>

              </div>

            </div>

            {/* Logout */}

            <button
              onClick={handleLogout}
              className="w-full rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-800 hover:text-white"
            >
              Logout
            </button>

          </div>

        </aside>

        {/* ====================================================
            CHAT AREA
        ==================================================== */}

        <section className="flex min-w-0 flex-1 flex-col">

          {/* ==================================================
              HEADER
          ================================================== */}

          <header className="border-b border-gray-800 px-6 py-5">

            <h1 className="text-xl font-bold">
              Huzaifa's Gemini Chat
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Full-stack AI application
            </p>

          </header>

          {/* ==================================================
              MESSAGES
          ================================================== */}

          <div className="flex-1 overflow-y-auto p-6">

            {messages.length === 0 ? (

              <div className="flex h-full items-center justify-center">

                <div className="text-center">

                  <h2 className="text-2xl font-semibold text-gray-300">
                    How can I help you?
                  </h2>

                  <p className="mt-2 text-gray-600">
                    Start a new conversation with Gemini.
                  </p>

                </div>

              </div>

            ) : (

              <div className="mx-auto max-w-4xl space-y-5">

                {messages.map(
                  (message, index) => (

                    <div
                      key={
                        message.id ??
                        index
                      }
                      className={
                        message.role ===
                        "user"
                          ? "ml-auto max-w-[85%] rounded-2xl bg-blue-600 p-4"
                          : "mr-auto max-w-[85%] rounded-2xl bg-gray-800 p-4"
                      }
                    >

                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">

                        {message.role ===
                        "user"
                          ? "You"
                          : "Gemini"}

                      </div>

                      <div className="whitespace-pre-wrap leading-7 text-gray-100">

                        {message.content}

                      </div>

                    </div>

                  )
                )}

                {/* Thinking */}

                {loading &&
                  messages[
                    messages.length - 1
                  ]?.role === "assistant" &&
                  messages[
                    messages.length - 1
                  ]?.content === "" && (

                    <div className="mr-auto rounded-2xl bg-gray-800 p-4 text-sm text-gray-400">

                      Gemini is thinking...

                    </div>

                  )}

              </div>
            )}

          </div>

          {/* ==================================================
              INPUT
          ================================================== */}

          <form
            onSubmit={sendMessage}
            className="border-t border-gray-800 p-4"
          >

            <div className="mx-auto flex max-w-4xl gap-3">

              <input
                value={input}
                onChange={(event) =>
                  setInput(
                    event.target.value
                  )
                }
                disabled={loading}
                placeholder="Ask Gemini..."
                className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={
                  loading ||
                  !input.trim()
                }
                className="rounded-xl bg-blue-600 px-6 py-3 font-medium transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Thinking..."
                  : "Send"}
              </button>

            </div>

          </form>

        </section>

      </div>
    </main>
  );
}