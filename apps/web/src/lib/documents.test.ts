import { MAX_UPLOAD_BYTES } from "@deskmate/shared/documents";
import { describe, expect, it } from "@jest/globals";
import { validateFile } from "@/lib/documents";

/** A File of a given size without allocating it: validateFile only reads name and size. */
function fakeFile(name: string, size: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("validateFile", () => {
  it("accepts PDF, Markdown and text files within the limit", () => {
    expect(validateFile(fakeFile("refunds.pdf", 1000))).toBeNull();
    expect(validateFile(fakeFile("FAQ.MD", 1000))).toBeNull(); // extension check ignores case
    expect(validateFile(fakeFile("notes.txt", MAX_UPLOAD_BYTES))).toBeNull(); // exactly at the limit is fine
  });

  it("rejects other file types", () => {
    expect(validateFile(fakeFile("logo.png", 1000))).toMatch(/only .* files are supported/);
  });

  it("rejects files over the limit, with both sizes in the message", () => {
    expect(validateFile(fakeFile("big.pdf", 12 * 1024 * 1024))).toBe("big.pdf is 12.0 MB. The limit is 10.0 MB.");
    expect(validateFile(fakeFile("big.pdf", MAX_UPLOAD_BYTES + 1))).not.toBeNull(); // one byte over
  });

  it("rejects empty files", () => {
    expect(validateFile(fakeFile("empty.txt", 0))).toBe("empty.txt is empty.");
  });
});
