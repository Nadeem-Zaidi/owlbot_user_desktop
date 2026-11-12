import { onAuthStateChanged } from "@/shared/lib/firebase";
import { onWorkspaceForbidden, workspaceHeaders } from "@/shared/lib/workspace";
import { auth } from "@/shared/lib/firebase";

export abstract class BaseApi {
    protected baseUrl: string
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl

    }
    protected async getHeader() {
        const user = auth.currentUser ?? await new Promise<any>((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe()
                resolve(user)
            })

        });

        if (!user) {
            throw new Error("Not authenticated")
        }

        const token = await user.getIdToken();
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            // The active team workspace (none = personal space).
            ...workspaceHeaders(),
        };

    }

    protected async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const headers = await this.getHeader();

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers: {
                ...headers,
                ...options.headers,
            },
        });

        if (!response.ok) {
            let message = "Something went wrong";

            try {
                const error = await response.json();
                // Removed from the workspace (or it was deleted): back to personal.
                if (response.status === 403 && error?.code === "workspace_forbidden") onWorkspaceForbidden();
                message = error.error ?? error.message ?? message;
            } catch {
                message = await response.text();
            }

            throw new Error(message);
        }

        // 204 No Content (e.g. deletes) has no body to parse.
        if (response.status === 204) return undefined as T;
        return await response.json() as T;
    }

    protected buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
        if (!params) return "";
        const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
        if (entries.length === 0) return "";
        return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
    }

    protected get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
        return this.request<T>(`${path}${this.buildQuery(params)}`, {
            method: "GET",
        });
    }

    protected delete<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
        return this.request<T>(`${path}${this.buildQuery(params)}`, {
            method: "DELETE",
        });
    }



    protected post<T>(path: string, body?: unknown): Promise<T> {
        return this.request<T>(path, {
            method: "POST",
            body: body ? JSON.stringify(body) : undefined,
        });
    }

    protected put<T>(path: string, body?: unknown): Promise<T> {
        return this.request<T>(path, {
            method: "PUT",
            body: body ? JSON.stringify(body) : undefined,
        });
    }


}
