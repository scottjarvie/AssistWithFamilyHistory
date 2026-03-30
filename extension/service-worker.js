/**
 * Service Worker - Orchestrator
 * Manages extraction workflow, pacing, and state
 */

// Pacing configurations
const PACING = {
  standard: {
    mode: "standard",
    expandDelay: 1000,    // 1 second between sources
    actionDelay: 500,     // 500ms after clicking
    maxExpansions: 50,    // Max sources to expand
  },
  admin: {
    mode: "admin",
    expandDelay: 200,     // Fast mode
    actionDelay: 100,
    maxExpansions: 999,   // No practical limit
  },
};

// Current state
let extractionState = {
  status: "idle",
  currentStep: 0,
  totalSteps: 0,
  currentSource: null,
  expandedCount: 0,
  errors: [],
  mode: "standard",
};

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "START_EXTRACTION":
      startExtraction(sender.tab?.id, message.mode || "standard");
      sendResponse({ success: true });
      break;

    case "CANCEL_EXTRACTION":
      cancelExtraction(sender.tab?.id);
      sendResponse({ success: true });
      break;

    case "GET_STATE":
      sendResponse(extractionState);
      break;

    case "UPDATE_PROGRESS":
      updateState(message.data);
      break;

    case "EXTRACTION_COMPLETE":
      handleComplete(message.data);
      break;

    case "EXTRACTION_ERROR":
      handleError(message.error);
      break;
  }

  return true;
});

/**
 * Start extraction on a tab
 */
async function startExtraction(tabId, mode) {
  if (!tabId) {
    console.error("No tab ID provided");
    return;
  }

  const pacing = PACING[mode] || PACING.standard;
  
  extractionState = {
    status: "extracting",
    currentStep: 0,
    totalSteps: 0,
    currentSource: null,
    expandedCount: 0,
    errors: [],
    mode,
  };

  broadcastState();

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "START_EXTRACT",
      pacing,
    });
  } catch (error) {
    console.error("Failed to start extraction:", error);
    handleError(error.message || "Failed to start extraction");
  }
}

/**
 * Cancel extraction
 */
async function cancelExtraction(tabId) {
  if (tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "CANCEL_EXTRACT" });
    } catch (e) {
      console.warn("Failed to send cancel message:", e);
    }
  }

  extractionState.status = "cancelled";
  broadcastState();
}

/**
 * Update state and broadcast
 */
function updateState(data) {
  extractionState = { ...extractionState, ...data };
  broadcastState();
}

/**
 * Handle extraction complete
 */
async function handleComplete(capturePackage) {
  extractionState.status = "complete";
  broadcastState();

  // Store the latest capture package for download/copy actions.
  await chrome.storage.local.set({
    lastCapturePackage: capturePackage,
    lastEvidencePack: capturePackage,
  });

  console.log("Extraction complete:", capturePackage);
}

/**
 * Handle error
 */
function handleError(errorMessage) {
  extractionState.status = "error";
  extractionState.errors.push(errorMessage);
  broadcastState();
}

/**
 * Broadcast state to popup
 */
function broadcastState() {
  chrome.runtime.sendMessage({
    type: "STATE_UPDATE",
    state: extractionState,
  }).catch(() => {
    // Popup might not be open, that's fine
  });
}

console.log("Discover Their Stories Service Worker loaded");
