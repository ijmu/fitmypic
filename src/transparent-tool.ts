export {};

type Rgb = { r: number; g: number; b: number };

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing transparent tool element: ${selector}`);
  return element;
}

const fileInput = required<HTMLInputElement>("#transparentFile");
const dropzone = required<HTMLElement>("#transparentDropzone");
const sampleButton = required<HTMLButtonElement>("#transparentSample");
const modeSelect = required<HTMLSelectElement>("#transparentMode");
const colorInput = required<HTMLInputElement>("#transparentColor");
const toleranceInput = required<HTMLInputElement>("#transparentTolerance");
const toleranceValue = required<HTMLOutputElement>("#transparentToleranceValue");
const featherInput = required<HTMLInputElement>("#transparentFeather");
const featherValue = required<HTMLOutputElement>("#transparentFeatherValue");
const downloadButton = required<HTMLButtonElement>("#transparentDownload");
const resetButton = required<HTMLButtonElement>("#transparentReset");
const status = required<HTMLElement>("#transparentStatus");
const resultCanvas = required<HTMLCanvasElement>("#transparentResult");
const originalCanvas = required<HTMLCanvasElement>("#transparentOriginal");
const resultButton = required<HTMLButtonElement>("#transparentResultTab");
const originalButton = required<HTMLButtonElement>("#transparentOriginalTab");
const emptyState = required<HTMLElement>("#transparentEmpty");
const originalMetric = required<HTMLElement>("#transparentOriginalMetric");
const outputMetric = required<HTMLElement>("#transparentOutputMetric");
// Optional background-replacement controls: pages without them keep transparent-only output.
const fillSelect = document.querySelector<HTMLSelectElement>("#transparentFill");
const fillColorInput = document.querySelector<HTMLInputElement>("#transparentFillColor");

let sourceFile: File | null = null;
let originalData: ImageData | null = null;
let outputBlob: Blob | null = null;
let measureVersion = 0;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function distance(data: Uint8ClampedArray, index: number, target: Rgb): number {
  return Math.hypot(data[index] - target.r, data[index + 1] - target.g, data[index + 2] - target.b);
}

function removeConnectedEdges(data: Uint8ClampedArray, width: number, height: number, target: Rgb, tolerance: number, feather: number): void {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const limit = tolerance + feather;
  let head = 0;
  let tail = 0;
  const enqueue = (pixel: number): void => {
    if (visited[pixel] || distance(data, pixel * 4, target) > limit) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const index = pixel * 4;
    const colorDistance = distance(data, index, target);
    data[index + 3] = colorDistance <= tolerance
      ? 0
      : Math.round(data[index + 3] * ((colorDistance - tolerance) / Math.max(1, feather)));
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("This browser could not encode PNG output.")), "image/png");
  });
}

async function process(): Promise<void> {
  if (!originalData) return;
  const version = ++measureVersion;
  const tolerance = Number(toleranceInput.value);
  const feather = Number(featherInput.value);
  const target = hexToRgb(colorInput.value);
  const output = new ImageData(new Uint8ClampedArray(originalData.data), originalData.width, originalData.height);

  if (modeSelect.value === "global") {
    for (let index = 0; index < output.data.length; index += 4) {
      const colorDistance = distance(output.data, index, target);
      if (colorDistance <= tolerance) output.data[index + 3] = 0;
      else if (feather > 0 && colorDistance <= tolerance + feather) {
        output.data[index + 3] = Math.round(output.data[index + 3] * ((colorDistance - tolerance) / feather));
      }
    }
  } else {
    removeConnectedEdges(output.data, output.width, output.height, target, tolerance, feather);
  }

  const fillMode = fillSelect ? fillSelect.value : "none";
  if (fillMode !== "none") {
    const fillHex = fillMode === "custom" ? fillColorInput?.value || "#ffffff" : fillMode === "black" ? "#000000" : "#ffffff";
    const fill = hexToRgb(fillHex);
    for (let index = 0; index < output.data.length; index += 4) {
      const alpha = output.data[index + 3] / 255;
      output.data[index] = Math.round(output.data[index] * alpha + fill.r * (1 - alpha));
      output.data[index + 1] = Math.round(output.data[index + 1] * alpha + fill.g * (1 - alpha));
      output.data[index + 2] = Math.round(output.data[index + 2] * alpha + fill.b * (1 - alpha));
      output.data[index + 3] = 255;
    }
  }

  resultCanvas.width = output.width;
  resultCanvas.height = output.height;
  resultCanvas.getContext("2d")?.putImageData(output, 0, 0);
  const transparentPixels = output.data.filter((_, index) => index % 4 === 3 && output.data[index] === 0).length;
  const transparentPercent = transparentPixels / (output.width * output.height) * 100;
  outputBlob = await canvasBlob(resultCanvas);
  if (version !== measureVersion) return;
  outputMetric.textContent = fillMode === "none"
    ? `${output.width} x ${output.height}, ${transparentPercent.toFixed(1)}% fully transparent, ${formatBytes(outputBlob.size)}`
    : `${output.width} x ${output.height}, background replaced with ${fillMode === "custom" ? fillColorInput?.value || "a custom color" : fillMode}, ${formatBytes(outputBlob.size)}`;
  status.textContent = fillMode === "none"
    ? "Result measured. Click the preview to sample another background color or download the PNG."
    : "Result measured with the new background. Download the PNG or switch back to transparent.";
  downloadButton.disabled = false;
}

function show(mode: "result" | "original"): void {
  const original = mode === "original";
  originalCanvas.hidden = !original;
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
  const url = URL.createObjectURL(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This browser could not read the image."));
    image.src = url;
  });
  sourceFile = file;
  originalCanvas.width = image.naturalWidth;
  originalCanvas.height = image.naturalHeight;
  const context = originalCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.drawImage(image, 0, 0);
  originalData = context.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
  URL.revokeObjectURL(url);
  originalMetric.textContent = `${image.naturalWidth} x ${image.naturalHeight}, ${formatBytes(file.size)}`;
  emptyState.hidden = true;
  colorInput.value = rgbToHex(originalData.data[0], originalData.data[1], originalData.data[2]);
  show("result");
  await process();
}

async function makeSample(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 700;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.fillStyle = "#f4f4f4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0f7759";
  context.beginPath();
  context.roundRect(260, 150, 480, 400, 70);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "700 76px Arial";
  context.textAlign = "center";
  context.fillText("PNG", 500, 330);
  context.font = "32px Arial";
  context.fillText("sample object", 500, 390);
  context.fillStyle = "#efb84c";
  context.beginPath();
  context.arc(690, 190, 56, 0, Math.PI * 2);
  context.fill();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not create the sample.")), "image/jpeg", 0.94);
  });
  return new File([blob], "solid-background-sample.jpg", { type: "image/jpeg" });
}

function sampleColor(event: MouseEvent, canvas: HTMLCanvasElement): void {
  if (!originalData) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(originalData.width - 1, Math.floor((event.clientX - rect.left) / rect.width * originalData.width)));
  const y = Math.max(0, Math.min(originalData.height - 1, Math.floor((event.clientY - rect.top) / rect.height * originalData.height)));
  const index = (y * originalData.width + x) * 4;
  colorInput.value = rgbToHex(originalData.data[index], originalData.data[index + 1], originalData.data[index + 2]);
  status.textContent = `Sampled ${colorInput.value}. Rechecking the result...`;
  void process();
}

function reset(): void {
  measureVersion += 1;
  sourceFile = null;
  originalData = null;
  outputBlob = null;
  fileInput.value = "";
  originalCanvas.width = 900;
  originalCanvas.height = 600;
  resultCanvas.width = 900;
  resultCanvas.height = 600;
  emptyState.hidden = false;
  modeSelect.value = "edges";
  colorInput.value = "#ffffff";
  toleranceInput.value = "35";
  featherInput.value = "18";
  toleranceValue.textContent = "35";
  featherValue.textContent = "18";
  if (fillSelect) fillSelect.value = "none";
  if (fillColorInput) { fillColorInput.value = "#ffffff"; fillColorInput.disabled = true; }
  originalMetric.textContent = "No image selected";
  outputMetric.textContent = "Measured after processing";
  downloadButton.disabled = true;
  status.textContent = "Choose an image or try the sample to begin.";
  show("result");
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
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
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file).catch((error) => { status.textContent = error.message; });
});
sampleButton.addEventListener("click", (event) => {
  event.stopPropagation();
  void makeSample().then(loadFile).catch((error) => { status.textContent = error.message; });
});
[modeSelect, colorInput, toleranceInput, featherInput].forEach((control) => {
  control.addEventListener("input", () => {
    toleranceValue.textContent = toleranceInput.value;
    featherValue.textContent = featherInput.value;
    if (originalData) void process();
  });
});
resultCanvas.addEventListener("click", (event) => sampleColor(event, resultCanvas));
originalCanvas.addEventListener("click", (event) => sampleColor(event, originalCanvas));
resultButton.addEventListener("click", () => show("result"));
originalButton.addEventListener("click", () => show("original"));
resetButton.addEventListener("click", reset);
downloadButton.addEventListener("click", () => {
  if (!outputBlob || !sourceFile) return;
  const filled = fillSelect && fillSelect.value !== "none";
  const url = URL.createObjectURL(outputBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sourceFile.name.replace(/\.[^.]+$/, "")}${filled ? "-background" : "-transparent"}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = `Downloaded ${formatBytes(outputBlob.size)} ${filled ? "PNG with replaced background" : "transparent PNG"}.`;
});

fillSelect?.addEventListener("input", () => {
  const filled = fillSelect.value !== "none";
  if (fillColorInput) fillColorInput.disabled = fillSelect.value !== "custom";
  downloadButton.textContent = filled ? "Download PNG with new background" : "Download transparent PNG";
  if (originalData) void process();
});
fillColorInput?.addEventListener("input", () => { if (originalData) void process(); });

reset();
