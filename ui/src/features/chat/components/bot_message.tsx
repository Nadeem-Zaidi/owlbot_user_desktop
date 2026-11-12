// // components/BotMessage.tsx
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// type Props = {
//     text: string;
//     isStreaming?: boolean;
//     cancelled?: boolean;
// };

// export const BotMessage = ({ text, isStreaming, cancelled }: Props) => {
//     return (
//         <div className="message bot_message">
//             <ReactMarkdown
//                 remarkPlugins={[remarkGfm]}
//                 components={{
//                     // code blocks
//                     code({ node, className, children, ...props }) {
//                         const isBlock = className?.includes("language-");
//                         return isBlock ? (
//                             <div className="code_block_wrapper">
//                                 <span className="code_lang">
//                                     {className?.replace("language-", "") ?? "code"}
//                                 </span>
//                                 <pre>
//                                     <code className={className} {...props}>
//                                         {children}
//                                     </code>
//                                 </pre>
//                             </div>
//                         ) : (
//                             <code className="inline_code" {...props}>
//                                 {children}
//                             </code>
//                         );
//                     },
//                     // open links in new tab
//                     a({ children, href }) {
//                         return (
//                             <a href={href} target="_blank" rel="noreferrer">
//                                 {children}
//                             </a>
//                         );
//                     }
//                 }}
//             >
//                 {text}
//             </ReactMarkdown>

//             {isStreaming && <span className="cursor">▋</span>}
//             {cancelled && <span className="cancelled_label"> ⚠ Response stopped</span>}
//         </div>
//     );
// };

type BotMessageProps = {
    text: string;
    isStreaming?: boolean;
    cancelled?: boolean;
};

// Headings, list items, quotes, **bold** or [links](…) at the start of lines.
const MARKDOWN_RE = /(^|\n)[ \t]*(#{1,6} |[*+-] |\d+\. |> )|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\)/;

// Models often put markdown (e.g. a Jira description) inside a ``` fence.
// Such blocks — no language, or md/markdown — are shown formatted, with a
// switch back to the raw text.
const isMarkdownBlock = (lang: string | null, text: string) =>
    lang === "md" || lang === "markdown" || (!lang && MARKDOWN_RE.test(text));

const CodeBlock = ({ lang, text }: { lang: string | null; text: string }) => {
    const [copied, setCopied] = useState(false);
    const [raw, setRaw] = useState(false);
    const markdown = isMarkdownBlock(lang, text);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className={`code_block_wrapper ${lang ? "" : "code_block_wrapper--text"}`}>
            <div className="code_header">
                <span className="code_lang">{lang ?? (markdown ? "markdown" : "text")}</span>
                <span className="code_actions">
                    {markdown && (
                        <button className="copy_btn" onClick={() => setRaw((r) => !r)}>
                            {raw ? "Formatted" : "Raw"}
                        </button>
                    )}
                    <button className="copy_btn" onClick={handleCopy}>
                        {copied ? "✅ Copied" : "Copy"}
                    </button>
                </span>
            </div>
            {markdown && !raw ? (
                <div className="md_block">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
                </div>
            ) : (
                <pre>
                    <code className={lang ? `language-${lang}` : undefined}>{text}</code>
                </pre>
            )}
        </div>
    );
};

const components: Components = {
    // Blocks draw their own <pre>; the default one would wrap them.
    pre({ children }) {
        return <>{children}</>;
    },
    code({ className, children, ...props }) {
        // A fenced block without a language (```) has no class,
        // but its text ends with a newline — inline code never does.
        const text = String(children);
        if (!className?.includes("language-") && !text.includes("\n")) {
            return (
                <code className="inline_code" {...props}>
                    {children}
                </code>
            );
        }
        return <CodeBlock lang={className?.replace("language-", "") ?? null} text={text.replace(/\n$/, "")} />;
    },
    a({ children, href }) {
        return (
            <a href={href} target="_blank" rel="noreferrer">
                {children}
            </a>
        );
    },
    // Tables come back from the model as plain GFM markdown
    // (remark-gfm parses the pipe syntax), but ReactMarkdown's
    // default table/thead/tr/th/td elements carry no classes —
    // they were rendering as bare, unstyled HTML tables even
    // though chat.css already has a full "MARKDOWN TABLES"
    // theme (.table_wrapper/.md_table/.md_thead/.md_th/.md_td)
    // waiting to be used. Wiring these up is what actually
    // makes generated tables look designed instead of raw.
    table({ children }) {
        return (
            <div className="table_wrapper">
                <table className="md_table">{children}</table>
            </div>
        );
    },
    thead({ children }) {
        return <thead className="md_thead">{children}</thead>;
    },
    tr({ children }) {
        return <tr className="md_tr">{children}</tr>;
    },
    th({ children }) {
        return <th className="md_th">{children}</th>;
    },
    td({ children }) {
        return <td className="md_td">{children}</td>;
    },
    hr() {
        return <hr className="bot_message_hr" />;
    },
};

export const BotMessage = ({ text, isStreaming, cancelled }: BotMessageProps) => (
    <div className="message bot_message">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {text}
        </ReactMarkdown>
        {isStreaming && <span className="cursor">▋</span>}
        {cancelled && (
            <span className="cancelled_label">⚠ Response stopped</span>
        )}
    </div>
);