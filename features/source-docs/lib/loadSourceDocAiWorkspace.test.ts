import { describe, expect, it } from "vitest";

import { loadSourceDocAiWorkspace } from "./loadSourceDocAiWorkspace";

type JsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function response(payload: unknown, ok = true): JsonResponse {
  return {
    ok,
    async json() {
      return payload;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const personId = "synthetic-person";
const explicitRunId = "synthetic-run";
const personEndpoint = `/api/people/${personId}`;
const packEndpoint = `/api/people/${personId}/runs/${explicitRunId}/pack`;
const contextualizedEndpoint =
  `/api/people/${personId}/contextualized?run=${explicitRunId}`;

describe("loadSourceDocAiWorkspace", () => {
  it("dispatches pack and contextualized requests together after resolving the run", async () => {
    const calls: string[] = [];
    const delayedPack = deferred<JsonResponse>();
    const contextualizedDispatched = deferred<void>();

    const loadPromise = loadSourceDocAiWorkspace({
      personId,
      requestedRunId: explicitRunId,
      fetcher: async (input) => {
        calls.push(input);

        if (input === personEndpoint) {
          return response({
            success: true,
            person: { name: "Synthetic Ancestor" },
            latestRunId: "latest-run",
          });
        }

        if (input === packEndpoint) {
          return delayedPack.promise;
        }

        if (input === contextualizedEndpoint) {
          contextualizedDispatched.resolve();
          return response({ success: true, markdown: "# Synthetic dossier" });
        }

        throw new Error(`Unexpected request: ${input}`);
      },
    });

    await contextualizedDispatched.promise;

    expect(calls).toEqual([personEndpoint, packEndpoint, contextualizedEndpoint]);

    delayedPack.resolve(
      response({
        success: true,
        pack: { person: { name: "Synthetic Ancestor" }, sources: [] },
      }),
    );

    await expect(loadPromise).resolves.toEqual({
      status: "ready",
      personName: "Synthetic Ancestor",
      runId: explicitRunId,
      pack: { person: { name: "Synthetic Ancestor" }, sources: [] },
      contextualizedMarkdown: "# Synthetic dossier",
      hasContextualizedDocument: true,
    });
  });

  it("preserves redirect and missing-run states", async () => {
    await expect(
      loadSourceDocAiWorkspace({
        personId,
        requestedRunId: null,
        fetcher: async () => response({ error: "Person not found" }, false),
      }),
    ).resolves.toEqual({ status: "redirect-to-people" });

    await expect(
      loadSourceDocAiWorkspace({
        personId,
        requestedRunId: null,
        fetcher: async () =>
          response({ success: true, person: { name: "Synthetic Ancestor" } }),
      }),
    ).resolves.toEqual({
      status: "error",
      message: "No extraction runs found for this person. Import a capture package first.",
    });
  });

  it("keeps pack failures blocking while still dispatching optional context", async () => {
    const calls: string[] = [];
    const result = await loadSourceDocAiWorkspace({
      personId,
      requestedRunId: explicitRunId,
      fetcher: async (input) => {
        calls.push(input);
        if (input === personEndpoint) {
          return response({ success: true, person: {}, latestRunId: "latest-run" });
        }
        if (input === packEndpoint) {
          return response({ error: "Synthetic pack error" }, false);
        }
        return response({ success: true, markdown: "ignored optional content" });
      },
    });

    expect(calls).toEqual([personEndpoint, packEndpoint, contextualizedEndpoint]);
    expect(result).toEqual({ status: "error", message: "Synthetic pack error" });
  });

  it("reports a pack failure without waiting for optional context to settle", async () => {
    const calls: string[] = [];
    const neverSettlingContext = new Promise<JsonResponse>(() => {});

    const result = await loadSourceDocAiWorkspace({
      personId,
      requestedRunId: explicitRunId,
      fetcher: async (input) => {
        calls.push(input);
        if (input === personEndpoint) {
          return response({ success: true, person: {}, latestRunId: "latest-run" });
        }
        if (input === packEndpoint) {
          return response({ error: "Synthetic pack error" }, false);
        }
        return neverSettlingContext;
      },
    });

    expect(calls).toEqual([personEndpoint, packEndpoint, contextualizedEndpoint]);
    expect(result).toEqual({ status: "error", message: "Synthetic pack error" });
  }, 500);

  it("keeps invalid or failed contextualized responses non-blocking", async () => {
    for (const contextFailure of [
      "success-false",
      "invalid-json",
      "request-failure",
    ] as const) {
      const result = await loadSourceDocAiWorkspace({
        personId,
        requestedRunId: explicitRunId,
        fetcher: async (input) => {
          if (input === personEndpoint) {
            return response({ success: true, person: {}, latestRunId: "latest-run" });
          }
          if (input === packEndpoint) {
            return response({ success: true, pack: { person: {}, sources: [] } });
          }
          if (contextFailure === "request-failure") {
            throw new Error("Synthetic contextualized request failure");
          }
          if (contextFailure === "success-false") {
            return response({ success: false });
          }
          return {
            ok: false,
            async json() {
              throw new Error("Synthetic invalid contextualized JSON");
            },
          };
        },
      });

      expect(result).toEqual({
        status: "ready",
        personName: personId,
        runId: explicitRunId,
        pack: { person: {}, sources: [] },
        contextualizedMarkdown: null,
        hasContextualizedDocument: false,
      });
    }
  });
});
