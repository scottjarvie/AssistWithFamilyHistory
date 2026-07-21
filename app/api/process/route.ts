import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai/openrouter";
import { getAiPrivacyDisclosure, type AiRedactionMode } from "@/lib/ai/privacy";
import {
  hasVerifiedOriginalReviewAuthority,
  scanAiEgressForLivingPersonPII,
} from "@/lib/ai/redaction";
import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  MAX_COMPLETION_TOKENS,
  MAX_PROCESS_PAYLOAD_BYTES,
} from "@/lib/ai/types";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient, isConvexConfigured } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";

// GEN-89-RL: per-vaultOwner rate limiting for the external-AI spend vector.
//
// Implemented as a Convex fixed-window counter (convex/rateLimits.ts) so the
// limit is shared across all serverless isolates — an in-memory counter would
// be useless here because each invocation may hit a fresh isolate.
//
// POLICY (tune these freely, Scott):
//   - Window: 10 minutes, per (vaultOwner, "process").
//   - Default cap: 30 requests / window when the caller supplies their OWN
//     OpenRouter key (they pay for their own spend).
//   - Stricter cap: 10 requests / window when the request falls back to the
//     server OPENROUTER_API_KEY (this is OUR spend — guard it harder).
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_DEFAULT = 30; // client supplied their own API key
const RATE_LIMIT_SERVER_KEY = 10; // falling back to server-funded OPENROUTER_API_KEY
const RATE_LIMIT_ACTION = "process";

type ProcessRequestBody = {
  prompt?: unknown;
  data?: unknown;
  model?: unknown;
  apiKey?: unknown;
  systemPrompt?: unknown;
  privacyAcknowledged?: unknown;
  redactionMode?: unknown;
  maxTokens?: unknown;
};

function isRedactionMode(value: unknown): value is AiRedactionMode {
  return value === "redacted" || value === "original_reviewed" || value === "not_applicable";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProcessRequestBody;
    const { prompt, data, model, apiKey, systemPrompt } = body;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

    if (body.privacyAcknowledged !== true) {
      return NextResponse.json(
        {
          error: "AI privacy acknowledgement required",
          details:
            "External AI requests must declare the redaction mode and explicit review acknowledgement.",
        },
        { status: 400 }
      );
    }
    if (!isRedactionMode(body.redactionMode)) {
      return NextResponse.json(
        {
          error: "AI redaction mode required",
          details:
            "External AI requests must declare whether the outbound content is redacted, human-reviewed original data, or contains no human-subject data.",
        },
        { status: 400 }
      );
    }

    const redactionMode = body.redactionMode;
    const serializedData =
      typeof data === "string"
        ? data
        : data !== undefined
          ? JSON.stringify(data, null, 2)
          : "";
    const resolvedSystemPrompt =
      typeof systemPrompt === "string" && systemPrompt.trim()
        ? systemPrompt
        : "You are a helpful research assistant.";

    // GEN-88 §C: refuse unsafe outbound content before rate-limit mutation or
    // provider work. Source Docs embeds its evidence in `prompt`, while Story
    // Writer uses `data`, so the exact provider-bound system/prompt/data text
    // must be evaluated together. `not_applicable` is also scanned: a positive
    // PII signal disproves the claim that no human-subject privacy mode applies.
    if (redactionMode === "redacted" || redactionMode === "not_applicable") {
      const egressScan = scanAiEgressForLivingPersonPII({
        prompt,
        serializedData,
        systemPrompt: resolvedSystemPrompt,
      });
      if (egressScan.hasPII) {
        return NextResponse.json(
          {
            error: "Redaction check failed",
            details:
              "The outbound request still contains living-person or PII indicators. Remove them or send as reviewed original data.",
          },
          { status: 422 },
        );
      }
    } else {
      let access = null;
      try {
        access = await getVaultAccessContext();
      } catch {
        access = null;
      }
      if (!hasVerifiedOriginalReviewAuthority(access)) {
        return NextResponse.json(
          {
            error: "Human review verification required",
            details:
              "Sending original (unredacted) human-subject data requires a signed-in vault owner. Sign in, or send redacted data instead.",
          },
          { status: 403 },
        );
      }
    }

    // Determine API Key: Client provided > Server Env > Fail
    const usingClientKey = typeof apiKey === "string" && apiKey.trim().length > 0;
    const token = usingClientKey ? (apiKey as string) : process.env.OPENROUTER_API_KEY;

    if (!token) {
      return NextResponse.json(
        { error: "OpenRouter API Key not configured" },
        { status: 401 }
      );
    }

    // GEN-89-RL: throttle per vaultOwner BEFORE spending any tokens. Stricter
    // cap when the request is funded by the server OPENROUTER_API_KEY. Best
    // effort — if Convex isn't configured (e.g. local-only mode) we skip the
    // limiter rather than block the request.
    if (isConvexConfigured()) {
      try {
        const { vaultOwnerId } = await getVaultAccessContext();
        const limit = usingClientKey ? RATE_LIMIT_DEFAULT : RATE_LIMIT_SERVER_KEY;
        const verdict = await (await getAuthedConvexClient()).mutation(
          api.rateLimits.checkAndIncrementRateLimit,
          {
            vaultOwnerId,
            action: RATE_LIMIT_ACTION,
            limit,
            windowMs: RATE_LIMIT_WINDOW_MS,
          }
        );
        if (!verdict.allowed) {
          const retryAfterSec = Math.ceil(verdict.retryAfterMs / 1000);
          return NextResponse.json(
            {
              error: "Rate limit exceeded",
              details: `Too many AI requests for this vault. Try again in ${retryAfterSec}s.`,
              retryAfterMs: verdict.retryAfterMs,
            },
            { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
          );
        }
      } catch {
        // Limiter unavailable (Convex transient error). Fail open: do not block
        // legitimate AI requests on a counter outage.
      }
    }

    // GEN-89: reject client-supplied models that are not on the allowlist.
    // An omitted/blank model falls back to the current DEFAULT_MODEL.
    let resolvedModel = DEFAULT_MODEL;
    if (typeof model === "string" && model.trim()) {
      if (!ALLOWED_MODELS.has(model)) {
        return NextResponse.json(
          {
            error: "Unsupported model",
            details: "The requested model is not on the allowlist for this endpoint.",
          },
          { status: 400 }
        );
      }
      resolvedModel = model;
    }

    // GEN-89: cap the combined prompt+data payload size BEFORE building the
    // full prompt, measured in UTF-8 bytes (matches over-the-wire size).
    const payloadBytes =
      Buffer.byteLength(prompt, "utf8") + Buffer.byteLength(serializedData, "utf8");
    if (payloadBytes > MAX_PROCESS_PAYLOAD_BYTES) {
      return NextResponse.json(
        {
          error: "Payload too large",
          details: `Combined prompt and data must not exceed ${MAX_PROCESS_PAYLOAD_BYTES} bytes.`,
        },
        { status: 413 }
      );
    }

    const fullPrompt = serializedData ? `${prompt}\n\nINPUT DATA:\n${serializedData}` : prompt;

    // GEN-89: enforce a hard ceiling on requested completion tokens.
    const requestedMaxTokens =
      typeof body.maxTokens === "number" && Number.isFinite(body.maxTokens) && body.maxTokens > 0
        ? Math.floor(body.maxTokens)
        : MAX_COMPLETION_TOKENS;
    const maxTokens = Math.min(requestedMaxTokens, MAX_COMPLETION_TOKENS);

    const response = await chatCompletion({
      config: {
        apiKey: token,
        model: resolvedModel,
        temperature: 0.3,
        maxTokens,
      },
      messages: [
        {
          role: "system",
          content: resolvedSystemPrompt,
        },
        { role: "user", content: fullPrompt },
      ],
    });

    if (!response.success) {
      return NextResponse.json(
        { error: response.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      content: response.data,
      usage: response.usage,
      privacy: {
        redactionMode,
        disclosure: getAiPrivacyDisclosure(redactionMode),
      },
    });

  } catch {
    return NextResponse.json(
      { error: "Request processing failed" },
      { status: 500 }
    );
  }
}
