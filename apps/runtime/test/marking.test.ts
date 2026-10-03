import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isMarked, markMedia, speechTags, xmpPacket } from "../src/media/marking";

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const name = Buffer.from(type, "latin1");
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([name, body])) >>> 0);
  return Buffer.concat([head, name, body, check]);
}

/** A one-pixel PNG; `extra` chunks go between the header and the pixels. */
function png(extra: Buffer[] = []): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...extra,
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The chunks of a PNG as [type, body, checksum is right]. */
function chunks(data: Buffer): [string, Buffer, boolean][] {
  const out: [string, Buffer, boolean][] = [];
  for (let at = 8; at < data.length; ) {
    const length = data.readUInt32BE(at);
    const type = data.toString("latin1", at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    const sum = data.readUInt32BE(at + 8 + length);
    out.push([type, body, sum === crc32(data.subarray(at + 4, at + 8 + length)) >>> 0]);
    at += 12 + length;
  }
  return out;
}

const made = { origin: "generated", system: "google/veo-3.1-fast-generate-001" } as const;

describe("marking AI media in its metadata", () => {
  it("says in the XMP how the file came to be", () => {
    expect(xmpPacket(made)).toContain(
      'Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"',
    );
    expect(xmpPacket({ origin: "edited" })).toContain("compositeWithTrainedAlgorithmicMedia");
    expect(xmpPacket({ origin: "generated", system: 'a "b" <c>' })).toContain(
      'AISystemUsed="a &quot;b&quot; &lt;c&gt;"',
    );
  });

  it("puts the XMP into a PNG as a valid chunk after the header, pixels untouched", () => {
    const plain = png();
    const marked = Buffer.from(markMedia(plain, "image/png", made));
    const list = chunks(marked);
    expect(list.map(([type]) => type)).toEqual(["IHDR", "iTXt", "IDAT", "IEND"]);
    expect(list.every(([, , ok]) => ok)).toBe(true);
    expect(list[1][1].toString("utf8")).toContain("XML:com.adobe.xmp");
    expect(list[2][1].equals(chunks(plain)[1][1])).toBe(true);
    expect(isMarked(marked)).toBe(true);
  });

  it("leaves a file alone that is already marked or signed", () => {
    const signed = png([chunk("caBX", Buffer.from("jumb....c2pa....", "latin1"))]);
    expect(markMedia(signed, "image/png", made)).toBe(signed);
    const once = markMedia(png(), "image/png", made);
    expect(markMedia(once, "image/png", made)).toBe(once);
  });

  it("puts the XMP into a JPEG after the JFIF segment", () => {
    const jfif = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x07]),
      Buffer.from("JFIF\0", "latin1"),
      Buffer.from([0xff, 0xd9]),
    ]);
    const marked = Buffer.from(markMedia(jfif, "image/jpeg", made));
    expect(marked.subarray(0, 11).equals(jfif.subarray(0, 11))).toBe(true);
    expect(marked[11]).toBe(0xff);
    expect(marked[12]).toBe(0xe1);
    expect(marked.readUInt16BE(13)).toBe(marked.length - 11 - 2 - 2);
    expect(marked.toString("latin1", 15, 43)).toBe("http://ns.adobe.com/xap/1.0/");
    expect(marked.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
  });

  it("appends the XMP to an MP4 as a uuid box", () => {
    const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from("ftypisom\0\0\0\0", "latin1")]);
    const marked = Buffer.from(markMedia(ftyp, "video/mp4", { origin: "edited" }));
    expect(marked.subarray(0, 16).equals(ftyp)).toBe(true);
    expect(marked.readUInt32BE(16)).toBe(marked.length - 16);
    expect(marked.toString("latin1", 20, 24)).toBe("uuid");
    expect(marked.toString("hex", 24, 40)).toBe("be7acfcb97a942e89c71999491e3afac");
    expect(marked.toString("utf8", 40)).toContain("compositeWithTrainedAlgorithmicMedia");
  });

  it("does not touch what it cannot write", () => {
    const webp = Buffer.from("RIFF....WEBPVP8 ", "latin1");
    expect(markMedia(webp, "image/webp", made)).toBe(webp);
    expect(speechTags(made).DigitalSourceType).toContain("trainedAlgorithmicMedia");
  });
});
