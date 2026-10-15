const $ = (selector) => document.querySelector(selector);
const recordButton = $("#record-button");
const stopRecordingButton = $("#stop-recording-button");
const recordState = $("#record-state");
const recordError = $("#record-error");
const lookupStatus = $("#lookup-status");
const importStatus = $("#import-status");
const pgnFile = $("#pgn-file");

if (new URLSearchParams(location.search).get("fullPage") === "1") {
  document.documentElement.classList.add("full-page");
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isChessGamePage(url) {
  try {
    const parsed = new URL(url);
    return ["chess.com", "www.chess.com"].includes(parsed.hostname)
      && /^\/(game|live|play)(\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function loadState() {
  const state = await chrome.storage.local.get(["recording", "recordingTabId", "aiEnabled", "aiModel", "aiKey"]);
  const tab = await currentTab();
  const recordingHere = state.recording && tab?.id === state.recordingTabId;
  recordState.textContent = recordingHere ? "Recording silently. Reviews stay locked until the result." : state.recording ? "A game is being recorded in another tab." : "Ready when you are.";
  recordButton.textContent = recordingHere ? "Check for game end" : state.recording ? "Recording locked" : "Record this game";
  recordButton.classList.toggle("is-recording", Boolean(recordingHere));
  recordButton.disabled = Boolean(state.recording && !recordingHere);
  stopRecordingButton.hidden = !state.recording;
  stopRecordingButton.disabled = false;
  $("#lookup-form").querySelector("button").disabled = Boolean(state.recording);
  $("#pgn-button").disabled = Boolean(state.recording);
  pgnFile.disabled = false;
  if (state.recording) importStatus.textContent = "Finish the active recorded game before importing a PGN.";
  $("#ai-enabled").checked = Boolean(state.aiEnabled);
  $("#ai-model").value = state.aiModel || "gpt-4o-mini";
  $("#ai-key").value = state.aiKey || "";
}

recordButton.addEventListener("click", async () => {
  recordError.hidden = true;
  try {
    const tab = await currentTab();
    const state = await chrome.storage.local.get(["recording", "recordingTabId"]);
    if (state.recording && tab?.id === state.recordingTabId) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "CHECK_GAME_END" });
      if (!response?.ok) throw new Error(response?.error || "The game has not ended yet.");
      return;
    }
    if (state.recording) throw new Error("Another Chess.com game is being recorded. Finish it before starting a review.");
    if (!tab?.id || !isChessGamePage(tab.url)) {
      throw new Error("Open a Chess.com game page first, then start recording before or during the game.");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "START_RECORDING", tabId: tab.id });
    if (!response?.ok) throw new Error("The recorder could not start on this page. Reload Chess.com and try again.");
    await loadState();
  } catch (error) {
    recordError.textContent = error.message.includes("Receiving end")
      ? "The Chess.com observer is not ready. Reload the game tab and try again."
      : error.message;
    recordError.hidden = false;
  }
});

stopRecordingButton.addEventListener("click", async () => {
  const shouldStop = window.confirm("Stop this recording and discard its captured moves? This unlocks PGN review, so only continue if no live game is in progress.");
  if (!shouldStop) return;
  stopRecordingButton.disabled = true;
  $("#stop-recording-status").textContent = "Stopping the recording…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
    if (!result?.ok) throw new Error(result?.error || "Could not stop the recording.");
    $("#stop-recording-status").textContent = result.openedReview
      ? "Recording stopped. Opening the PGN you selected."
      : "Recording stopped; its incomplete capture was discarded.";
    await loadState();
  } catch (error) {
    $("#stop-recording-status").textContent = error.message;
    stopRecordingButton.disabled = false;
  }
});

async function openReview(pgn) {
  const result = await chrome.runtime.sendMessage({ type: "OPEN_REVIEW", pgn });
  if (!result?.ok) throw new Error(result?.error || "Could not open the review.");
}

async function latestPublicGame(username) {
  const user = encodeURIComponent(username.trim());
  if (!/^[a-zA-Z0-9_-]{2,25}$/.test(username.trim())) throw new Error("Enter a valid Chess.com username.");
  const archivesResponse = await fetch(`https://api.chess.com/pub/player/${user}/games/archives`);
  if (!archivesResponse.ok) throw new Error(archivesResponse.status === 404 ? "That Chess.com player was not found." : `Chess.com returned ${archivesResponse.status}.`);
  const { archives = [] } = await archivesResponse.json();
  for (const archive of [...archives].reverse()) {
    const response = await fetch(archive);
    if (!response.ok) throw new Error(`Chess.com archive could not be read (${response.status}).`);
    const { games = [] } = await response.json();
    const latest = games
      .filter((game) => typeof game.pgn === "string" && game.pgn.trim())
      .sort((a, b) => (b.end_time || 0) - (a.end_time || 0))[0];
    if (latest) return latest.pgn;
  }
  throw new Error("No public game with a PGN was found for that player.");
}

$("#lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button");
  lookupStatus.textContent = "Checking Chess.com archives…";
  submit.disabled = true;
  try {
    const pgn = await latestPublicGame($("#username").value);
    await openReview(pgn);
    lookupStatus.textContent = "Latest public game found. Opening its review.";
  } catch (error) {
    lookupStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

$("#pgn-button").addEventListener("click", async () => {
  const pgn = $("#pgn-input").value.trim();
  if (!pgn) {
    importStatus.textContent = "Paste a finished game's PGN first.";
    return;
  }
  try {
    await openReview(pgn);
    importStatus.textContent = "PGN ready. Opening its review.";
  } catch (error) {
    importStatus.textContent = error.message;
  }
});

pgnFile.addEventListener("change", async () => {
  const file = pgnFile.files?.[0];
  if (!file) return;
  importStatus.textContent = `Reading ${file.name}…`;
  try {
    const pgn = (await file.text()).trim();
    if (!pgn) throw new Error("That file is empty. Choose a PGN file with a completed game.");
    const state = await chrome.storage.local.get(["recording"]);
    if (state.recording) {
      $("#pgn-input").value = pgn;
      await chrome.storage.local.set({ pendingReviewPgn: pgn, pendingReviewFileName: file.name });
      importStatus.textContent = `${file.name} is queued. Stop the stale recording above to open it.`;
      return;
    }
    await openReview(pgn);
    importStatus.textContent = `${file.name} loaded. Opening its review.`;
  } catch (error) {
    importStatus.textContent = error.message;
  } finally {
    pgnFile.value = "";
  }
});

$("#save-settings").addEventListener("click", async () => {
  const key = $("#ai-key").value.trim();
  await chrome.storage.local.set({
    aiEnabled: $("#ai-enabled").checked && Boolean(key),
    aiModel: $("#ai-model").value.trim() || "gpt-4o-mini",
    aiKey: key
  });
  $("#settings-status").textContent = key && $("#ai-enabled").checked
    ? "AI coach is enabled for completed-game questions."
    : "Settings saved. Tick Enable OpenAI coaching and add an API key to use the AI coach.";
});

$("#ai-key").addEventListener("input", (event) => {
  if (event.currentTarget.value.trim()) $("#ai-enabled").checked = true;
});

loadState().catch((error) => {
  recordError.textContent = `Could not load extension settings: ${error.message}`;
  recordError.hidden = false;
});
