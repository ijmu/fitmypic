// Local metadata inspection for FitMyPic.
// Everything here reads bytes from the file the user already chose; nothing is
// uploaded and no third-party parsing library is involved.

export type MetaField = { label: string; value: string };

export type ImageMeta = {
  format: "JPEG" | "PNG" | "WebP" | "Unknown";
  hasExif: boolean;
  hasGps: boolean;
  fields: MetaField[];
  note: string;
};

const META_PREFIX_BYTES = 512 * 1024;

function tagAt(bytes: Uint8Array, pos: number): string {
  return String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
}

async function readPrefix(file: File, length: number): Promise<Uint8Array> {
  const buffer = await file.slice(0, Math.min(length, file.size)).arrayBuffer();
  return new Uint8Array(buffer);
}

function sniffFormat(bytes: Uint8Array): ImageMeta["format"] {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "JPEG";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "PNG";
  if (bytes.length >= 12 && tagAt(bytes, 0) === "RIFF" && tagAt(bytes, 8) === "WEBP") return "WebP";
  return "Unknown";
}

// Locate the EXIF payload inside a JPEG APP1 segment. Returns the offset of the
// TIFF header, or null when the file carries no EXIF.
function findJpegExif(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    // Start of scan or end of image: EXIF would already have appeared.
    if (marker === 0xda || marker === 0xd9) return null;
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2) return null;
    if (marker === 0xe1 && offset + 4 + 6 <= bytes.length && tagAt(bytes, offset + 4) === "Exif") {
      return offset + 10; // skip marker (2) + size (2) + "Exif\0\0" (6)
    }
    offset += 2 + size;
  }
  return null;
}

type ExifParse = { fields: MetaField[]; hasGps: boolean };

function parseExifTiff(bytes: Uint8Array, base: number): ExifParse {
  const empty: ExifParse = { fields: [], hasGps: false };
  if (base + 8 > bytes.length) return empty;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = view.getUint16(base) === 0x4949;
  if (!little && view.getUint16(base) !== 0x4d4d) return empty;
  const u16 = (pos: number): number => view.getUint16(pos, little);
  const u32 = (pos: number): number => view.getUint32(pos, little);
  if (u16(base + 2) !== 42) return empty;

  const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const fields: MetaField[] = [];
  let hasGps = false;

  const ascii = (dataPos: number, count: number): string => {
    let out = "";
    for (let i = 0; i < count - 1 && dataPos + i < bytes.length; i += 1) {
      const code = bytes[dataPos + i];
      if (code === 0) break;
      out += String.fromCharCode(code);
    }
    return out.trim();
  };

  const walkIfd = (ifdPos: number, depth: number): void => {
    if (depth > 2 || ifdPos < 0 || ifdPos + 2 > bytes.length) return;
    const count = u16(ifdPos);
    if (count > 512) return; // sanity cap; real IFDs are far smaller
    for (let i = 0; i < count; i += 1) {
      const entryPos = ifdPos + 2 + i * 12;
      if (entryPos + 12 > bytes.length) return;
      const tag = u16(entryPos);
      const type = u16(entryPos + 2);
      const valueCount = u32(entryPos + 4);
      const byteCount = (TYPE_SIZE[type] ?? 1) * valueCount;
      const dataPos = byteCount <= 4 ? entryPos + 8 : base + u32(entryPos + 8);
      if (dataPos < 0 || dataPos >= bytes.length) continue;
      switch (tag) {
        case 0x010f: { const v = ascii(dataPos, valueCount); if (v) fields.push({ label: "Camera make", value: v }); break; }
        case 0x0110: { const v = ascii(dataPos, valueCount); if (v) fields.push({ label: "Camera model", value: v }); break; }
        case 0x0131: { const v = ascii(dataPos, valueCount); if (v) fields.push({ label: "Software", value: v }); break; }
        case 0x0132: { const v = ascii(dataPos, valueCount); if (v) fields.push({ label: "File modified", value: v }); break; }
        case 0x9003: { const v = ascii(dataPos, valueCount); if (v) fields.push({ label: "Date taken", value: v }); break; }
        case 0x8825: hasGps = true; break;
        case 0x8769: walkIfd(base + u32(entryPos + 8), depth + 1); break;
      }
    }
  };

  walkIfd(base + u32(base + 4), 0);
  return { fields, hasGps };
}

function pngHasExif(bytes: Uint8Array): boolean {
  let pos = 8; // skip PNG signature
  while (pos + 8 <= bytes.length) {
    const length = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
    if (length === 0 || pos + 12 + length > bytes.length) return false;
    if (tagAt(bytes, pos + 4) === "eXIf") return true;
    if (tagAt(bytes, pos + 4) === "IDAT") return false; // eXIf precedes IDAT in practice
    pos += 12 + length;
  }
  return false;
}

function webpHasExif(bytes: Uint8Array): boolean {
  let pos = 12; // skip "RIFF" + size + "WEBP"
  while (pos + 8 <= bytes.length) {
    if (tagAt(bytes, pos) === "EXIF") return true;
    const size = (bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24)) >>> 0;
    pos += 8 + size + (size % 2); // chunks are word-aligned
  }
  return false;
}

const PRIVACY_NOTE =
  "Exports from FitMyPic are re-encoded from decoded pixels, so downloaded results never contain EXIF metadata.";

export async function readImageMeta(file: File): Promise<ImageMeta> {
  const bytes = await readPrefix(file, META_PREFIX_BYTES);
  const format = sniffFormat(bytes);
  if (format === "JPEG") {
    const exifStart = findJpegExif(bytes);
    if (exifStart === null) {
      return { format, hasExif: false, hasGps: false, fields: [], note: `No EXIF block found in this JPEG. ${PRIVACY_NOTE}` };
    }
    const parsed = parseExifTiff(bytes, exifStart);
    return {
      format,
      hasExif: true,
      hasGps: parsed.hasGps,
      fields: parsed.fields,
      note: parsed.hasGps
        ? `This JPEG carries EXIF metadata, including a GPS block. ${PRIVACY_NOTE}`
        : `This JPEG carries EXIF metadata. ${PRIVACY_NOTE}`,
    };
  }
  if (format === "PNG") {
    const hasExif = pngHasExif(bytes);
    return {
      format,
      hasExif,
      hasGps: false,
      fields: [],
      note: hasExif
        ? `This PNG has an eXIf chunk (uncommon for PNG files). ${PRIVACY_NOTE}`
        : `No EXIF chunk found in this PNG — PNG files normally do not carry camera EXIF. ${PRIVACY_NOTE}`,
    };
  }
  if (format === "WebP") {
    const hasExif = webpHasExif(bytes);
    return {
      format,
      hasExif,
      hasGps: false,
      fields: [],
      note: hasExif
        ? `This WebP has an EXIF chunk. ${PRIVACY_NOTE}`
        : `No EXIF chunk found in this WebP. ${PRIVACY_NOTE}`,
    };
  }
  return { format, hasExif: false, hasGps: false, fields: [], note: "Unknown container; metadata could not be inspected." };
}

// Lossless JPEG metadata strip: copies the file byte-for-byte minus metadata
// segments (APP1 EXIF/XMP, APP13 IPTC/Photoshop, COM comments). Colour profile
// (APP2) and Adobe APP14 are kept so decoding stays identical.
export async function stripJpegMetadata(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Metadata removal is available for JPEG files only.");
  }
  const chunks: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;
  let finished = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(bytes.slice(offset, offset + 2));
      offset += 2;
      continue;
    }
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const segmentEnd = offset + 2 + size;
    if (size < 2 || segmentEnd > bytes.length) break;
    if (marker === 0xda) {
      // Start of scan: the entropy-coded data follows, so copy the remainder
      // of the file verbatim, then stop.
      chunks.push(bytes.slice(offset, bytes.length));
      finished = true;
      break;
    }
    const isMetadata = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!isMetadata) chunks.push(bytes.slice(offset, segmentEnd));
    offset = segmentEnd;
  }
  if (!finished) throw new Error("Unexpected JPEG structure; the file was left untouched.");
  return new Blob(chunks as BlobPart[], { type: "image/jpeg" });
}
