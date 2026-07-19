import picaFactory from "pica";

const pica = picaFactory({ features: ["js", "wasm", "ww"] });

function get<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}

const fileInput = get<HTMLInputElement>("#fileInput");
const dropzone = get<HTMLElement>("#dropzone");
const widthInput = get<HTMLInputElement>("#widthInput");
const heightInput = get<HTMLInputElement>("#heightInput");
const lockRatioInput = get<HTMLInputElement>("#lockRatioInput");
const cropRatioSelect = get<HTMLSelectElement>("#cropRatioSelect");
const fitModeSelect = get<HTMLSelectElement>("#fitModeSelect");
const formatSelect = get<HTMLSelectElement>("#formatSelect");
const qualityInput = get<HTMLInputElement>("#qualityInput");
const qualityOutput = get<HTMLOutputElement>("#qualityOutput");
const targetSizeInput = get<HTMLInputElement>("#targetSizeInput");
const targetField = get<HTMLElement>(".target-field");
const downloadBtn = get<HTMLButtonElement>("#downloadBtn");
const targetDownloadBtn = get<HTMLButtonElement>("#targetDownloadBtn");
const cancelBtn = get<HTMLButtonElement>("#cancelBtn");
const resetBtn = get<HTMLButtonElement>("#resetBtn");
const resetTransformBtn = get<HTMLButtonElement>("#resetTransformBtn");
const rotateLeftBtn = get<HTMLButtonElement>("#rotateLeftBtn");
const rotateRightBtn = get<HTMLButtonElement>("#rotateRightBtn");
const flipHorizontalBtn = get<HTMLButtonElement>("#flipHorizontalBtn");
const flipVerticalBtn = get<HTMLButtonElement>("#flipVerticalBtn");
const statusBox = get<HTMLElement>("#status");
const progressBar = get<HTMLProgressElement>("#progressBar");
const previewCanvas = get<HTMLCanvasElement>("#previewCanvas");
const originalCanvas = get<HTMLCanvasElement>("#originalCanvas");
const resultPreviewBtn = get<HTMLButtonElement>("#resultPreviewBtn");
const originalPreviewBtn = get<HTMLButtonElement>("#originalPreviewBtn");
const previewMeasure = get<HTMLElement>("#previewMeasure");
const originalMeta = get<HTMLElement>("#originalMeta");
const outputMeta = get<HTMLElement>("#outputMeta");
const previewEmpty = get<HTMLElement>("#previewEmpty");
const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".preset"));

const originalContext = originalCanvas.getContext("2d")!;

let sourceImage: HTMLImageElement | null = null;
let sourceFile: File | null = null;
let sourceRatio = 1;
let rotation = 0;
let flipX = 1;
let flipY = 1;
let renderToken = 0;
let scheduledUpdate = 0;

const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement> = [
  widthInput, heightInput, lockRatioInput, cropRatioSelect, fitModeSelect, formatSelect,
  qualityInput, targetSizeInput, downloadBtn, resetBtn, resetTransformBtn,
  rotateLeftBtn, rotateRightBtn, flipHorizontalBtn, flipVerticalBtn,
  resultPreviewBtn, originalPreviewBtn, ...presetButtons,
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setStatus(message: string): void {
  statusBox.textContent = message;
}

function setBusy(busy: boolean, progress = 0): void {
  progressBar.hidden = !busy;
  cancelBtn.hidden = !busy;
  progressBar.value = progress;
  downloadBtn.disabled = busy || !sourceImage;
  if (!busy) syncTargetControls();
}

function enableControls(enabled: boolean): void {
  controls.forEach((control) => { control.disabled = !enabled; });
  syncTargetControls();
}

function syncTargetControls(): void {
  const available = Boolean(sourceImage) && formatSelect.value !== "image/png";
  targetSizeInput.disabled = !available;
  targetField.hidden = !available;
  const hasTarget = available && Number(targetSizeInput.value) >= 10;
  targetDownloadBtn.hidden = !hasTarget;
  targetDownloadBtn.disabled = !hasTarget;
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

function transformedSource(): HTMLCanvasElement {
  if (!sourceImage) throw new Error("Choose an image first.");
  const quarterTurn = Math.abs(rotation % 180) === 90;
  const canvas = document.createElement("canvas");
  canvas.width = quarterTurn ? sourceImage.naturalHeight : sourceImage.naturalWidth;
  canvas.height = quarterTurn ? sourceImage.naturalWidth : sourceImage.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.scale(flipX, flipY);
  context.drawImage(sourceImage, -sourceImage.naturalWidth / 2, -sourceImage.naturalHeight / 2);
  return canvas;
}

function ratioValue(value: string): number | null {
  if (value === "original") return null;
  const [width, height] = value.split(":").map(Number);
  return width / height;
}

function centeredCrop(width: number, height: number, ratio: number): { x: number; y: number; width: number; height: number } {
  const current = width / height;
  if (current > ratio) {
    const cropWidth = height * ratio;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  const cropHeight = width / ratio;
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight };
}

async function renderResult(token: number): Promise<HTMLCanvasElement> {
  if (!sourceImage || token !== renderToken) throw new DOMException("Cancelled", "AbortError");
  const width = Math.max(1, Math.round(Number(widthInput.value) || sourceImage.naturalWidth));
  const height = Math.max(1, Math.round(Number(heightInput.value) || sourceImage.naturalHeight));
  const transformed = transformedSource();
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("Canvas is unavailable in this browser.");
  if (formatSelect.value === "image/jpeg") {
    outputContext.fillStyle = "#ffffff";
    outputContext.fillRect(0, 0, width, height);
  }

  const cropRatio = ratioValue(cropRatioSelect.value);
  const mode = fitModeSelect.value;
  const targetRatio = width / height;

  if (mode === "contain") {
    const scale = Math.min(width / transformed.width, height / transformed.height);
    const resized = document.createElement("canvas");
    resized.width = Math.max(1, Math.round(transformed.width * scale));
    resized.height = Math.max(1, Math.round(transformed.height * scale));
    await pica.resize(transformed, resized, { quality: 3, alpha: true });
    if (token !== renderToken) throw new DOMException("Cancelled", "AbortError");
    outputContext.drawImage(resized, Math.round((width - resized.width) / 2), Math.round((height - resized.height) / 2));
  } else {
    const ratio = cropRatio ?? (mode === "cover" ? targetRatio : transformed.width / transformed.height);
    const crop = centeredCrop(transformed.width, transformed.height, ratio);
    const cropped = document.createElement("canvas");
    cropped.width = Math.max(1, Math.round(crop.width));
    cropped.height = Math.max(1, Math.round(crop.height));
    const cropContext = cropped.getContext("2d");
    if (!cropContext) throw new Error("Canvas is unavailable in this browser.");
    cropContext.drawImage(transformed, crop.x, crop.y, crop.width, crop.height, 0, 0, cropped.width, cropped.height);
    await pica.resize(cropped, output, { quality: 3, alpha: true });
  }
  if (token !== renderToken) throw new DOMException("Cancelled", "AbortError");
  return output;
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode this image.")), mimeType, quality);
  });
}

async function updatePreview(): Promise<void> {
  if (!sourceImage) return;
  const token = ++renderToken;
  setStatus("Updating preview...");
  try {
    const result = await renderResult(token);
    previewCanvas.width = result.width;
    previewCanvas.height = result.height;
    previewCanvas.getContext("2d")?.drawImage(result, 0, 0);
    const blob = await canvasBlob(result, formatSelect.value, Number(qualityInput.value));
    if (token !== renderToken) return;
    outputMeta.textContent = `${result.width} x ${result.height}, ${formatBytes(blob.size)}`;
    const saving = sourceFile ? (1 - blob.size / sourceFile.size) * 100 : 0;
    previewMeasure.textContent = saving > 0 ? `${saving.toFixed(0)}% smaller · ${formatBytes(blob.size)}` : `${formatBytes(blob.size)} output`;
    setStatus("Preview ready. Compare the result, then download when it looks right.");
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) setStatus(error instanceof Error ? error.message : "Preview failed.");
  }
}

function schedulePreview(): void {
  window.clearTimeout(scheduledUpdate);
  scheduledUpdate = window.setTimeout(() => { void updatePreview(); }, 80);
}

function setPreviewMode(mode: "result" | "original"): void {
  const original = mode === "original";
  originalCanvas.classList.toggle("is-hidden", !original);
  previewCanvas.classList.toggle("is-hidden", original);
  originalPreviewBtn.classList.toggle("is-active", original);
  resultPreviewBtn.classList.toggle("is-active", !original);
  originalPreviewBtn.setAttribute("aria-pressed", String(original));
  resultPreviewBtn.setAttribute("aria-pressed", String(!original));
}

function baseName(name: string): string { return name.replace(/\.[^.]+$/, "") || "image"; }
function extensionFor(type: string): string { return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"; }

function downloadBlob(blob: Blob, label = ""): void {
  if (!sourceFile) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = label ? `-${label}` : "";
  link.href = url;
  link.download = `${baseName(sourceFile.name)}-${previewCanvas.width}x${previewCanvas.height}${suffix}.${extensionFor(formatSelect.value)}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportNearTarget(canvas: HTMLCanvasElement, targetBytes: number, token: number): Promise<{ blob: Blob; quality: number }> {
  let low = 0.35;
  let high = 1;
  let best: { blob: Blob; quality: number; distance: number } | null = null;
  for (let step = 0; step < 9; step += 1) {
    if (token !== renderToken) throw new DOMException("Cancelled", "AbortError");
    const quality = (low + high) / 2;
    const blob = await canvasBlob(canvas, formatSelect.value, quality);
    const distance = Math.abs(blob.size - targetBytes);
    if (!best || distance < best.distance) best = { blob, quality, distance };
    if (blob.size > targetBytes) high = quality; else low = quality;
    progressBar.value = 40 + (step + 1) * 6;
  }
  if (!best) throw new Error("The browser could not create a target-size image.");
  return best;
}

async function loadFile(file: File | undefined): Promise<void> {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    setStatus("Please choose a JPG, PNG, or WebP image.");
    return;
  }
  sourceFile = file;
  sourceImage = await fileToImage(file);
  sourceRatio = sourceImage.naturalWidth / sourceImage.naturalHeight;
  widthInput.value = String(sourceImage.naturalWidth);
  heightInput.value = String(sourceImage.naturalHeight);
  originalCanvas.width = sourceImage.naturalWidth;
  originalCanvas.height = sourceImage.naturalHeight;
  originalContext.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
  originalContext.drawImage(sourceImage, 0, 0);
  originalMeta.textContent = `${sourceImage.naturalWidth} x ${sourceImage.naturalHeight}, ${formatBytes(file.size)}`;
  previewEmpty.hidden = true;
  formatSelect.value = file.type === "image/jpeg" ? "image/jpeg" : file.type;
  enableControls(true);
  resetTransforms(false);
  setPreviewMode("result");
  await updatePreview();
}

function resetTransforms(render = true): void {
  if (!sourceImage) return;
  rotation = 0;
  flipX = 1;
  flipY = 1;
  cropRatioSelect.value = "original";
  fitModeSelect.value = "cover";
  widthInput.value = String(sourceImage.naturalWidth);
  heightInput.value = String(sourceImage.naturalHeight);
  lockRatioInput.checked = true;
  if (render) schedulePreview();
}

function resetAll(): void {
  renderToken += 1;
  sourceImage = null;
  sourceFile = null;
  fileInput.value = "";
  previewCanvas.width = 800;
  previewCanvas.height = 520;
  originalCanvas.width = 800;
  originalCanvas.height = 520;
  previewEmpty.hidden = false;
  originalMeta.textContent = "-";
  outputMeta.textContent = "-";
  previewMeasure.textContent = "Measured after processing";
  targetSizeInput.value = "";
  enableControls(false);
  setBusy(false);
  setStatus("Choose an image to start.");
}

function bindDropzone(): void {
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
  });
  dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault(); dropzone.classList.remove("dragover");
    void loadFile(event.dataTransfer?.files[0]).catch((error) => setStatus(error.message));
  });
  fileInput.addEventListener("change", () => { void loadFile(fileInput.files?.[0]).catch((error) => setStatus(error.message)); });
}

widthInput.addEventListener("input", () => {
  if (sourceImage && lockRatioInput.checked) heightInput.value = String(Math.max(1, Math.round(Number(widthInput.value) / sourceRatio)));
  schedulePreview();
});
heightInput.addEventListener("input", () => {
  if (sourceImage && lockRatioInput.checked) widthInput.value = String(Math.max(1, Math.round(Number(heightInput.value) * sourceRatio)));
  schedulePreview();
});
cropRatioSelect.addEventListener("change", () => {
  const ratio = ratioValue(cropRatioSelect.value);
  if (ratio && Number(widthInput.value)) heightInput.value = String(Math.max(1, Math.round(Number(widthInput.value) / ratio)));
  schedulePreview();
});
[fitModeSelect, formatSelect].forEach((control) => control.addEventListener("change", () => { syncTargetControls(); schedulePreview(); }));
qualityInput.addEventListener("input", () => { qualityOutput.textContent = `${Math.round(Number(qualityInput.value) * 100)}%`; schedulePreview(); });
targetSizeInput.addEventListener("input", syncTargetControls);

rotateLeftBtn.addEventListener("click", () => { rotation = (rotation - 90) % 360; schedulePreview(); });
rotateRightBtn.addEventListener("click", () => { rotation = (rotation + 90) % 360; schedulePreview(); });
flipHorizontalBtn.addEventListener("click", () => { flipX *= -1; schedulePreview(); });
flipVerticalBtn.addEventListener("click", () => { flipY *= -1; schedulePreview(); });
resetTransformBtn.addEventListener("click", () => resetTransforms());
resetBtn.addEventListener("click", resetAll);
resultPreviewBtn.addEventListener("click", () => setPreviewMode("result"));
originalPreviewBtn.addEventListener("click", () => setPreviewMode("original"));

presetButtons.forEach((button) => button.addEventListener("click", () => {
  widthInput.value = button.dataset.width ?? widthInput.value;
  heightInput.value = button.dataset.height ?? heightInput.value;
  lockRatioInput.checked = false;
  schedulePreview();
  setStatus(`Preset applied: ${button.textContent?.trim()}.`);
}));

downloadBtn.addEventListener("click", async () => {
  if (!sourceImage) return;
  const token = ++renderToken;
  setBusy(true, 15);
  setStatus("Preparing your image...");
  try {
    const canvas = await renderResult(token);
    progressBar.value = 75;
    const blob = await canvasBlob(canvas, formatSelect.value, Number(qualityInput.value));
    if (token !== renderToken) return;
    progressBar.value = 100;
    downloadBlob(blob);
    setStatus(`Downloaded ${formatBytes(blob.size)} image.`);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) setStatus(error instanceof Error ? error.message : "Export failed.");
  } finally { setBusy(false); }
});

targetDownloadBtn.addEventListener("click", async () => {
  if (!sourceImage) return;
  const targetKb = Number(targetSizeInput.value);
  const token = ++renderToken;
  setBusy(true, 10);
  setStatus(`Finding the closest result to ${targetKb} KB...`);
  try {
    const canvas = await renderResult(token);
    progressBar.value = 40;
    const result = await exportNearTarget(canvas, targetKb * 1024, token);
    qualityInput.value = result.quality.toFixed(2);
    qualityOutput.textContent = `${Math.round(result.quality * 100)}%`;
    downloadBlob(result.blob, `target-${targetKb}kb`);
    setStatus(`Downloaded ${formatBytes(result.blob.size)}, the closest browser result to ${targetKb} KB.`);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) setStatus(error instanceof Error ? error.message : "Target export failed.");
  } finally { setBusy(false); }
});

cancelBtn.addEventListener("click", () => { renderToken += 1; setBusy(false); setStatus("Processing cancelled."); });
window.addEventListener("paste", (event) => {
  const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (file) { event.preventDefault(); void loadFile(file).catch((error) => setStatus(error.message)); }
});

bindDropzone();
enableControls(false);
