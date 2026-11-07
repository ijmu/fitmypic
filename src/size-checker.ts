// Lightweight image size checker for image-size-checker.html.
// One file in, the real numbers out: dimensions, format, bytes, pixel count.
import { readImageMeta } from "./exif";

function get<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}

const dropzone = get<HTMLElement>("#scDropzone");
const fileInput = get<HTMLInputElement>("#scFile");
const report = get<HTMLElement>("#scReport");
const summary = get<HTMLElement>("#scSummary");
const fieldsList = get<HTMLUListElement>("#scFields");
const status = get<HTMLElement>("#scStatus");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The browser could not decode this image.")); };
    image.src = url;
  });
}

function addRow(label: string, value: string): void {
  const item = document.createElement("li");
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = value;
  item.append(strong, span);
  fieldsList.append(item);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

async function inspect(file: File): Promise<void> {
  status.textContent = "Reading the file locally...";
  report.hidden = true;
  const image = await fileToImage(file).catch(() => null);
  const bytes = await readImageMeta(file).catch(() => null);
  const width = image?.naturalWidth ?? 0;
  const height = image?.naturalHeight ?? 0;
  const pixels = width * height;
  const format = bytes?.format ?? "Unknown";
  const divisor = gcd(width, height) || 1;
  report.hidden = false;
  summary.textContent = `${width} × ${height} px · ${format} · ${formatBytes(file.size)}`;
  fieldsList.replaceChildren();
  addRow("Dimensions", `${width} × ${height} px`);
  addRow("Pixel count", `${pixels.toLocaleString("en-US")} (${(pixels / 1_000_000).toFixed(2)} MP)`);
  addRow("File size", `${formatBytes(file.size)} (${file.size.toLocaleString("en-US")} bytes)`);
  addRow("Format", bytes ? format : "Unrecognised container");
  addRow("Aspect ratio", width && height ? `${width / divisor}:${height / divisor} (${(width / height).toFixed(3)})` : "-");
  addRow("Orientation", !width ? "-" : width > height ? "Landscape" : width < height ? "Portrait" : "Square");
  addRow("Bytes per pixel", pixels ? (file.size / pixels).toFixed(2) : "-");
  addRow("EXIF metadata", bytes ? (bytes.hasExif ? (bytes.hasGps ? "Present, includes GPS" : "Present") : "None found") : "Not inspected");
  status.textContent = "All values measured from the file itself. Nothing was uploaded.";
}

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
