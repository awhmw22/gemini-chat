const API_URL = "http://localhost:8000";

// ============================================================
// Types
// ============================================================

export type User = {
  id: number;
  email: string;
};

export type Conversation = {
  id: number;
  title: string;
  created_at?: string;
};

export type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  model?: string;
  created_at?: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
};

// ============================================================
// Token helpers
// ============================================================

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("access_token");
}

export function setToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem("access_token", token);
}

export function removeToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem("access_token");
}

export function logout(): void {
  removeToken();
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ============================================================
// Auth headers
// ============================================================

function getAuthHeaders(): HeadersInit {
  const token = getToken();

  if (!token) {
    throw new Error("Not authenticated");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

// ============================================================
// Register
// ============================================================

export async function register(
  email: string,
  password: string,
): Promise<User> {
  const response = await fetch(
    `${API_URL}/auth/register`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        email,
        password,
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail ?? "Registration failed",
    );
  }

  return data;
}

// ============================================================
// Login
// ============================================================

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await fetch(
    `${API_URL}/auth/login`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        email,
        password,
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail ?? "Login failed",
    );
  }

  if (!data.access_token) {
    throw new Error(
      "Login succeeded but no access token was returned.",
    );
  }

  setToken(data.access_token);

  return data;
}

// ============================================================
// Current user
// ============================================================

export async function getCurrentUser(): Promise<User> {
  const response = await fetch(
    `${API_URL}/auth/me`,
    {
      method: "GET",

      headers: {
        ...getAuthHeaders(),
      },
    },
  );

  if (response.status === 401) {
    removeToken();

    throw new Error("Authentication expired");
  }

  if (!response.ok) {
    throw new Error(
      `Failed to get current user: ${response.status}`,
    );
  }

  return response.json();
}

// ============================================================
// Conversations
// ============================================================

export async function getConversations(): Promise<
  Conversation[]
> {
  const response = await fetch(
    `${API_URL}/conversations`,
    {
      method: "GET",

      headers: {
        ...getAuthHeaders(),
      },
    },
  );

  if (response.status === 401) {
    removeToken();

    throw new Error("Authentication expired");
  }

  if (!response.ok) {
    throw new Error(
      `Failed to load conversations: ${response.status}`,
    );
  }

  return response.json();
}

// ============================================================
// Get conversation messages
// ============================================================

export async function getMessages(
  conversationId: number,
): Promise<Message[]> {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}`,
    {
      method: "GET",

      headers: {
        ...getAuthHeaders(),
      },
    },
  );

  if (response.status === 401) {
    removeToken();

    throw new Error("Authentication expired");
  }

  if (!response.ok) {
    throw new Error(
      `Failed to load messages: ${response.status}`,
    );
  }

  const data = await response.json();

  return data.messages ?? [];
}

// ============================================================
// Delete conversation
// ============================================================

export async function deleteConversation(
  conversationId: number,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/conversations/${conversationId}`,
    {
      method: "DELETE",

      headers: {
        ...getAuthHeaders(),
      },
    },
  );

  if (response.status === 401) {
    removeToken();

    throw new Error("Authentication expired");
  }

  if (!response.ok) {
    const data = await response.json().catch(
      () => null,
    );

    throw new Error(
      data?.detail ??
        `Failed to delete conversation: ${response.status}`,
    );
  }
}

// ============================================================
// Send normal chat message
// ============================================================

export async function sendChatMessage(
  message: string,
  conversationId: number | null,
) {
  const response = await fetch(
    `${API_URL}/chat`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },

      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
    },
  );

  if (response.status === 401) {
    removeToken();

    throw new Error("Authentication expired");
  }

  if (!response.ok) {
    const data = await response.json().catch(
      () => null,
    );

    throw new Error(
      data?.detail ??
        `Chat request failed: ${response.status}`,
    );
  }

  return response.json();
}

// ============================================================
// API URL
// ============================================================

export { API_URL };