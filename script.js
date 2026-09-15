const sourceText = document.querySelector("#source-text");
const characterCount = document.querySelector("#character-count");
const paraphraseButton = document.querySelector("#paraphrase-button");
const resultContent = document.querySelector("#result-content");
const readyBadge = document.querySelector("#ready-badge");
const copyButton = document.querySelector("#copy-button");
const readButton = document.querySelector("#read-button");
const themeToggle = document.querySelector("#theme-toggle");
const toneBar = document.querySelector(".tone-bar");
const toneButtons = [...document.querySelectorAll(".tone-button")];
const paraphraserTab = document.querySelector("#paraphraser-tab");
const grammarTab = document.querySelector("#grammar-tab");
const sourceLabel = document.querySelector("#source-label");
const resultLabel = document.querySelector("#result-label");

let selectedTone = "Standard";
let activeMode = "paraphraser";
let result = "";

// Proxy backend endpoint (API key is safely kept in server.js/.env)
const API_URL = "http://127.0.0.1:3000/api/process-text";

function updateEditorState() {
  const length = sourceText.value.length;
  characterCount.textContent = `${length.toLocaleString()} / 5,000`;
  paraphraseButton.disabled = !sourceText.value.trim();
}

// Helper function to delay execution between retries
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Main execution handler
async function processText() {
  const text = sourceText.value.trim();
  if (!text) return;

  // Show loading state based on active mode
  paraphraseButton.disabled = true;
  paraphraseButton.textContent =
    activeMode === "grammar" ? "Checking..." : "Paraphrasing...";
  resultContent.textContent = "Thinking...";
  readyBadge.hidden = true;

  // Build prompt dynamically based on mode
  let prompt = "";

  if (activeMode === "grammar") {
    prompt = `Correct all spelling, grammar, and punctuation errors in the following text. Preserve the original tone and structure as closely as possible. Return ONLY the corrected text without any introduction, quotes, explanations, or meta notes:\n\n${text}`;
  } else {
    prompt = `Rewrite the following text in a ${selectedTone} tone. Provide ONLY the rewritten text without any introductory phrases, quotes, or explanations:\n\n${text}`;
  }

  // API Fetch with retry logic
  const maxRetries = 3;
  let retryCount = 0;
  let success = false;

  while (retryCount <= maxRetries && !success) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      // Safely check content type before parsing JSON
      const contentType = response.headers.get("content-type");

      let data = {};

      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const textError = await response.text();

        throw new Error(
          `Server returned non-JSON response (${response.status}): ${textError.substring(
            0,
            100,
          )}`,
        );
      }

      // Handle Gemini quota/rate limit
      // Do NOT automatically retry because quota errors may require
      // waiting for the quota window to reset.
      if (response.status === 429) {
        const retryAfter = Number(data.retryAfter) || 60;

        resultContent.textContent = `AI usage limit reached. Please try again in about ${retryAfter} seconds.`;

        console.warn("Gemini quota/rate limit reached:", data);

        return;
      }

      // Handle temporary server/Gemini errors
      if (
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503
      ) {
        retryCount++;

        if (retryCount <= maxRetries) {
          resultContent.textContent = `Temporary server issue. Retrying (${retryCount}/${maxRetries})...`;

          await wait(1500 * retryCount);
          continue;
        }

        resultContent.textContent =
          "The AI service is temporarily unavailable. Please try again later.";

        return;
      }

      // Handle other HTTP errors
      if (!response.ok) {
        console.error("API Error:", data);

        const apiErrorMessage =
          typeof data.error === "string"
            ? data.error
            : "The request could not be completed.";

        resultContent.textContent = `Error: ${apiErrorMessage}`;

        return;
      }

      // Extract text response safely
      const candidate = data.candidates?.[0];

      if (candidate && candidate.content?.parts?.[0]?.text) {
        result = candidate.content.parts[0].text.trim();

        resultContent.textContent = result;
        readyBadge.hidden = false;
        copyButton.disabled = false;
        readButton.disabled = false;

        success = true;
      } else {
        resultContent.textContent =
          "No result generated. The text may have triggered safety filters.";

        success = true;
      }
    } catch (error) {
      console.error("Network or Script Error:", error);

      retryCount++;

      if (retryCount <= maxRetries) {
        resultContent.textContent = `Connection problem. Retrying (${retryCount}/${maxRetries})...`;

        await wait(1500 * retryCount);
      } else {
        resultContent.textContent =
          "Unable to connect to the server. Make sure node server.js is running and try again.";
      }
    }
  }

  // Reset button state
  paraphraseButton.disabled = false;
  paraphraseButton.textContent =
    activeMode === "grammar" ? "Fix Grammar" : "Paraphrase";
}

function setMode(mode) {
  activeMode = mode;
  const isGrammar = mode === "grammar";

  toneBar.hidden = isGrammar;
  toneBar.classList.toggle("is-hidden", isGrammar);

  paraphraserTab.classList.toggle("active", !isGrammar);
  grammarTab.classList.toggle("active", isGrammar);

  paraphraserTab.setAttribute("aria-current", isGrammar ? "false" : "page");

  grammarTab.setAttribute("aria-current", isGrammar ? "page" : "false");

  sourceLabel.textContent = isGrammar ? "Text to check" : "Original text";

  resultLabel.textContent = isGrammar
    ? "Grammar suggestions"
    : "TextCraft result";

  paraphraseButton.textContent = isGrammar ? "Fix Grammar" : "Paraphrase";

  // Clear placeholder & state on tab switch
  resultContent.innerHTML =
    '<span class="placeholder">Your result will appear here...</span>';

  readyBadge.hidden = true;
  copyButton.disabled = true;
  readButton.disabled = true;
  result = "";
}

// Event Listeners
paraphraserTab.addEventListener("click", (event) => {
  event.preventDefault();
  setMode("paraphraser");
});

grammarTab.addEventListener("click", (event) => {
  event.preventDefault();
  setMode("grammar");
});

sourceText.addEventListener("input", updateEditorState);

paraphraseButton.addEventListener("click", processText);

toneButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedTone = button.textContent.trim();

    toneButtons.forEach((toneButton) => {
      const isActive = toneButton === button;

      toneButton.classList.toggle("active", isActive);
      toneButton.setAttribute("aria-pressed", String(isActive));
    });
  });
});

copyButton.addEventListener("click", async () => {
  if (!result) return;

  try {
    await navigator.clipboard.writeText(result);

    copyButton.textContent = "Copied";

    window.setTimeout(() => {
      copyButton.textContent = "Copy Text";
    }, 1600);
  } catch {
    const fallback = document.createElement("textarea");

    fallback.value = result;

    document.body.appendChild(fallback);

    fallback.select();

    document.execCommand("copy");

    fallback.remove();

    copyButton.textContent = "Copied";

    window.setTimeout(() => {
      copyButton.textContent = "Copy Text";
    }, 1600);
  }
});

readButton.addEventListener("click", () => {
  if (!result || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  window.speechSynthesis.speak(new SpeechSynthesisUtterance(result));
});

themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");

  themeToggle.setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode",
  );

  themeToggle.querySelector("span").textContent = isDark ? "☼" : "◐";

  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", isDark ? "#111827" : "#f6f8fb");
});

updateEditorState();
