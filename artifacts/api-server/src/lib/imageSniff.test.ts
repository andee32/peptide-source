import { describe, it, expect } from "vitest";
import { sniffImageMime } from "./imageSniff";

function pad(head: number[]): Buffer {
  return Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);
}

describe("sniffImageMime", () => {
  it("detects the formats the catalog accepts", () => {
    expect(
      sniffImageMime(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
    expect(sniffImageMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      sniffImageMime(
        Buffer.concat([
          Buffer.from("RIFF"),
          Buffer.alloc(4),
          Buffer.from("WEBP"),
          Buffer.alloc(8),
        ]),
      ),
    ).toBe("image/webp");
    expect(
      sniffImageMime(
        Buffer.concat([
          Buffer.alloc(4),
          Buffer.from("ftypavif"),
          Buffer.alloc(8),
        ]),
      ),
    ).toBe("image/avif");
  });

  it("rejects a text file regardless of what the client declared", () => {
    expect(
      sniffImageMime(Buffer.from("this is definitely not an image")),
    ).toBeNull();
  });

  it("rejects SVG and other ISO-BMFF brands", () => {
    expect(sniffImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(
      sniffImageMime(
        Buffer.concat([
          Buffer.alloc(4),
          Buffer.from("ftypmp42"),
          Buffer.alloc(8),
        ]),
      ),
    ).toBeNull();
  });

  it("rejects a truncated header instead of guessing", () => {
    expect(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });
});
