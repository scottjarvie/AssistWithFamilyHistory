export type AiRedactionMode = "redacted" | "original_reviewed" | "not_applicable";

export function getAiPrivacyDisclosure(mode: AiRedactionMode) {
  switch (mode) {
    case "redacted":
      return "External AI request uses redacted data. Review output before saving it to the vault.";
    case "original_reviewed":
      return "External AI request uses original data after explicit human review. Do not include living-person or private details unless approved.";
    case "not_applicable":
      return "External AI request does not include a structured evidence payload.";
  }
}

export function sanitizeAiProviderError(status?: number) {
  if (status === 401 || status === 403) {
    return "AI provider rejected the request. Check the API key in Settings and try again.";
  }
  if (status === 402 || status === 429) {
    return "AI provider rate limit or account quota blocked the request. Wait, change model, or check provider billing.";
  }
  if (status && status >= 500) {
    return "AI provider is temporarily unavailable. Try again later or use Copy Prompt for manual processing.";
  }
  return "AI provider request failed. Try again or use Copy Prompt for manual processing.";
}
