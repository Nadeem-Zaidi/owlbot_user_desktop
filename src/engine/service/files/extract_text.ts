import path from "node:path";

// Turns a file a user gives an agent into plain text, on this computer.
// The original file isn't kept: agents read and search the text.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARS = 2_000_000;

export type FileKind = "pdf" | "word" | "excel" | "csv" | "text";
export type Extracted = { kind: FileKind; text: string; truncated: boolean };

const TEXT_EXTS = new Set([
    "txt", "md", "markdown", "json", "jsonl", "xml", "html", "htm", "yaml", "yml", "log", "ini", "toml", "cfg", "conf", "env", "rst", "tex", "sql",
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "kt", "cs", "go", "rs", "rb", "php", "c", "h", "cpp", "hpp", "swift", "scala", "sh", "bash", "ps1", "bat", "css", "scss", "vue", "svelte", "r", "m", "lua", "dart",
]);

export const ACCEPTED_EXTENSIONS = ["pdf", "docx", "xlsx", "csv", "tsv", ...TEXT_EXTS];

export class ExtractError extends Error {
    readonly status = 400;
}

const extOf = (name: string) => path.extname(name).slice(1).toLowerCase();

export async function extractText(name: string, data: Buffer): Promise<Extracted> {
    if (data.length > MAX_UPLOAD_BYTES) throw new ExtractError(`"${name}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
    const ext = extOf(name);
    let kind: FileKind;
    let text: string;
    try {
        if (ext === "pdf") [kind, text] = ["pdf", await pdfText(data)];
        else if (ext === "docx") [kind, text] = ["word", await docxText(data)];
        else if (ext === "xlsx" || ext === "xlsm") [kind, text] = ["excel", await xlsxText(data)];
        else if (ext === "csv" || ext === "tsv") [kind, text] = ["csv", plainText(name, data)];
        else if (ext === "xls" || ext === "doc" || ext === "ppt") throw new ExtractError(`Old Office files (.${ext}) aren't supported — save it as .${ext}x and upload that.`);
        else if (TEXT_EXTS.has(ext) || !ext) [kind, text] = ["text", plainText(name, data)];
        else throw new ExtractError(`".${ext}" files aren't supported. Use PDF, Word (.docx), Excel (.xlsx), CSV or a text/code file.`);
    } catch (err) {
        if (err instanceof ExtractError) throw err;
        throw new ExtractError(`Couldn't read "${name}": ${err instanceof Error ? err.message : String(err)}`);
    }

    text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
    if (!text) {
        throw new ExtractError(kind === "pdf"
            ? `"${name}" has no text to read — it's probably a scanned PDF (images only). Run it through OCR first.`
            : `"${name}" is empty.`);
    }
    const truncated = text.length > MAX_TEXT_CHARS;
    return { kind, text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, truncated };
}

function plainText(name: string, data: Buffer): string {
    if (data.subarray(0, 8000).includes(0)) throw new ExtractError(`"${name}" looks like a binary file, not text.`);
    return data.toString("utf-8").replace(/^﻿/, "");
}

async function pdfText(data: Buffer): Promise<string> {
    const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await pdfExtract(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    return pages.map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join("\n\n");
}

async function docxText(data: Buffer): Promise<string> {
    const mammoth = await import("mammoth");
    const r = await (mammoth.default ?? mammoth).extractRawText({ buffer: data });
    return r.value;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

async function xlsxText(data: Buffer): Promise<string> {
    const ExcelJS = await import("exceljs");
    const wb = new (ExcelJS.default ?? ExcelJS).Workbook();
    await wb.xlsx.load(data as any);
    const parts: string[] = [];
    wb.eachSheet((ws) => {
        const lines: string[] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
            const cells: string[] = [];
            for (let c = 1; c <= row.cellCount; c++) cells.push(csvCell(row.getCell(c).text ?? ""));
            while (cells.length && !cells[cells.length - 1]) cells.pop();
            if (cells.length) lines.push(cells.join(","));
        });
        if (lines.length) parts.push(`## Sheet: ${ws.name} (${lines.length} rows, CSV)\n${lines.join("\n")}`);
    });
    return parts.join("\n\n");
}

// Pieces of about `size` characters, split at paragraph or line breaks where
// possible, for the full-text index.
export function chunkText(text: string, size = 1200): string[] {
    const chunks: string[] = [];
    let current = "";
    const push = () => { if (current.trim()) chunks.push(current.trim()); current = ""; };
    for (const para of text.split(/\n{2,}/)) {
        if (current.length + para.length + 2 <= size) {
            current += (current ? "\n\n" : "") + para;
            continue;
        }
        push();
        if (para.length <= size) { current = para; continue; }
        // A long paragraph (a big table, a page with no blank lines): split by lines, then hard.
        for (const line of para.split("\n")) {
            if (current.length + line.length + 1 > size) push();
            if (line.length > size) {
                for (let i = 0; i < line.length; i += size) chunks.push(line.slice(i, i + size));
            } else current += (current ? "\n" : "") + line;
        }
    }
    push();
    return chunks;
}

// A user's words → an FTS5 query matching any of them (best matches first by bm25).
export function ftsQuery(query: string): string | null {
    const words = [...new Set((query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((w) => w.length > 1))].slice(0, 16);
    return words.length ? words.map((w) => `"${w}"`).join(" OR ") : null;
}
