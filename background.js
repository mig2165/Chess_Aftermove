chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "STOP_RECORDING") {
    chrome.storage.local.get(["recording", "recordingTabId", "pendingReviewPgn"]).then(async (state) => {
      if (!state.recording) {
        sendResponse({ ok: false, error: "There is no recording to stop." });
        return;
      }
      if (state.recordingTabId != null) {
        try {
          await chrome.tabs.sendMessage(state.recordingTabId, { type: "STOP_RECORDING" });
        } catch (error) {
          if (!/Receiving end|No tab with id/i.test(error.message)) throw error;
        }
      }
      await chrome.storage.local.set({
        recording: false,
        recordingTabId: null,
        lastRecordingStoppedAt: Date.now(),
        ...(state.pendingReviewPgn ? { reviewPgn: state.pendingReviewPgn } : {})
      });
      if (state.pendingReviewPgn) {
        await chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
        await chrome.storage.local.remove(["pendingReviewPgn", "pendingReviewFileName"]);
        sendResponse({ ok: true, openedReview: true });
        return;
      }
      await chrome.storage.local.remove(["pendingReviewFileName"]);
      sendResponse({ ok: true, openedReview: false });
    }).catch((error) => {
      console.error("Could not stop the recording.", error);
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === "OPEN_REVIEW" && typeof message.pgn === "string") {
    chrome.storage.local.set({
      reviewPgn: message.pgn,
      recording: false,
      recordingTabId: null,
      lastRecordedAt: Date.now()
    })
      .then(() => chrome.tabs.create({ url: chrome.runtime.getURL("review.html") }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "COMPLETE_RECORDING") {
    chrome.storage.local.get(["recording", "recordingTabId"]).then(async (state) => {
      if (!state.recording || state.recordingTabId == null) throw new Error("There is no active recording to finish.");
      const captured = await chrome.tabs.sendMessage(state.recordingTabId, { type: "EXPORT_CAPTURED_PGN" });
      if (!captured?.ok) throw new Error(captured?.error || "Could not read the captured moves.");
      await chrome.storage.local.set({ reviewPgn: captured.pgn, recording: false, recordingTabId: null, lastRecordedAt: Date.now() });
      await chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
      sendResponse({ ok: true });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GAME_CAPTURED" && typeof message.pgn === "string") {
    chrome.storage.local.get(["recording", "recordingTabId"]).then((state) => {
      if (!state.recording || (state.recordingTabId != null && sender.tab?.id != null && state.recordingTabId !== sender.tab?.id)) {
        sendResponse({ ok: false, error: "No matching recorded game is active." });
        return;
      }
      return chrome.storage.local.set({
        reviewPgn: message.pgn,
        recording: false,
        recordingTabId: null,
        lastRecordedAt: Date.now()
      }).then(() => {
        if (message.autoOpen) {
          return chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
        }
      }).then(() => sendResponse({ ok: true }));
    }).catch((error) => {
      console.error("Could not process the captured game.", error);
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === "CHECK_RECORDING") {
    chrome.storage.local.get(["recording", "recordingTabId"]).then((state) => {
      sendResponse({
        recording: Boolean(state.recording),
        sameTab: Boolean(state.recording && state.recordingTabId === sender.tab?.id),
        tabId: sender.tab?.id
      });
    }).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});
