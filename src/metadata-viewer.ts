// Standalone EXIF viewer for image-metadata-viewer.html.
// Reuses the parser from exif.ts: everything stays local, nothing is uploaded.
import { readImageMeta, stripJpegMetadata, type ImageMeta } from "./exif";

function get<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}

const dropzone = get<HTMLElement>("#mvDropzone");
const fileInput = get<HTMLInputElement>("#mvFile");
const report = get<HTMLElement>("#mvReport");
const summary = get<HTMLElement>("#mvSummary");
const fieldsList = get<HTMLUListElement>("#mvFields");
const note = get<HTMLElement>("#mvNote");
const stripBtn = get<HTMLButtonElement>("#mvStripBtn");
const status = get<HTMLElement>("#mvStatus");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The browser could not read this image.")); };
    image.src = url;
  });
}

let currentFile: File | null = null;

async function inspect(file: File): Promise<void> {
  status.textContent = "Reading the file locally...";
  stripBtn.hidden = true;
  let meta: ImageMeta;
  try {
    meta = await readImageMeta(file);
  } catch {
    status.textContent = "This file could not be inspected.";
    return;
  }
  let dimensions = "";
  try {
    const image = await fileToImage(file);
    dimensions = `${image.naturalWidth} × ${image.naturalHeight} px (${((image.naturalWidth * image.naturalHeight) / 1_000_000).toFixed(2)} MP) · `;
  } catch {
    // Decode failure does not block the byte-level metadata report.
  }
  currentFile = file;
  report.hidden = false;
  summary.textContent = `${dimensions}${meta.format} · ${formatBytes(file.size)} · ${meta.hasExif ? (meta.hasGps ? "EXIF with GPS" : "EXIF, no GPS") : "no EXIF"}`;
  summary.className = meta.hasGps ? "meta-summary has-gps" : "meta-summary";
  fieldsList.replaceChildren();
  for (const field of meta.fields) {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = field.label;
    const value = document.createElement("span");
    value.textContent = field.value;
    item.append(label, value);
    fieldsList.append(item);
  }
  if (meta.fields.length === 0) {
    const item = document.createElement("li");
    item.className = "meta-empty";
    item.textContent = meta.hasExif ? "EXIF block present, but it contains no text fields this reader displays." : "No readable EXIF fields in this file.";
    fieldsList.append(item);
  }
  note.textContent = meta.note;
  // Lossless removal exists for JPEG only: PNG/WebP files rarely carry camera
  // EXIF, and re-encoding them would not be lossless.
  stripBtn.hidden = !(meta.format === "JPEG" && meta.hasExif);
  status.textContent = "Report complete. Nothing left your device.";
}

stripBtn.addEventListener("click", async () => {
  if (!currentFile) return;
  stripBtn.disabled = true;
  status.textContent = "Building a metadata-free copy...";
  try {
    const clean = await stripJpegMetadata(currentFile);
    const saved = currentFile.size - clean.size;
    const stem = currentFile.name.replace(/\.[^.]+$/, "") || "image";
    downloadBlob(clean, `${stem}-no-metadata.jpg`);
    status.textContent = `Downloaded a clean copy: ${formatBytes(clean.size)} (removed ${formatBytes(saved)} of metadata). Pixels untouched — this was a byte-level edit.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Metadata removal failed.";
  } finally {
    stripBtn.disabled = false;
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void inspect(file);
  fileInput.value = "";
});
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
});
dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const file = event.dataTransfer?.files[0];
  if (file) void inspect(file);
});
