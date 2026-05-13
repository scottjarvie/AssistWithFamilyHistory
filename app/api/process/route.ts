import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai/openrouter";

type ProcessRequestBody = {
  prompt?: unknown;
  data?: unknown;
  model?: unknown;
  apiKey?: unknown;
  systemPrompt?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const { prompt, data, model, apiKey, systemPrompt } = (await request.json()) as ProcessRequestBody;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

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
    });

  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request processing failed" },
      { status: 500 }
    );
  }
}
