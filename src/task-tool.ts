export {};

type FitMode = "cover" | "contain";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing task tool element: ${selector}`);
  return element;
}

const body = document.body;
const targetWidth = Number(body.dataset.toolWidth);
const targetHeight = Number(body.dataset.toolHeight);
const taskLabel = body.dataset.toolLabel || `${targetWidth}x${targetHeight}`;
const hasSafeArea = body.dataset.safeArea === "true";

const input = required<HTMLInputElement>("#taskFile");
const dropzone = required<HTMLElement>("#taskDropzone");
const sampleButton = required<HTMLButtonElement>("#taskSample");
const fitSelect = required<HTMLSelectElement>("#taskFit");
const formatSelect = required<HTMLSelectElement>("#taskFormat");
const qualityInput = required<HTMLInputElement>("#taskQuality");
const qualityValue = required<HTMLOutputElement>("#taskQualityValue");
const targetKbInput = required<HTMLInputElement>("#taskTargetKb");
const backgroundInput = required<HTMLInputElement>("#taskBackground");
const downloadButton = required<HTMLButtonElement>("#taskDownload");
const resetButton = required<HTMLButtonElement>("#taskReset");
const status = required<HTMLElement>("#taskStatus");
const resultCanvas = required<HTMLCanvasElement>("#taskResult");
const originalImage = required<HTMLImageElement>("#taskOriginal");
const emptyState = required<HTMLElement>("#taskEmpty");
const resultButton = required<HTMLButtonElement>("#taskResultTab");
const originalButton = required<HTMLButtonElement>("#taskOriginalTab");
const originalMetric = required<HTMLElement>("#taskOriginalMetric");
const outputMetric = required<HTMLElement>("#taskOutputMetric");
const previewStage = required<HTMLElement>("#taskPreviewStage");

let sourceImage: HTMLImageElement | null = null;
let sourceFile: File | null = null;
let sourceUrl = "";
let outputBlob: Blob | null = null;
let renderVersion = 0;

if (hasSafeArea) previewStage.classList.add("has-safe-area");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("This browser could not encode the image.")), type, quality);
  });
}

function drawOutput(image: HTMLImageElement, fit: FitMode): void {
  resultCanvas.width = targetWidth;
  resultCanvas.height = targetHeight;
  const context = resultCanvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const format = formatSelect.value;
  if (fit === "contain" || format === "image/jpeg") {
    context.fillStyle = backgroundInput.value;
    context.fillRect(0, 0, targetWidth, targetHeight);
  }

  const scale = fit === "cover"
    ? Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight)
    : Math.min(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (targetWidth - drawWidth) / 2, (targetHeight - drawHeight) / 2, drawWidth, drawHeight);
}

async function blobNearTarget(canvas: HTMLCanvasElement, targetBytes: number, version: number): Promise<Blob> {
  const type = formatSelect.value;
  if (type === "image/png") return canvasToBlob(canvas, type, 1);
  let low = 0.25;
  let high = 1;
  let best: { blob: Blob; distance: number } | null = null;
  for (let index = 0; index < 9; index += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, type, quality);
    if (version !== renderVersion) throw new DOMException("Cancelled", "AbortError");
    const distance = Math.abs(blob.size - targetBytes);
    if (!best || distance < best.distance) best = { blob, distance };
    if (blob.size > targetBytes) high = quality;
    else low = quality;
  }
  if (!best) throw new Error("Could not create the target-size result.");
  return best.blob;
}

async function render(): Promise<void> {
  if (!sourceImage || !sourceFile) return;
  const version = ++renderVersion;
  status.textContent = `Preparing the ${taskLabel} result...`;
  drawOutput(sourceImage, fitSelect.value as FitMode);
  try {
    const targetKb = Math.max(0, Number(targetKbInput.value));
    outputBlob = targetKb >= 10
      ? await blobNearTarget(resultCanvas, targetKb * 1024, version)
      : await canvasToBlob(resultCanvas, formatSelect.value, Number(qualityInput.value));
    if (version !== renderVersion) return;
    outputMetric.textContent = `${targetWidth} x ${targetHeight}, ${formatBytes(outputBlob.size)}, ${formatSelect.selectedOptions[0].text}`;
    const targetNote = targetKb >= 10 && formatSelect.value === "image/png"
      ? " PNG is lossless, so a precise KB target is not guaranteed."
      : "";
    status.textContent = `Result measured and ready to download.${targetNote}`;
    downloadButton.disabled = false;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      status.textContent = error instanceof Error ? error.message : "The preview could not be created.";
    }
  }
}

function show(mode: "result" | "original"): void {
  const original = mode === "original";
  originalImage.hidden = !original;
  resultCanvas.hidden = original;
  originalButton.classList.toggle("is-active", original);
  resultButton.classList.toggle("is-active", !original);
  originalButton.setAttribute("aria-pressed", String(original));
  resultButton.setAttribute("aria-pressed", String(!original));
}

async function loadFile(file: File): Promise<void> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    status.textContent = "Choose a JPG, PNG, or WebP image.";
    return;
  }
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This browser could not read the image."));
    image.src = sourceUrl;
  });
  sourceImage = image;
  sourceFile = file;
  originalImage.src = sourceUrl;
  originalImage.alt = `Original ${file.name}`;
  originalMetric.textContent = `${image.naturalWidth} x ${image.naturalHeight}, ${formatBytes(file.size)}`;
  emptyState.hidden = true;
  show("result");
  await render();
}

async function makeSample(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = hasSafeArea ? 1440 : 1200;
  canvas.height = hasSafeArea ? 900 : 800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#dcecff");
  gradient.addColorStop(1, "#f7f9fc");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1376d3";
  context.fillRect(canvas.width * 0.08, canvas.height * 0.12, canvas.width * 0.38, canvas.height * 0.76);
  context.fillStyle = "#ffffff";
  context.font = `700 ${Math.round(canvas.width * 0.055)}px Arial`;
  context.fillText(hasSafeArea ? "CLEAR" : "SQUARE", canvas.width * 0.13, canvas.height * 0.42);
  context.fillText(hasSafeArea ? "THUMBNAIL" : "OUTPUT", canvas.width * 0.13, canvas.height * 0.53);
  context.fillStyle = "#172033";
  context.beginPath();
  context.arc(canvas.width * 0.72, canvas.height * 0.48, canvas.height * 0.24, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#5bc0a7";
  context.beginPath();
  context.arc(canvas.width * 0.78, canvas.height * 0.4, canvas.height * 0.1, 0, Math.PI * 2);
  context.fill();
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  return new File([blob], "fitmypic-sample.jpg", { type: "image/jpeg" });
}

function reset(): void {
  renderVersion += 1;
  sourceImage = null;
  sourceFile = null;
  outputBlob = null;
  input.value = "";
  originalImage.removeAttribute("src");
  resultCanvas.width = targetWidth;
  resultCanvas.height = targetHeight;
  resultCanvas.getContext("2d")?.clearRect(0, 0, targetWidth, targetHeight);
  emptyState.hidden = false;
  originalMetric.textContent = "No image selected";
  outputMetric.textContent = `${targetWidth} x ${targetHeight} preset`;
  downloadButton.disabled = true;
  status.textContent = "Choose an image or try the sample to begin.";
  show("result");
}

dropzone.addEventListener("click", () => input.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    input.click();
  }
});
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  const file = event.dataTransfer?.files[0];
  if (file) void loadFile(file).catch((error) => { status.textContent = error.message; });
});
input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (file) void loadFile(file).catch((error) => { status.textContent = error.message; });
});
sampleButton.addEventListener("click", (event) => {
  event.stopPropagation();
  void makeSample().then(loadFile).catch((error) => { status.textContent = error.message; });
});
[fitSelect, formatSelect, qualityInput, targetKbInput, backgroundInput].forEach((control) => {
  control.addEventListener("input", () => {
    qualityValue.textContent = `${Math.round(Number(qualityInput.value) * 100)}%`;
    if (sourceImage) void render();
  });
});
resultButton.addEventListener("click", () => show("result"));
originalButton.addEventListener("click", () => show("original"));
resetButton.addEventListener("click", reset);
downloadButton.addEventListener("click", () => {
  if (!outputBlob || !sourceFile) return;
  const extension = formatSelect.value === "image/png" ? "png" : formatSelect.value === "image/webp" ? "webp" : "jpg";
  const url = URL.createObjectURL(outputBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sourceFile.name.replace(/\.[^.]+$/, "")}-${targetWidth}x${targetHeight}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = `Downloaded the measured ${formatBytes(outputBlob.size)} result.`;
});

qualityValue.textContent = `${Math.round(Number(qualityInput.value) * 100)}%`;
reset();
