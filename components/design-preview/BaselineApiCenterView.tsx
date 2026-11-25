import {ArrowRight,Bot} from "lucide-react";
import {SafeLink} from "@/components/layout/SafeLink";
import {BaselineApiKeyManager as ApiKeyManager,type ApiKeyRow} from "./BaselineApiKeyManager";
/** Original route JSX with invented records; no server/backend reads. */
export function BaselineApiCenterView({keys,admin}:{keys:ApiKeyRow[];admin:boolean}) {
  return (
    <div className="max-w-4xl p-4 sm:p-8">
      <section className="mb-8 border border-[#b8c9bd] bg-[#eff5f0] px-5 py-6 shadow-sm sm:px-7" aria-labelledby="current-ai-connection">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#245a43]">
          <Bot className="h-4 w-4" aria-hidden="true" /> Current AI connection
        </p>
        <h1 id="current-ai-connection" className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-3xl font-semibold text-[#24312c] sm:text-4xl">
          Use OAuth and MCP for normal AI assistance.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5f665f]">
          The guided connection uses your normal account, keeps vault selection on the server, and does not ask you to copy a product-data key into a chat. The API-key console below is a partial developer surface whose verification path is still rolling out.
        </p>
        <SafeLink href="/ai" className="mt-5 inline-flex min-h-11 items-center gap-2 bg-[#245a43] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1c4936]">
          Open current AI setup <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </SafeLink>
      </section>
      <header className="mb-8">
        <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-950">
          API Center
        </h2>
        <p className="mt-2 max-w-2xl text-stone-600">
          Create a key, point your AI agent at it, and it can help gather, organize, and tell your
          family&apos;s story — scoped to exactly what you allow. New keys default to private,
          review-first writes; living-person and unreviewed data stay protected.
        </p>
      </header>
      <ApiKeyManager initialKeys={keys} mode="user" isAdmin={admin} />
    </div>
  );
}
