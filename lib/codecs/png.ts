import { exportCard, normalizeImportedCard } from "./card";
import type { Canonical } from "../schema/character";
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function crc32(b: Buffer) {
  let c = 0xffffffff;
  for (const x of b) {
    c ^= x;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  b.write(type, 4, 4, "ascii");
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4);
  return b;
}
export function chunks(png: Buffer) {
  if (!png.subarray(0, 8).equals(signature)) throw new Error("无效 PNG 签名");
  const out: { type: string; data: Buffer; raw: Buffer }[] = [];
  let p = 8;
  while (p < png.length) {
    if (p + 12 > png.length) throw new Error("PNG 被截断");
    const n = png.readUInt32BE(p);
    if (n > 20 * 1024 * 1024 || p + n + 12 > png.length)
      throw new Error("PNG chunk 超出限制");
    const raw = png.subarray(p, p + n + 12);
    if (crc32(raw.subarray(4, -4)) !== raw.readUInt32BE(raw.length - 4))
      throw new Error("PNG CRC 不匹配");
    const type = raw.toString("ascii", 4, 8);
    out.push({ type, data: raw.subarray(8, -4), raw });
    p += n + 12;
    if (type === "IEND") break;
  }
  if (out[0]?.type !== "IHDR" || out.at(-1)?.type !== "IEND")
    throw new Error("PNG 缺少 IHDR/IEND");
  return out;
}
export function readPng(png: Buffer) {
  const texts = chunks(png)
    .filter((c) => c.type === "tEXt")
    .map((c) => {
      const zero = c.data.indexOf(0);
      return {
        key: c.data.toString("latin1", 0, zero).toLowerCase(),
        text: c.data.toString("latin1", zero + 1),
      };
    });
  const t =
    texts.find((t) => t.key === "ccv3") ?? texts.find((t) => t.key === "chara");
  if (!t) throw new Error("PNG 未包含角色卡 metadata");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(t.text))
    throw new Error("无效 metadata base64");
  return normalizeImportedCard(
    JSON.parse(Buffer.from(t.text, "base64").toString("utf8")),
  );
}
export function writePng(png: Buffer, c: Canonical) {
  const cs = chunks(png).filter(
    (c) =>
      !(
        c.type === "tEXt" &&
        ["chara", "ccv3"].includes(
          c.data.toString("latin1", 0, c.data.indexOf(0)).toLowerCase(),
        )
      ),
  );
  const v2 = exportCard(c, 2);
  v2.data.creator_notes =
    String(v2.data.creator_notes) +
    "\nThis is a Character Card V3 backfill. Use a V3 compatible application for full fidelity.";
  const meta = [
    ["chara", v2],
    ["ccv3", exportCard(c, 3)],
  ] as const;
  return Buffer.concat([
    signature,
    ...cs.slice(0, -1).map((c) => c.raw),
    ...meta.map(([k, v]) =>
      chunk(
        "tEXt",
        Buffer.from(
          k + "\0" + Buffer.from(JSON.stringify(v), "utf8").toString("base64"),
          "latin1",
        ),
      ),
    ),
    cs.at(-1)!.raw,
  ]);
}
export interface ContainerCodec {
  extensions: string[];
  decode(data: Buffer): Canonical;
  encode(c: Canonical, asset?: Buffer): Promise<Buffer> | Buffer;
}
