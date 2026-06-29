(function () {
  const nav = document.querySelector("nav");
  if (!nav) return;

  const isChinesePage = window.location.pathname.startsWith("/zh/");
  const button = document.createElement("button");
  button.className = "language-button";
  button.type = "button";
  button.textContent = isChinesePage ? "English" : "中文";
  button.title = isChinesePage ? "Switch to English" : "切换到中文";

  button.addEventListener("click", () => {
    const currentPath = window.location.pathname;
    const targetPath = isChinesePage ? currentPath.replace(/^\/zh\//, "/") : `/zh${currentPath === "/" ? "/index.html" : currentPath}`;
    window.location.href = `${targetPath}${window.location.search}${window.location.hash}`;
  });

  nav.append(button);
})();
