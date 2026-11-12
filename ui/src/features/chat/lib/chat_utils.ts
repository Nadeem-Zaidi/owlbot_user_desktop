import type { ContentPart, DocumentContent, TextContent } from "@/shared/types";

// "uid/folder/report.pdf" → "report.pdf"
export const displayName = (key: string) => key.split("/").pop() || key;

export const isTextPart = (p: ContentPart): p is TextContent =>
  (p.type === "text" || p.type === "input_text") && typeof (p as TextContent).text === "string";

// Older saves (or a backend that drops unknown fields) still carry the
// <document> wrapper, so recognise the card from the text too.
const DOC_WRAPPER = /^<document name="([^"]*)">/;

export function asDocumentPart(p: ContentPart): TextContent | null {
  if (!isTextPart(p)) return null;
  if (p.documentName) return p;
  const match = p.text.match(DOC_WRAPPER);
  return match ? { ...p, documentName: match[1] } : null;
}

// Instruction sent with every message while "Search knowledge base" is on.
export const KB_SEARCH_INSTRUCTION: TextContent = {
  type: "text",
  hidden: true,
  text:
    "[Instruction: answer this using the search_knowledge_base tool first. " +
    "Base the answer on the documents it returns and name the documents you used.]",
};

// Message parts for "explain this document in detail": a visible request,
// hidden guidance for the model, and the document itself (shown as a card).
export function buildExplainDocumentParts(doc: DocumentContent): TextContent[] {
  const escapedName = doc.name.replace(/"/g, "'");
  return [
    { type: "text", text: `Explain the topics covered in “${doc.name}” in detail.` },
    {
      type: "text",
      hidden: true,
      text:
        "[Instruction: the full text of the document is attached below. Walk through every main topic " +
        "and section in order. For each one, explain the concepts clearly, define key terms, give a " +
        "concrete example, and say how it connects to the other topics. Use a heading per topic and " +
        "finish with a short summary of the key takeaways. Base the explanation on the document; if you " +
        "add background from general knowledge, say so." +
        (doc.truncated
          ? ` Only the first ${doc.content.length.toLocaleString()} of ${doc.totalChars.toLocaleString()} characters are included; mention that the rest wasn't covered.`
          : "") +
        "]",
    },
    {
      type: "text",
      text: `<document name="${escapedName}">\n${doc.content}\n</document>`,
      documentName: doc.name,
      documentKey: doc.key,
      truncated: doc.truncated,
      totalChars: doc.totalChars,
    },
  ];
}
