/**
 * AI Types
 * 
 * Purpose: Type definitions for AI integration
 * 
 * Key Elements:
 * - OpenRouter configuration
 * - Model definitions
 * - Processing options
 * 
 * Dependencies: None
 * 
 * Last Updated: Initial setup
 */

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  costPer1kTokens: number;
}

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    contextLength: 200000,
    costPer1kTokens: 0.003,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    contextLength: 128000,
    costPer1kTokens: 0.005,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    contextLength: 128000,
    costPer1kTokens: 0.00015,
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    contextLength: 1000000,
    costPer1kTokens: 0.0001,
  },
];

/**
 * GEN-89 — /api/process hardening.
 *
 * ALLOWED_MODELS is the server-side allowlist of model ids that /api/process
 * will accept from a client. It is derived from the current AVAILABLE_MODELS
 * ids above. Any client-supplied model not in this set is rejected with 400.
 *
 * DEFAULT_MODEL is used when the client omits a model. It MUST be one of the
 * CURRENT ids below (the retired "anthropic/claude-3-sonnet" default has been
 * removed).
 *
 * SCOTT: confirm this allowlist + the default model are what we want exposed
 * to external AI requests. Add/remove ids in AVAILABLE_MODELS and the set
 * derives automatically.
 */
export const ALLOWED_MODELS: ReadonlySet<string> = new Set(
  AVAILABLE_MODELS.map((m) => m.id),
);

export const DEFAULT_MODEL = "openai/gpt-4o-mini";

/** Hard ceiling on completion tokens for /api/process requests (GEN-89). */
export const MAX_COMPLETION_TOKENS = 4096;

/** Max combined prompt+data payload size in bytes for /api/process (GEN-89). */
export const MAX_PROCESS_PAYLOAD_BYTES = 256_000;

export interface ProcessingOptions {
  stage: "normalize" | "cluster" | "synthesize";
  model: string;
  redact: boolean;
}

export interface AIResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
