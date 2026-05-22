/**
 * OpenRouter Client
 * 
 * Purpose: API client for OpenRouter AI integration
 * 
 * Key Elements:
 * - Chat completion requests
 * - Streaming support
 * - Error handling
 * - Token usage tracking
 * 
 * Dependencies:
 * - ./types
 * 
 * Last Updated: Initial setup
 */

import { OpenRouterConfig, AIResponse } from "./types";
import { sanitizeAiProviderError } from "./privacy";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionOptions {
  config: OpenRouterConfig;
  messages: Message[];
  jsonMode?: boolean;
}

/**
 * Make a chat completion request to OpenRouter
 */
export async function chatCompletion({
  config,
  messages,
  jsonMode = false,
}: ChatCompletionOptions): Promise<AIResponse> {
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://discovertheirstories.com",
        "X-Title": "Discover Their Stories",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 4096,
        response_format: jsonMode ? { type: "json_object" } : undefined,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: sanitizeAiProviderError(response.status),
      };
    }

    const data = await response.json();
    
    const content = data.choices?.[0]?.message?.content;
    let parsedContent = content;

    // Try to parse as JSON if in JSON mode
    if (jsonMode && content) {
      try {
        parsedContent = JSON.parse(content);
      } catch {
        // Return raw content if JSON parsing fails
      }
    }

    return {
      success: true,
      data: parsedContent,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };
  } catch {
    return {
      success: false,
      error: "AI provider request failed. Check connectivity or use manual prompt export.",
    };
  }
}

/**
 * Stream a chat completion from OpenRouter
 */
export async function* streamChatCompletion({
  config,
  messages,
}: Omit<ChatCompletionOptions, "jsonMode">): AsyncGenerator<string, void, unknown> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
      "HTTP-Referer": "https://discovertheirstories.com",
      "X-Title": "Discover Their Stories",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 4096,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * Test API key validity
 */
export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
