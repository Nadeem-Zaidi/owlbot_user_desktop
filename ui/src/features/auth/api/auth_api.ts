import { onAuthStateChanged } from "@/shared/lib/firebase";
import { workspaceHeaders } from "@/shared/lib/workspace";
import { auth } from "@/shared/lib/firebase";
import type { FilesResult, Message, Session } from "@/shared/types";

// VITE_API_URL="/api" (same-origin, production) gives "" here — that's valid,
// so only fall back to the local API when the variable isn't set at all.
const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const BASE = API_URL !== undefined ? API_URL.replace(/\/api\/?$/, "") : "http://localhost:3000";

export const getAuthHeader = async () => {
  const user = auth.currentUser ?? await new Promise<any>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });

  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    // The active team workspace (none = personal space).
    ...workspaceHeaders(),
  };
};


export const api = {
  getSessions: async (): Promise<Session[]> => {
    const headers = await getAuthHeader();
    const res = await fetch(`${BASE}/sessions`, { headers });
    if (!res.ok) throw new Error("Failed to fetch sessions");

    const result = await res.json();
    return result;
  },

  newSession: async (): Promise<Session> => {
    const headers = await getAuthHeader();
    const res = await fetch(`${BASE}/api/new_session`, {
      headers,
    });
    if (!res.ok) throw new Error("Failed to create session");
    return res.json();
  },

  getMessages: async (sessionId: string): Promise<Message[]> => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${BASE}/sessions/${sessionId}/messages`, {
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const rows = await res.json();
      return rows
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({
          role: m.role === "assistant" ? "bot" : ("user" as "user" | "bot"),
          text: m.content,
        }));

    } catch (error) {
      console.log(error);
      throw error

    }

  },
  getSession: async (sessionId: string) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${BASE}/sessions/:${sessionId}/`, {
      headers,
    });
    if (!res.ok) throw new Error("Failed to fetch session");
    const result = await res.json();
    return result;
  },
  

  deleteSession: async (sessionId: string): Promise<void> => {
    const headers = await getAuthHeader();
    await fetch(`${BASE}/sessions/${sessionId}`, {
      method: "DELETE",
      headers,
    });
  },

  getFiles: async (nextToken?: string, prefix?: string | null): Promise<FilesResult> => {
    const headers = await getAuthHeader();
    try {
      const params = new URLSearchParams();
      if (nextToken) params.set("token", nextToken);
      if (prefix) params.set("prefix", prefix);

      const query = params.toString();
      const url = `${BASE}/getFiles${query ? `?${query}` : ""}`;

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) throw new Error("Failed to fetch the files");
      const result = await response.json();
      return {
        files: result.files,
        nextToken: result.nextToken
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
  deleteFile: async (keys: string[]) => {
    const headers = await getAuthHeader();
    if (!keys.length) {
      throw new Error("No files to delete")
    }
    const res = await fetch(`${BASE}/delete`, {

      method: 'DELETE',
      headers,
      body: JSON.stringify({ keys })

    });

    if (!res.ok) throw new Error('Delete Failed')
    return await res.json()


  },
  uploadFile: async (files: File[], prefix: string = ''): Promise<void> => {
    try {
      const user = auth.currentUser ?? await new Promise<any>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe();
          resolve(user);
        });
      });

      if (!user) throw new Error("Not authenticated");

      const token = await user.getIdToken();

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      formData.append('prefix', prefix);
      const res = await fetch(`${BASE}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...workspaceHeaders(),
        },
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      return res.json();
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
};
