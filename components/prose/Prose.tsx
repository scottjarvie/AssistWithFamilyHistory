"use client";

/**
 * Prose — the single markdown renderer for owner-authored story content.
 *
 * Replaces the `whitespace-pre-wrap` divs that dumped raw markdown (literal `#`,
 * `**`, etc.) on the public story page and in-app previews. Story content is
 * owner-authored markdown, NOT arbitrary HTML, so we deliberately do NOT enable
 * rehype-raw — react-markdown's default escapes raw HTML, keeping the public
 * page XSS-safe by construction. remark-gfm adds tables/strikethrough/autolinks.
 *
 * `variant="story"` matches the large serif public-page aesthetic; `variant="compact"`
 * is for in-app previews and the editor preview pane.
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type ProseVariant = "story" | "compact";

const SERIF = "font-[family-name:var(--font-cormorant-garamond)]";

function buildComponents(variant: ProseVariant): Components {
  const story = variant === "story";
  return {
    h1: ({ children }) => (
      <h2 className={cn(SERIF, "font-semibold text-[#1d212a]", story ? "mb-4 mt-8 text-4xl" : "mb-2 mt-5 text-2xl")}>{children}</h2>
    ),
    h2: ({ children }) => (
      <h3 className={cn(SERIF, "font-semibold text-[#1d212a]", story ? "mb-3 mt-7 text-3xl" : "mb-2 mt-4 text-xl")}>{children}</h3>
    ),
    h3: ({ children }) => (
      <h4 className={cn("font-semibold text-[#1d212a]", story ? "mb-2 mt-6 text-2xl" : "mb-1 mt-3 text-lg")}>{children}</h4>
    ),
    h4: ({ children }) => (
      <h5 className={cn("font-semibold text-[#1d212a]", story ? "mb-2 mt-5 text-xl" : "mb-1 mt-3 text-base")}>{children}</h5>
    ),
    p: ({ children }) => (
      <p className={cn(story ? "my-4 text-lg leading-9 text-[#2d2b26]" : "my-2 leading-7")}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul className={cn("list-disc space-y-1 pl-6", story ? "my-4 text-lg leading-8 text-[#2d2b26]" : "my-2")}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={cn("list-decimal space-y-1 pl-6", story ? "my-4 text-lg leading-8 text-[#2d2b26]" : "my-2")}>{children}</ol>
    ),
    li: ({ children }) => <li>{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className={cn("border-l-4 border-[#c57d39] pl-4 italic text-[#5f5542]", story ? "my-5 text-lg" : "my-3")}>{children}</blockquote>
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer noopener" className="text-[#9f5a2d] underline underline-offset-2 hover:text-[#7c4425]">{children}</a>
    ),
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    hr: () => <hr className="my-8 border-[#d8c7a7]" />,
    code: ({ children }) => (
      <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.85em] text-stone-800">{children}</code>
    ),
    table: ({ children }) => (
      <div className="my-5 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-stone-300 px-3 py-2 font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-stone-200 px-3 py-2 align-top">{children}</td>,
  };
}

export function Prose({
  markdown,
  variant = "story",
  className,
}: {
  markdown: string;
  variant?: ProseVariant;
  className?: string;
}) {
  return (
    <div className={cn("max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(variant)}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
