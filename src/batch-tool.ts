// Batch compressor for FitMyPic. Images are processed strictly one at a time
// with the same device-memory pixel limits as the single-image tool, so a big
// queue cannot spike memory the way an all-at-once loop would. Everything runs
// locally; the only network-visible side effect is the page itself.
import JSZip from "jszip";
import picaFactory from "pica";

const pica = picaFactory({ features: ["js", "wasm", "ww"] });

const deviceMemoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
const MAX_EDGE = 12_000;
const MAX_SOURCE_PIXELS = deviceMemoryGb <= 4 ? 24_000_000 : 48_000_000;
const MAX_OUTPUT_PIXELS = deviceMemoryGb <= 4 ? 16_000_000 : 32_000_000;

type QueueItem = {
  file: File;
  row: HTMLDivElement;
  meta: HTMLSpanElement;
};

type OutputItem = {
  blob: Blob;
  filename: string;
  inputSize: number;
  width: number;
  height: number;
};

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing batch tool element: ${selector}`);
  return element;
}

const input = required<HTMLInputElement>("#batchFile");
const dropzone = required<HTMLElement>("#batchDropzone");
const listElement = required<HTMLElement>("#batchList");
const emptyState = required<HTMLElement>("#batchEmpty");
const formatSelect = required<HTMLSelectElement>("#batchFormat");
const qualityInput = required<HTMLInputElement>("#batchQuality");
const qualityValue = required<HTMLOutputElement>("#batchQualityValue");
const maxWidthInput = required<HTMLInputElement>("#batchMaxWidth");
const convertButton = required<HTMLButtonElement>("#batchConvert");
const cancelButton = required<HTMLButtonElement>("#batchCancel");
const clearButton = required<HTMLButtonElement>("#batchClear");
const zipButton = required<HTMLButtonElement>("#batchZip");
const progress = required<HTMLProgressElement>("#batchProgress");
const status = required<HTMLElement>("#batchStatus");
const countElement = required<HTMLElement>("#batchCount");
const resultsElement = required<HTMLElement>("#batchResults");

const queue: QueueItem[] = [];
const outputs: OutputItem[] = [];
const outputUrls: string[] = [];
let busy = false;
let runToken = 0;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "image";
}

function extensionFor(mimeType: string): string {
  return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode this image.")), mimeType, quality);
  });
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`The browser could not read ${file.name}.`)); };
    image.src = url;
  });
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

function releaseOutputUrls(): void {
  while (outputUrls.length) URL.revokeObjectURL(outputUrls.pop() as string);
}

function renderQueue(): void {
  countElement.textContent = `${queue.length} file${queue.length === 1 ? "" : "s"}`;
  emptyState.hidden = queue.length > 0;
  const enabled = queue.length > 0;
  convertButton.disabled = !enabled || busy;
  clearButton.disabled = !enabled || busy;
  if (!enabled) status.textContent = "Choose images to start.";
}

function makeRow(file: File): QueueItem {
  const row = document.createElement("div");
  row.className = "batch-queue-row";
  const info = document.createElement("div");
  info.className = "file-info";
  const name = document.createElement("strong");
  name.textContent = file.name;
  const meta = document.createElement("span");
  meta.textContent = formatBytes(file.size);
  info.append(name, meta);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "file-remove";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Remove ${file.name}`);
  remove.addEventListener("click", () => {
    if (busy) return;
    const index = queue.findIndex((item) => item.file === file);
    if (index >= 0) { queue.splice(index, 1); row.remove(); renderQueue(); }
  });
  row.append(info, remove);
  listElement.append(row);
  return { file, row, meta };
}

function addFiles(files: FileList): void {
  const accepted = Array.from(files).filter((file) =>
    ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
  queue.push(...accepted.map(makeRow));
  renderQueue();
  const skipped = files.length - accepted.length;
  if (skipped > 0) status.textContent = `${accepted.length} file${accepted.length === 1 ? "" : "s"} added. ${skipped} unsupported file${skipped === 1 ? " was" : "s were"} skipped.`;
  else if (accepted.length) status.textContent = `${accepted.length} file${accepted.length === 1 ? " is" : "s are"} queued. Pick a format, then convert.`;
}

async function convertOne(item: QueueItem, token: number): Promise<OutputItem> {
  const image = await fileToImage(item.file);
  if (token !== runToken) throw new DOMException("Cancelled", "AbortError");
  const sourcePixels = image.naturalWidth * image.naturalHeight;
  if (image.naturalWidth > MAX_EDGE || image.naturalHeight > MAX_EDGE || sourcePixels > MAX_SOURCE_PIXELS) {
    throw new Error(`${item.file.name}: ${image.naturalWidth} × ${image.naturalHeight} is too large for safe processing on this device (limit ${(MAX_SOURCE_PIXELS / 1_000_000).toFixed(0)} MP). Skipped.`);
  }

  const maxWidth = Math.max(0, Number(maxWidthInput.value));
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  if (maxWidth > 0 && width > maxWidth) {
    width = maxWidth;
    height = Math.max(1, Math.round((image.naturalHeight * maxWidth) / image.naturalWidth));
  }
  if (width * height > MAX_OUTPUT_PIXELS) {
    const scale = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  const mimeType = formatSelect.value;
  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  if (width === image.naturalWidth && height === image.naturalHeight) {
    context.drawImage(image, 0, 0);
  } else {
    // Same step-down + pica path as the single-image tool for matching quality.
    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    source.getContext("2d")?.drawImage(image, 0, 0);
    await pica.resize(source, output, { quality: 3, alpha: true });
  }
  if (token !== runToken) throw new DOMException("Cancelled", "AbortError");

  const quality = mimeType === "image/png" ? 1 : Number(qualityInput.value);
  const blob = await canvasBlob(output, mimeType, quality);
  if (token !== runToken) throw new DOMException("Cancelled", "AbortError");
  const suffix = width === image.naturalWidth && height === image.naturalHeight ? "" : `-${width}x${height}`;
  return { blob, filename: `${baseName(item.file.name)}${suffix}.${extensionFor(mimeType)}`, inputSize: item.file.size, width, height };
}

function renderOutput(output: OutputItem): void {
  const row = document.createElement("div");
  row.className = "batch-result-row";
  const info = document.createElement("div");
  info.className = "file-info";
  const name = document.createElement("strong");
  name.textContent = output.filename;
  const meta = document.createElement("span");
  const delta = output.blob.size - output.inputSize;
  const change = delta === 0 ? "same size" : `${delta < 0 ? "−" : "+"}${formatBytes(Math.abs(delta))}`;
  meta.textContent = `${output.width} × ${output.height} · ${formatBytes(output.blob.size)} (${change} vs original)`;
  info.append(name, meta);
  const action = document.createElement("button");
  action.type = "button";
  action.className = "secondary-button";
  action.textContent = "Download";
  action.addEventListener("click", () => downloadBlob(output.blob, output.filename));
  row.append(info, action);
  resultsElement.append(row);
}

function resetOutputs(): void {
  releaseOutputUrls();
  outputs.length = 0;
  resultsElement.replaceChildren();
  zipButton.hidden = true;
}

function setBusy(value: boolean): void {
  busy = value;
  convertButton.disabled = value || queue.length === 0;
  clearButton.disabled = value || queue.length === 0;
  cancelButton.hidden = !value;
  input.disabled = value;
}

convertButton.addEventListener("click", async () => {
  if (!queue.length) return;
  const token = ++runToken;
  resetOutputs();
  progress.hidden = false;
  progress.value = 0;
  setBusy(true);
  let failed = 0;
  try {
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      status.textContent = `Processing ${index + 1} of ${queue.length}: ${item.file.name}`;
      item.row.classList.add("is-processing");
      try {
        const output = await convertOne(item, token);
        outputs.push(output);
        renderOutput(output);
        item.meta.textContent = `${formatBytes(item.file.size)} → ${formatBytes(output.blob.size)}`;
        item.row.classList.add("is-done");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        failed += 1;
        item.meta.textContent = error instanceof Error ? error.message : "Failed.";
      } finally {
        item.row.classList.remove("is-processing");
      }
      progress.value = ((index + 1) / queue.length) * 100;
      // Yield to the UI loop so the progress bar paints between files.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    zipButton.hidden = outputs.length < 2;
    zipButton.textContent = `Download all ${outputs.length} files as ZIP`;
    const inputBytes = outputs.reduce((sum, output) => sum + output.inputSize, 0);
    const outputBytes = outputs.reduce((sum, output) => sum + output.blob.size, 0);
    const saved = inputBytes > 0 ? ` Input ${formatBytes(inputBytes)} → output ${formatBytes(outputBytes)}.` : "";
    status.textContent = failed
      ? `Done: ${outputs.length} converted, ${failed} skipped (see the queue for reasons).${saved}`
      : `Done: ${outputs.length} file${outputs.length === 1 ? "" : "s"} converted and measured.${saved}`;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      status.textContent = "Batch cancelled. Files already processed can be downloaded above.";
    } else {
      status.textContent = error instanceof Error ? error.message : "Batch conversion failed.";
    }
  } finally {
    setBusy(false);
    window.setTimeout(() => { progress.hidden = true; }, 600);
  }
});

cancelButton.addEventListener("click", () => {
  runToken += 1;
  setBusy(false);
  status.textContent = "Batch cancelled. Files already processed can be downloaded above.";
});

clearButton.addEventListener("click", () => {
  if (busy) return;
  queue.length = 0;
  listElement.replaceChildren();
  resetOutputs();
  renderQueue();
});

zipButton.addEventListener("click", async () => {
  if (outputs.length < 2) return;
  status.textContent = "Packaging the batch into one ZIP...";
  try {
    const zip = new JSZip();
    const used = new Map<string, number>();
    outputs.forEach((output) => {
      let name = output.filename;
      const seen = used.get(name);
      if (seen !== undefined) {
        used.set(name, seen + 1);
        name = `${baseName(output.filename)}-${seen + 1}.${extensionFor(output.blob.type)}`;
      } else {
        used.set(name, 0);
      }
      zip.file(name, output.blob);
    });
    // STORE: JPG/PNG/WebP are already compressed, DEFLATE would burn memory
    // and CPU for no meaningful gain.
    const archive = await zip.generateAsync({ type: "blob", compression: "STORE" });
    downloadBlob(archive, `fitmypic-batch-${outputs.length}-files.zip`);
    status.textContent = `ZIP downloaded (${formatBytes(archive.size)}, ${outputs.length} files).`;
  } catch {
    status.textContent = "This browser could not build the ZIP archive.";
  }
});

input.addEventListener("change", () => { if (input.files) addFiles(input.files); input.value = ""; });
dropzone.addEventListener("click", () => input.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); input.click(); }
});
dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
});
qualityInput.addEventListener("input", () => { qualityValue.textContent = `${Math.round(Number(qualityInput.value) * 100)}%`; });

renderQueue();
