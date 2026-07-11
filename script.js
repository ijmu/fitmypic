const fileInput = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const widthInput = document.querySelector("#widthInput");
const heightInput = document.querySelector("#heightInput");
const lockRatioInput = document.querySelector("#lockRatioInput");
const formatSelect = document.querySelector("#formatSelect");
const qualityInput = document.querySelector("#qualityInput");
const qualityOutput = document.querySelector("#qualityOutput");
const targetSizeInput = document.querySelector("#targetSizeInput");
const downloadBtn = document.querySelector("#downloadBtn");
const targetDownloadBtn = document.querySelector("#targetDownloadBtn");
const resetBtn = document.querySelector("#resetBtn");
const statusBox = document.querySelector("#status");
const previewCanvas = document.querySelector("#previewCanvas");
const originalMeta = document.querySelector("#originalMeta");
const outputMeta = document.querySelector("#outputMeta");
const presetButtons = document.querySelectorAll(".preset");

const ctx = previewCanvas.getContext("2d");

let sourceImage = null;
let sourceFile = null;
let sourceRatio = 1;
let activeDimension = null;

function formatBytes(bytes) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setStatus(message) {
  statusBox.textContent = message;
}

function baseName(filename) {
  return filename.replace(/\.[^.]+$/, "") || "image";
}

function extensionFor(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function enableControls(enabled) {
  [widthInput, heightInput, lockRatioInput, formatSelect, qualityInput, targetSizeInput, downloadBtn, targetDownloadBtn, resetBtn].forEach((control) => {
    control.disabled = !enabled;
  });

  presetButtons.forEach((button) => {
    button.disabled = !enabled;
  });
}

function syncTargetControls() {
  const targetAvailable = sourceImage && formatSelect.value !== "image/png";
  targetSizeInput.disabled = !targetAvailable;
  targetDownloadBtn.disabled = !targetAvailable;
}

function fileToImage(file) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The browser could not load this image."));
    };
    image.src = objectUrl;
  });
}

function drawPreview() {
  if (!sourceImage) return;

  const width = Math.max(1, Number(widthInput.value) || sourceImage.naturalWidth);
  const height = Math.max(1, Number(heightInput.value) || sourceImage.naturalHeight);

  previewCanvas.width = width;
  previewCanvas.height = height;

  if (formatSelect.value === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  ctx.drawImage(sourceImage, 0, 0, width, height);
  outputMeta.textContent = `${width} x ${height}, ${formatSelect.options[formatSelect.selectedIndex].text}, quality ${Math.round(Number(qualityInput.value) * 100)}%`;
}

async function updatePreview() {
  drawPreview();
}

function exportCanvas(mimeType, quality) {
  return new Promise((resolve, reject) => {
    previewCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("The browser could not export this image."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function downloadBlob(blob, mimeType, label = "") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const width = previewCanvas.width;
  const height = previewCanvas.height;
  const suffix = label ? `-${label}` : "";

  link.href = url;
  link.download = `${baseName(sourceFile.name)}-${width}x${height}${suffix}.${extensionFor(mimeType)}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportNearTarget(mimeType, targetBytes) {
  if (mimeType === "image/png") {
    throw new Error("Target size is available for JPG and WebP. PNG export is usually lossless in the browser.");
  }

  let low = 0.35;
  let high = 1;
  let bestBlob = null;
  let bestQuality = Number(qualityInput.value);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let step = 0; step < 8; step += 1) {
    const quality = (low + high) / 2;
    const blob = await exportCanvas(mimeType, quality);
    const distance = Math.abs(blob.size - targetBytes);

    if (distance < bestDistance) {
      bestBlob = blob;
      bestQuality = quality;
      bestDistance = distance;
    }

    if (blob.size > targetBytes) {
      high = quality;
    } else {
      low = quality;
    }
  }

  return { blob: bestBlob, quality: bestQuality };
}

async function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Please choose a JPG, PNG, or WebP image.");
    return;
  }

  sourceFile = file;
  sourceImage = await fileToImage(file);
  sourceRatio = sourceImage.naturalWidth / sourceImage.naturalHeight;

  widthInput.value = sourceImage.naturalWidth;
  heightInput.value = sourceImage.naturalHeight;
  originalMeta.textContent = `${sourceImage.naturalWidth} x ${sourceImage.naturalHeight}, ${formatBytes(file.size)}`;

  const preferredFormat = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  formatSelect.value = preferredFormat;
  enableControls(true);
  syncTargetControls();
  setStatus(`Loaded ${file.name}. Adjust the size or choose a preset.`);
  await updatePreview();
}

function bindDropzone() {
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    const [file] = Array.from(event.dataTransfer.files);
    loadFile(file).catch((error) => setStatus(error.message));
  });
  fileInput.addEventListener("change", (event) => {
    const [file] = Array.from(event.target.files);
    loadFile(file).catch((error) => setStatus(error.message));
    fileInput.value = "";
  });
}

widthInput.addEventListener("input", () => {
  if (!sourceImage) return;

  if (lockRatioInput.checked && activeDimension !== "height") {
    activeDimension = "width";
    heightInput.value = Math.max(1, Math.round(Number(widthInput.value) / sourceRatio));
    activeDimension = null;
  }

  updatePreview();
});

heightInput.addEventListener("input", () => {
  if (!sourceImage) return;

  if (lockRatioInput.checked && activeDimension !== "width") {
    activeDimension = "height";
    widthInput.value = Math.max(1, Math.round(Number(heightInput.value) * sourceRatio));
    activeDimension = null;
  }

  updatePreview();
});

[formatSelect, qualityInput].forEach((control) => {
  control.addEventListener("input", () => {
    qualityOutput.textContent = `${Math.round(Number(qualityInput.value) * 100)}%`;
    syncTargetControls();
    updatePreview();
  });
});

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    widthInput.value = button.dataset.width;
    heightInput.value = button.dataset.height;
    updatePreview();
    setStatus(`Preset applied: ${button.textContent.trim()}.`);
  });
});

downloadBtn.addEventListener("click", () => {
  if (!sourceImage || !sourceFile) return;

  drawPreview();
  const mimeType = formatSelect.value;
  const quality = Number(qualityInput.value);

  exportCanvas(mimeType, quality)
    .then((blob) => {
      downloadBlob(blob, mimeType);
      setStatus(`Downloaded ${formatBytes(blob.size)} image.`);
    })
    .catch((error) => setStatus(error.message));
});

targetDownloadBtn.addEventListener("click", async () => {
  if (!sourceImage || !sourceFile) return;

  const targetKb = Number(targetSizeInput.value);
  if (!targetKb || targetKb < 10) {
    setStatus("Enter a target size of at least 10 KB.");
    return;
  }

  drawPreview();
  const mimeType = formatSelect.value;
  targetDownloadBtn.disabled = true;

  try {
    const { blob, quality } = await exportNearTarget(mimeType, targetKb * 1024);
    qualityInput.value = quality.toFixed(2);
    qualityOutput.textContent = `${Math.round(quality * 100)}%`;
    downloadBlob(blob, mimeType, `target-${targetKb}kb`);
    setStatus(`Downloaded a ${formatBytes(blob.size)} image, the closest available result to your ${targetKb} KB target.`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    syncTargetControls();
  }
});

resetBtn.addEventListener("click", () => {
  if (!sourceImage) return;

  widthInput.value = sourceImage.naturalWidth;
  heightInput.value = sourceImage.naturalHeight;
  lockRatioInput.checked = true;
  qualityInput.value = "0.82";
  targetSizeInput.value = "";
  qualityOutput.textContent = "82%";
  syncTargetControls();
  updatePreview();
  setStatus("Reset to original dimensions.");
});

bindDropzone();
enableControls(false);
