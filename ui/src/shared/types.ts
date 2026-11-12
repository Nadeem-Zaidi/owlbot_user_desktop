import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type BreadCrumb={name:string,prefix:string};

export  type CustomIconProps={
  icon:IconDefinition
  onClick?:(e:any)=>void

}

export type FileStatus = "idle" | "uploading" | "done" | "error";

export type FileItem ={
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
}

export const EXT_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  md: { color: "#3B82F6", bg: "#EFF6FF", label: "MD" },
  pdf: { color: "#EF4444", bg: "#FEF2F2", label: "PDF" },
  txt: { color: "#6B7280", bg: "#F9FAFB", label: "TXT" },
  js: { color: "#F59E0B", bg: "#FFFBEB", label: "JS" },
  ts: { color: "#3B82F6", bg: "#EFF6FF", label: "TS" },
  json: { color: "#10B981", bg: "#ECFDF5", label: "JSON" },
  png: { color: "#8B5CF6", bg: "#F5F3FF", label: "PNG" },
  jpg: { color: "#EC4899", bg: "#FDF2F8", label: "JPG" },
  zip: { color: "#6B7280", bg: "#F3F4F6", label: "ZIP" },
};

export const getExt = (name: string) => name.split(".").pop()?.toLowerCase() || "";

export interface IDatabase<T>{
  getOne(id:string):Promise<T>;
  getAll():Promise<T[]>;
  createOne(e:T):Promise<T|void>;
  createMany(e:T[]):Promise<void>;
  getByField(field: string, value: any): Promise<T[]>
  deleteOne(id: string): Promise<void>
}

export interface Mappable {
    toMap(): Record<string, any>;
}

export type Message = {
  role: "user" | "bot";
  text: string;
  cancelled?: boolean;
};

export type Session={
  id:string
  userid:string
  title:string
  source?:"web"|"whatsapp"|"telegram"
  agent_id?:string|null
  agent_icon?:string|null
  agent_name?:string|null
  native_agent_id?:string|null
  native_provider?:"anthropic"|"openai"|null
  model?:string|null
  created_at:string
  updated_at:string
  // Set when the chat is pinned (favourite); shown under "Pinned" in the sidebar.
  pinned_at?:string|null

}
export type BotMessageProps = {
  text: string;
  isStreaming?: boolean;
  cancelled?: boolean;
};


export type S3Folder={
  type:string;
  name:string;
  path:string;
}

export type  S3File={
  type:string,
  name:string,
  prefix:string,
  key:string,
  size:number,
  lastModified:string,
  url:string
}

export type S3FileType=S3Folder | S3File

export type FilesResult={
  files:S3Folder[] | S3File[],
  nextToken:string | undefined |null
}

type FolderItem = { type: "folder"; name: string; path: string };
export type FileListItem = {
  type: "file";
  name: string;
  prefix: string;
  key: string;
  size: number;
  lastModified: string;
};
type ListItem = FolderItem | FileItem;

export type SortField = "name" | "size" | "modified";
export type SortDir = "asc" | "desc";
export type ViewMode = "list" | "grid";
export type ContextMenuState = { x: number; y: number; item: ListItem } | null;

export type ExtMeta = { color: string; bg: string; label: string };

export type Action = { label: string; onClick: () => void; danger?: boolean };
export type TextContent = {
    type: string;
    text: string;
    // Set when this text part carries a whole knowledge-base document (the
    // "explain this document" flow) — rendered as a compact card, not prose.
    documentName?: string;
    documentKey?: string;
    truncated?: boolean;
    totalChars?: number;
    // Instructions for the model that shouldn't show in the chat bubble.
    hidden?: boolean;
};

export type KnowledgeDocument = {
    key: string;   // S3 key / RAG source_file
    name: string;
    chunks: number;
    updatedAt: string;
};

export type DocumentContent = {
    key: string;
    name: string;
    content: string;
    truncated: boolean;
    totalChars: number;
};

export type ToolCall = {
    type: string,
    id: string,
    name: string,
    arguments: Record<string, any>
}

export type ImageUrlContent = {
    type: string;
    image_url: {
        url: string;
        detail?: 'low' | 'high' | 'auto';
    };
};

export type ImageId = {
    type: string,
    file_id: string,
    image_url?: string

}

export type FileInput = {
    type: string,
    file_id: string,
    fileName?: string,
    fileExtension?: string,
    fileUrl?: string,
    // Set only for spreadsheet uploads (csv/xls/xlsx) — lets the backend's
    // code interpreter container actually read the file instead of only
    // having an S3 link, which the container can't open.
    openaiFileId?: string
}

export type Tool = {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>
    }

}

export type ImageBase64Content = {
    type: string;
    source: {
        type: 'base64';
        media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        data: string;
    };
};

export type CodeInterpreterFileRef = {
    file_id: string;
    container_id: string;
    filename?: string;
    // When present, this is a persisted S3 copy the backend made the moment
    // the file was generated — use it directly (no live fetch needed) since
    // OpenAI's own container.file_id link dies ~20 min after the container
    // goes idle. Absent on older messages saved before this existed, which
    // still fall back to api.getCodeInterpreterFile()'s live proxy.
    url?: string;
};

export type CodeInterpreterContent = {
    type: string; // "code_interpreter"
    code: string;
    status: string;
    files?: CodeInterpreterFileRef[];
};

export type ContentPart = TextContent | ImageUrlContent | ImageBase64Content | ImageId | FileInput | ToolCall | CodeInterpreterContent;

export type LLMConfig = {
    model: string;
    apiKey?: string;
    baseURL?: string;
    temperature?: number;
    maxTokens?: number;
}

export type LLMMessageToolCall = {
    type: string;
    id: string;
    name: string;
    call_id: string;
    arguments: Record<string, any>
    output: any
}
export type LLMMessage = {
    id?: string,
    role?: 'system' | 'user' | 'assistant' | 'tool' | 'tool_call' | 'tool_call_output';
    content?: string | ContentPart[];
    name?: string;
    arguments?: Record<string, any>;
    tool_call_id?: string;
    output?: any;
    type?: string;
    isDone?:boolean
    error?:string
    cancelled?:boolean
    source_file?:string[]
    metadata?: { usage?: MessageUsage; [key: string]: unknown }
}

// Token usage of one chat turn (all model calls, incl. tool loops) — stored on the turn's final reply.
export type MessageUsage = {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    total_tokens: number;
    requests: number;
    model?: string;
    provider?: string;
}

export type ImageAttachment= {
  previewUrl: string;
  mimeType: string;
  data: string;
}

export type TextAttachment= {
  name: string;
  content: string;
}

export type FileAttachment = {
  name: string;
  extension: string;
  file: File;       // the actual blob, used for upload
  isImage: boolean;
};


export type LLMFileUploadResponse={
    name:string,
    extension:string,
    isImage:boolean,
    fileId:string,
    url:string,
    // Present only when the upload was a csv/xls/xlsx and the backend
    // successfully mirrored it to OpenAI's Files API for code interpreter.
    openaiFileId?:string

}

export type WhatsAppStatus = {
    enabled: boolean;          // server has WHATSAPP_ENABLED=true
    botConnected: boolean;     // bot number is online
    botNumber?: string;        // e.g. "919876543210"
    botState?: "starting" | "awaiting_qr" | "connected" | "disconnected" | "logged_out";
    canPair?: boolean;         // this user may pair the bot's number
    awayAvailable?: boolean;   // away message can be set (bot runs on your own number)
    pairingQr?: string;        // raw QR text while the bot waits to be paired
    link: { number: string; displayName: string | null; linkedAt: string } | null;
};

export type WhatsAppLinkCode = {
    code: string;
    expiresAt: string;
    botNumber: string;
    waLink: string;            // https://wa.me/<bot>?text=link%20OWL-XXXXXX
};
