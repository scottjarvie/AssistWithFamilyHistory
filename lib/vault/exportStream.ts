type Page = { rows: unknown[]; cursor: string | null };

/** Fetch one page only when the downloader asks for more bytes. */
export function createExportStream(
  tables: readonly string[],
  exportedAt: string,
  fetchPage: (table: string, cursor: string | null) => Promise<Page>,
) {
  let cancelled = false;
  async function* chunks() {
    yield `{"product":"Assist With Family History","format":"awfh-export-1","exportedAt":${JSON.stringify(exportedAt)},"note":"Every record in your private workspace, with who made it and when. Files are listed as records; original files are not included.","tables":{`;
    for (const [index, table] of tables.entries()) {
      yield `${index ? "," : ""}${JSON.stringify(table)}:[`;
      let cursor: string | null = null;
      let first = true;
      do {
        if (cancelled) return;
        const page = await fetchPage(table, cursor);
        if (cancelled) return;
        yield page.rows.map((row) => {
          const text = `${first ? "" : ","}${JSON.stringify(row)}`;
          first = false;
          return text;
        }).join("");
        cursor = page.cursor;
      } while (cursor);
      yield "]";
    }
    yield "}}";
  }
  const iterator = chunks();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await iterator.next();
        if (cancelled) return;
        if (chunk.done) controller.close();
        else controller.enqueue(encoder.encode(chunk.value));
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      await iterator.return();
    },
  }, { highWaterMark: 0 });
}
