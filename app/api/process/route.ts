import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai/openrouter";
import { getAiPrivacyDisclosure, type AiRedactionMode } from "@/lib/ai/privacy";

type ProcessRequestBody = {
  prompt?: unknown;
  data?: unknown;
  model?: unknown;
  apiKey?: unknown;
  systemPrompt?: unknown;
  privacyAcknowledged?: unknown;
  redactionMode?: unknown;
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

    const serializedData =
      typeof data === "string" ? data : data ? JSON.stringify(data, null, 2) : "";
    const fullPrompt = serializedData ? `${prompt}\n\nINPUT DATA:\n${serializedData}` : prompt;

    const response = await chatCompletion({
      config: {
        apiKey: token,
        model: typeof model === "string" && model.trim() ? model : "anthropic/claude-3-sonnet",
        temperature: 0.3,
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
