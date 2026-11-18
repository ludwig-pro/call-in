export const MAX_BODY_BYTES = 4096;

export async function readSmallJsonRequest(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  const lengthHeader = request.headers.get("content-length");
  if (!contentType.toLowerCase().startsWith("application/json")) throw new Error("invalid request");
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isFinite(length) || length < 0) throw new Error("invalid request");
    if (length > maxBytes) throw new Error("request too large");
  }
  if (!request.body) throw new Error("invalid request");
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("request too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function readBoundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  if (!request.body) throw new Error("invalid multipart request");
  const reader = request.body.getReader();
  let length = 0;
  const bounded = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) return controller.close();
      length += chunk.value.byteLength;
      if (length > maxBytes) {
        controller.error(new Error("request too large"));
        await reader.cancel();
        return;
      }
      controller.enqueue(chunk.value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  try {
    return await new Response(bounded, { headers: { "Content-Type": request.headers.get("Content-Type") || "" } }).formData();
  } catch {
    throw new Error(length > maxBytes ? "request too large" : "invalid multipart request");
  }
}

export function cleanText(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function assertVoterId(voterId: string): void {
  if (!isUuid(voterId)) throw new Error("invalid voter");
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
