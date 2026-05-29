import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai/openrouter";
import { getAiPrivacyDisclosure, type AiRedactionMode } from "@/lib/ai/privacy";
import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  MAX_COMPLETION_TOKENS,
  MAX_PROCESS_PAYLOAD_BYTES,
} from "@/lib/ai/types";

// GEN-89 TODO (follow-up): add per-user rate limiting. We intentionally do NOT
// use an in-memory counter here — this route runs on serverless and each
// invocation may hit a fresh isolate, so an in-memory limiter is useless. The
// real fix is a Convex-counter-based limiter (a mutation that increments a
// per-vaultOwnerId/per-window counter document and rejects over the cap),
// shared across all serverless instances. Tracked as a follow-up to GEN-89.

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

    if (data !== undefined && body.privacyAcknowledged !== true) {
      return NextResponse.json(
        {
          error: "AI privacy acknowledgement required",
          details: "External AI requests with vault data must declare the redaction mode and explicit review acknowledgement.",
        },
        { status: 400 }
      );
    }
    if (data !== undefined && !isRedactionMode(body.redactionMode)) {
      return NextResponse.json(
        {
          error: "AI redaction mode required",
          details: "External AI requests with vault data must declare whether the payload is redacted or human-reviewed original data.",
        },
        { status: 400 }
      );
    }

    const redactionMode = isRedactionMode(body.redactionMode) ? body.redactionMode : "not_applicable";

    // Determine API Key: Client provided > Server Env > Fail
    const token =
      typeof apiKey === "string" && apiKey.trim()
        ? apiKey
        : process.env.OPENROUTER_API_KEY;

    if (!token) {
      return NextResponse.json(
        { error: "OpenRouter API Key not configured" },
        { status: 401 }
      );
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

    const serializedData =
      typeof data === "string" ? data : data ? JSON.stringify(data, null, 2) : "";

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
          content:
            typeof systemPrompt === "string" && systemPrompt.trim()
              ? systemPrompt
              : "You are a helpful research assistant.",
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
