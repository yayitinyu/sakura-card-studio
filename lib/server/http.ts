import { NextRequest } from "next/server";
export async function readLimited(req: Request, maxBytes: number) {
  const declared = Number(req.headers.get("content-length"));
  if (declared > maxBytes) throw new Error("请求超过文件大小限制");
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("请求超过文件大小限制");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function readJson(req: NextRequest) {
  return JSON.parse(
    (await readLimited(req, 12 * 1024 * 1024)).toString("utf8"),
  );
}
export async function readUpload(req: NextRequest, maxBytes: number) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data;"))
    throw new Error("上传需要 multipart/form-data 格式");
  const bytes = await readLimited(req, maxBytes + 64 * 1024);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": type },
  }).formData();
}
