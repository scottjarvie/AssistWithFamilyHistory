import type { EvidencePack } from "./schemas";

type JsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export type SourceDocAiFetcher = (input: string) => Promise<JsonResponse>;

export type SourceDocAiWorkspaceResult =
  | { status: "redirect-to-people" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      personName: string;
      runId: string;
      pack: EvidencePack;
      contextualizedMarkdown: string | null;
      hasContextualizedDocument: boolean;
    };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : null;
}

function readString(record: UnknownRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

async function loadOptionalContextualized(
  fetcher: SourceDocAiFetcher,
  endpoint: string,
): Promise<{ markdown: string | null; loaded: boolean }> {
  try {
    const response = await fetcher(endpoint);
    const payload = asRecord(await response.json().catch(() => null));

    if (!response.ok || payload?.success !== true) {
      return { markdown: null, loaded: false };
    }

    return {
      markdown: readString(payload, "markdown") ?? "",
      loaded: true,
    };
  } catch {
    return { markdown: null, loaded: false };
  }
}

export async function loadSourceDocAiWorkspace({
  personId,
  requestedRunId,
  fetcher,
}: {
  personId: string;
  requestedRunId: string | null;
  fetcher: SourceDocAiFetcher;
}): Promise<SourceDocAiWorkspaceResult> {
  const personResponse = await fetcher(`/api/people/${personId}`);
  const personPayload = asRecord(await personResponse.json());

  if (!personResponse.ok || personPayload?.success !== true) {
    return { status: "redirect-to-people" };
  }

  const person = asRecord(personPayload.person);
  const personName = readString(person, "name") || personId;
  const runId = requestedRunId || readString(personPayload, "latestRunId");

  if (!runId) {
    return {
      status: "error",
      message: "No extraction runs found for this person. Import a capture package first.",
    };
  }

  const packEndpoint = `/api/people/${personId}/runs/${runId}/pack`;
  const contextualizedEndpoint = `/api/people/${personId}/contextualized?run=${runId}`;

  const packPromise = fetcher(packEndpoint);
  const contextualizedPromise = loadOptionalContextualized(fetcher, contextualizedEndpoint);

  const packResponse = await packPromise;
  const packPayload = asRecord(await packResponse.json());

  if (!packResponse.ok || packPayload?.success !== true) {
    return {
      status: "error",
      message:
        readString(packPayload, "error") ||
        "Could not load the legacy source capture for this run.",
    };
  }

  const contextualized = await contextualizedPromise;

  return {
    status: "ready",
    personName,
    runId,
    pack: packPayload.pack as EvidencePack,
    contextualizedMarkdown: contextualized.markdown,
    hasContextualizedDocument: contextualized.loaded,
  };
}
