/**
 * Service Worker - Extension Background Script
 * 
 * Purpose: Orchestrate extraction workflow, manage state, handle messaging
 * 
 * Key Elements:
 * - Extraction state management
 * - Message handling between popup and content script
 * - Pacing control (standard vs admin mode)
 * - Progress reporting
 * 
 * Dependencies:
 * - Chrome Extension APIs
 * 
 * Last Updated: Initial setup
 */

// Extraction state
interface ExtractionState {
  status: "idle" | "extracting" | "expanding" | "building" | "complete" | "error" | "cancelled";
  currentStep: number;
  totalSteps: number;
  currentSource?: string;
  expandedCount: number;
  errors: string[];
  startedAt: number;
  mode: "standard" | "admin";
}

let extractionState: ExtractionState = {
  status: "idle",
  currentStep: 0,
  totalSteps: 0,
  expandedCount: 0,
  errors: [],
  startedAt: 0,
  mode: "standard",
};

// Pacing configuration
const PACING = {
  standard: {
    expandDelay: 1500,     // 1.5 seconds between expansions
    actionDelay: 500,      // 0.5 seconds between actions
    maxExpansions: 50,     // Hard cap
  },
  admin: {
    expandDelay: 300,      // 0.3 seconds between expansions
    actionDelay: 100,      // 0.1 seconds between actions
    maxExpansions: 1000,   // No practical limit
  },
};

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_STATE":
      sendResponse(extractionState);
      break;

    case "START_EXTRACTION":
      startExtraction(message.mode || "standard", sender.tab?.id);
      sendResponse({ success: true });
      break;

    case "CANCEL_EXTRACTION":
      cancelExtraction();
      sendResponse({ success: true });
      break;

    case "UPDATE_PROGRESS":
      updateProgress(message.data);
      break;

    case "EXTRACTION_COMPLETE":
      completeExtraction(message.data);
      break;

    case "EXTRACTION_ERROR":
      handleError(message.error);
      break;

    default:
      sendResponse({ error: "Unknown message type" });
  }

  return true; // Keep channel open for async responses
});

// Start extraction
async function startExtraction(mode: "standard" | "admin", tabId?: number) {
  if (!tabId) {
    console.error("No tab ID provided");
    return;
  }

  extractionState = {
    status: "extracting",
    currentStep: 0,
    totalSteps: 0,
    expandedCount: 0,
    errors: [],
    startedAt: Date.now(),
    mode,
  };

  // Notify popup of state change
  broadcastState();

  // Send message to content script to start
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "START_EXTRACT",
      pacing: PACING[mode],
    });
  } catch (error) {
    handleError(`Failed to start extraction: ${error}`);
  }
}

// Cancel extraction
function cancelExtraction() {
  extractionState.status = "cancelled";
  broadcastState();
}

// Update progress
function updateProgress(data: Partial<ExtractionState>) {
  extractionState = { ...extractionState, ...data };
  broadcastState();
}

// Complete extraction
function completeExtraction(capturePackage: unknown) {
  extractionState.status = "complete";
  broadcastState();

  // Store the latest capture package temporarily for download/copy actions.
  chrome.storage.local.set({
    lastCapturePackage: capturePackage,
    lastEvidencePack: capturePackage,
    lastExtractionTime: Date.now(),
  });
}

// Handle error
function handleError(error: string) {
  extractionState.status = "error";
  extractionState.errors.push(error);
  broadcastState();
}

// Broadcast state to popup
function broadcastState() {
  chrome.runtime.sendMessage({
    type: "STATE_UPDATE",
    state: extractionState,
  }).catch(() => {
    // Popup might not be open, that's fine
  });
}

// Check if on supported FamilySearch person capture pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const isFamilySearchCapture = 
      tab.url.includes("familysearch.org/tree/person") && 
      (tab.url.includes("sources") || tab.url.includes("memories"));
    
    // Update extension icon based on page
    chrome.action.setIcon({
      tabId,
      path: isFamilySearchCapture ? {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png",
      } : {
        "16": "icons/icon16-inactive.png",
        "32": "icons/icon32-inactive.png",
        "48": "icons/icon48-inactive.png",
        "128": "icons/icon128-inactive.png",
      },
    }).catch(() => {
      // Icons might not exist yet
    });
  }
});

console.log("Discover Their Stories Service Worker initialized");
