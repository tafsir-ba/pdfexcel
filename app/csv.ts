export type CsvEncoding = "utf-8" | "windows-1252" | "macintosh";

const CP1252_UNDEFINED_BYTES = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);
const CP1252_LETTER_BYTES = new Set([0x8a, 0x8c, 0x8e, 0x9a, 0x9c, 0x9f]);

function isAsciiLetter(byte: number | undefined) {
  return byte !== undefined && ((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a));
}

function looksLikeMacRoman(bytes: Uint8Array) {
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (CP1252_UNDEFINED_BYTES.has(byte)) return true;

    if (
      CP1252_LETTER_BYTES.has(byte)
      && isAsciiLetter(bytes[index - 1])
      && isAsciiLetter(bytes[index + 1])
    ) {
      return true;
    }
  }
  return false;
}

export function decodeCsvBytes(input: ArrayBuffer | Uint8Array): {
  text: string;
  encoding: CsvEncoding;
} {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    const encoding: CsvEncoding = looksLikeMacRoman(bytes) ? "macintosh" : "windows-1252";
    return {
      text: new TextDecoder(encoding).decode(bytes),
      encoding,
    };
  }
}
