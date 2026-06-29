(function () {
  const nav = document.querySelector("nav");
  if (!nav) return;

  const button = document.createElement("button");
  button.className = "language-button";
  button.type = "button";
  button.textContent = "中文";
  button.title = "Translate this page to Chinese";
  button.addEventListener("click", () => {
    const translateUrl = new URL("https://translate.google.com/translate");
    translateUrl.searchParams.set("sl", "en");
    translateUrl.searchParams.set("tl", "zh-CN");
    translateUrl.searchParams.set("u", window.location.href);
    window.location.href = translateUrl.toString();
  });

  nav.append(button);
})();
