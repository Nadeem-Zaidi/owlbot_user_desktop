import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getAuth, onAuthStateChanged, type User } from "@/shared/lib/firebase";
function waitForAuthUser(): Promise<User | null> {
    const auth = getAuth();
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}
// Search-index (RAG) state of a file — see RagStatus in knowledge_base.ts.
export type RagStatus =
    | { status: "indexed"; chunks: number }
    | { status: "not_indexed" }
    | { status: "copy"; of: string }
    | { status: "unsupported" };

export interface CloudFile {
    key: string;
    name: string;
    lastModified: string | null;
    size?: number;
    url?: string;
    // Missing when the server couldn't read the index status.
    rag?: RagStatus;
}

export interface IndexFilesResponse {
    indexed: number;
    failed: number;
    // Files left over when { all: true } found more than one request handles.
    remaining: number;
    results: ({ key: string; status: "indexed"; chunks: number } | { key: string; status: "failed"; error: string })[];
}

export interface ListFilesResponse {
    files: CloudFile[];
    continuationToken?: string | null;
}

export interface ListFilesArgs {
    continuationToken?: string;
    // When set, the backend switches /list_files into search mode: it walks
    // every page under the user's prefix server-side (S3 has no substring
    // search — see storage_routes.ts) and returns matches directly, with no
    // continuationToken, since a search result set isn't meant to be paged
    // through the same way a plain listing is.
    search?: string;
}

export interface UploadFilesResponse {
    uploaded: number;
}

export interface DeleteFilesResponse {
    message: string;
    deleted: number;
}

// Storage routes (list_files/upload/delete) are mounted at the app root
// (see gateway/vanilla_gateway.ts: app.use("/", storageRoutes.getRouter())),
// not under "/api" like the chat routes — chat/api.ts already handles this
// correctly for the same routes via its storageBaseUrl getter. This was
// hardcoded to "http://localhost:3000" instead, which only ever worked when
// the browser itself was on the same machine as the backend — on any other
// device (a phone hitting the deployed server) that resolves to the
// device's own localhost, where nothing is listening, so every request
// here failed outright ("Couldn't load files"). Deriving it from
// VITE_API_URL the same way fixes both: in production VITE_API_URL is the
// same-origin "/api", stripped down to "" (relative to whatever host
// actually loaded the page); in local dev it's "http://localhost:3000/api",
// stripped down to "http://localhost:3000".
const STORAGE_BASE_URL = (import.meta.env.VITE_API_URL as string ?? "").replace(/\/api\/?$/, "");

export const storageApi = createApi({
    reducerPath: "storageApi",
    baseQuery: fetchBaseQuery({
        baseUrl: STORAGE_BASE_URL,
        prepareHeaders: async ( headers) => {
            const user = await waitForAuthUser();
            if (user) {
                const token = await user.getIdToken();
                headers.set("Authorization", `Bearer ${token}`);
            }
            return headers;
        },
    }),
    tagTypes: ["File"],
    endpoints: (builder) => ({
        listFiles: builder.query<ListFilesResponse, ListFilesArgs | undefined>({
            query: (args) => {
                const params: Record<string, string> = {};
                if (args?.continuationToken) params.continuationToken = args.continuationToken;
                if (args?.search) params.search = args.search;
                return {
                    url: "/list_files",
                    params: Object.keys(params).length ? params : undefined,
                };
            },
            // RTK Query caches each distinct arg shape separately, so a search
            // query and the plain listing don't clobber each other's cache —
            // switching the search box back to empty falls right back to the
            // already-cached first page instead of refetching.
            providesTags: (result) =>
                result?.files
                    ? [
                        ...result.files.map((f) => ({ type: "File" as const, id: f.key })),
                        { type: "File" as const, id: "LIST" },
                    ]
                    : [{ type: "File" as const, id: "LIST" }],
        }),

        uploadFiles: builder.mutation<UploadFilesResponse, { files: File[]; prefix?: string }>({
            query: ({ files, prefix }) => {
                const formData = new FormData();
                files.forEach((file) => formData.append("files", file));
                formData.append("prefix", prefix ?? "");
                return { url: "/upload", method: "POST", body: formData };
                // fetchBaseQuery detects FormData and skips JSON stringify/content-type — no extra config needed.
            },
            invalidatesTags: [{ type: "File", id: "LIST" }], // this is the whole payoff: upload succeeds → list auto-refetches
        }),

        // Builds the search index for files already in storage (uploads are
        // indexed automatically). { keys } for specific files, { all: true }
        // for every file that isn't indexed yet.
        indexFiles: builder.mutation<IndexFilesResponse, { keys: string[] } | { all: true }>({
            query: (body) => ({ url: "/index_files", method: "POST", body }),
            invalidatesTags: [{ type: "File", id: "LIST" }],
        }),

        deleteFiles: builder.mutation<DeleteFilesResponse, string[]>({
            query: (keys) => ({
                url: "/delete",
                method: "DELETE",
                body: { keys },
            }),
            // invalidate the specific rows deleted plus the list itself, so the
            // table refetches and the removed files disappear without a manual reload
            invalidatesTags: (_result, _error, keys) => [
                ...keys.map((key) => ({ type: "File" as const, id: key })),
                { type: "File" as const, id: "LIST" },
            ],
        }),
    }),
});

export const { useListFilesQuery, useUploadFilesMutation, useDeleteFilesMutation, useIndexFilesMutation } = storageApi;