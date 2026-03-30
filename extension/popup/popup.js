/**
 * Popup Script
 * Handle popup UI interactions and state display
 */

// DOM Elements
const states = {
  notOnPage: document.getElementById("notOnPage"),
  ready: document.getElementById("ready"),
  extracting: document.getElementById("extracting"),
  complete: document.getElementById("complete"),
  error: document.getElementById("error"),
};

const elements = {
  adminBadge: document.getElementById("adminBadge"),
  personName: document.getElementById("personName"),
  personDates: document.getElementById("personDates"),
  sourceCount: document.getElementById("sourceCount"),
  consentCheck: document.getElementById("consentCheck"),
  extractBtn: document.getElementById("extractBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  progressStatus: document.getElementById("progressStatus"),
  progressFill: document.getElementById("progressFill"),
  progressText: document.getElementById("progressText"),
  completeStats: document.getElementById("completeStats"),
  downloadBtn: document.getElementById("downloadBtn"),
  copyBtn: document.getElementById("copyBtn"),
  newExtractBtn: document.getElementById("newExtractBtn"),
  errorMessage: document.getElementById("errorMessage"),
  retryBtn: document.getElementById("retryBtn"),
};

let currentState = "notOnPage";
let isAdminMode = false;
let lastCapturePackage = null;

// Show a specific state
function showState(state) {
  currentState = state;
  Object.entries(states).forEach(([key, el]) => {
    if (el) {
      el.classList.toggle("active", key === state);
    }
  });
}

// Initialize popup
async function init() {
  // Check for admin mode
  const settings = await chrome.storage.local.get("adminMode");
  isAdminMode = settings.adminMode || false;
  if (elements.adminBadge) {
    elements.adminBadge.style.display = isAdminMode ? "block" : "none";
  }

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.url?.includes("familysearch.org") || !tab.url.includes("/tree/person")) {
    showState("notOnPage");
    return;
  }

  // Get page info from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" });
    if (response?.onCapturePage) {
      displayPageInfo(response);
      
      // Check extraction state
      const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      if (state?.status === "extracting" || state?.status === "expanding") {
        showState("extracting");
        updateProgress(state);
      } else if (state?.status === "complete") {
        const stored = await chrome.storage.local.get(["lastCapturePackage", "lastEvidencePack"]);
        const latestCapture = stored.lastCapturePackage || stored.lastEvidencePack;
        if (latestCapture) {
          lastCapturePackage = latestCapture;
          showComplete(latestCapture);
        } else {
          showState("ready");
        }
      } else {
        showState("ready");
      }
    } else {
      showState("notOnPage");
    }
  } catch (e) {
    console.log("Could not contact content script:", e);
    showState("notOnPage");
  }
}

// Display page info
function displayPageInfo(info) {
  if (elements.personName) {
    elements.personName.textContent = info.personName || "Unknown Person";
  }
  
  const dates = [];
  if (info.birthDate) dates.push(`b. ${info.birthDate}`);
  if (info.deathDate) dates.push(`d. ${info.deathDate}`);
  if (elements.personDates) {
    elements.personDates.textContent = dates.join(" – ");
  }
  
  if (elements.sourceCount) {
    const label = info.pageType === "memories" ? "memories" : "sources";
    elements.sourceCount.textContent = `${info.itemCount} ${label} available`;
  }
}

// Update progress
function updateProgress(state) {
  const progress = state.totalSteps > 0 
    ? Math.round((state.currentStep / state.totalSteps) * 100) 
    : 0;
  
  if (elements.progressFill) {
    elements.progressFill.style.width = `${progress}%`;
  }
  if (elements.progressText) {
    elements.progressText.textContent = `${state.currentStep} / ${state.totalSteps} items`;
  }
  
  let status = "Processing...";
  if (state.status === "extracting") status = "Capturing page data...";
  if (state.status === "expanding") status = `Expanding: ${state.currentSource || "..."}`;
  if (state.status === "building") status = "Building capture package...";
  
  if (elements.progressStatus) {
    elements.progressStatus.textContent = status;
  }
}

// Show complete state
function showComplete(capturePackage) {
  showState("complete");
  const sourceCount = capturePackage?.sources?.length || 0;
  const memoryCount = capturePackage?.memories?.length || 0;
  if (elements.completeStats) {
    elements.completeStats.textContent = `${sourceCount} sources and ${memoryCount} memories captured`;
  }
  lastCapturePackage = capturePackage;
}

// Event listeners
if (elements.consentCheck) {
  elements.consentCheck.addEventListener("change", () => {
    if (elements.extractBtn) {
      elements.extractBtn.disabled = !elements.consentCheck.checked;
    }
  });
}

if (elements.extractBtn) {
  elements.extractBtn.addEventListener("click", async () => {
    showState("extracting");
    if (elements.progressFill) elements.progressFill.style.width = "0%";
    if (elements.progressStatus) elements.progressStatus.textContent = "Starting extraction...";
    
    chrome.runtime.sendMessage({ 
      type: "START_EXTRACTION",
      mode: isAdminMode ? "admin" : "standard",
    });
  });
}

if (elements.cancelBtn) {
  elements.cancelBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CANCEL_EXTRACTION" });
    showState("ready");
  });
}

if (elements.downloadBtn) {
  elements.downloadBtn.addEventListener("click", () => {
    if (!lastCapturePackage) return;
    
    const blob = new Blob([JSON.stringify(lastCapturePackage, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capture-package-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

if (elements.copyBtn) {
  elements.copyBtn.addEventListener("click", async () => {
    if (!lastCapturePackage) return;
    
    await navigator.clipboard.writeText(JSON.stringify(lastCapturePackage, null, 2));
    elements.copyBtn.textContent = "Copied!";
    setTimeout(() => {
      elements.copyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy to Clipboard
      `;
    }, 2000);
  });
}

if (elements.newExtractBtn) {
  elements.newExtractBtn.addEventListener("click", () => {
    lastCapturePackage = null;
    if (elements.consentCheck) elements.consentCheck.checked = false;
    if (elements.extractBtn) elements.extractBtn.disabled = true;
    showState("ready");
  });
}

if (elements.retryBtn) {
  elements.retryBtn.addEventListener("click", () => {
    if (elements.consentCheck) elements.consentCheck.checked = false;
    if (elements.extractBtn) elements.extractBtn.disabled = true;
    showState("ready");
  });
}

// Listen for state updates from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE_UPDATE") {
    const state = message.state;
    
    if (state.status === "extracting" || state.status === "expanding" || state.status === "building") {
      if (currentState !== "extracting") {
        showState("extracting");
      }
      updateProgress(state);
    } else if (state.status === "complete") {
      chrome.storage.local.get(["lastCapturePackage", "lastEvidencePack"]).then((stored) => {
        const latestCapture = stored.lastCapturePackage || stored.lastEvidencePack;
        if (latestCapture) {
          showComplete(latestCapture);
        }
      });
    } else if (state.status === "error") {
      showState("error");
      if (elements.errorMessage) {
        elements.errorMessage.textContent = state.errors[state.errors.length - 1] || "An error occurred";
      }
    } else if (state.status === "cancelled") {
      showState("ready");
    }
  }
});

// Initialize
init();
