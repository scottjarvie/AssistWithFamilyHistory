"use strict";
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
const ICON_PATHS = {
    "16": "icons/icon16.svg",
    "32": "icons/icon32.svg",
    "48": "icons/icon48.svg",
    "128": "icons/icon128.svg",
};
let activeExtractionTabId;
let extractionState = {
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
        expandDelay: 1500, // 1.5 seconds between expansions
        actionDelay: 500, // 0.5 seconds between actions
        maxExpansions: 50, // Hard cap
    },
    admin: {
        expandDelay: 300, // 0.3 seconds between expansions
        actionDelay: 100, // 0.1 seconds between actions
        maxExpansions: 1000, // No practical limit
    },
};
// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "GET_STATE":
            sendResponse(extractionState);
            break;
        case "START_EXTRACTION":
            startExtensionExtraction(message.mode || "standard", message.tabId || sender.tab?.id);
            sendResponse({ success: true });
            break;
        case "CANCEL_EXTRACTION":
            cancelExtraction();
            sendResponse({ success: true });
            break;
        case "UPDATE_PROGRESS":
            updateExtractionProgress(message.data);
            break;
        case "EXTRACTION_COMPLETE":
            completeExtraction(message.data);
            break;
        case "EXTRACTION_ERROR":
            handleError(typeof message.error === "string" ? message.error : "Unknown extraction error");
            break;
        default:
            sendResponse({ error: "Unknown message type" });
    }
    return true; // Keep channel open for async responses
});
// Start extraction
async function startExtensionExtraction(mode, tabId) {
    if (!tabId) {
        console.error("No tab ID provided");
        return;
    }
    activeExtractionTabId = tabId;
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
            pacing: {
                ...PACING[mode],
                mode,
            },
        });
    }
    catch (error) {
        handleError(`Failed to start extraction: ${error}`);
    }
}
// Cancel extraction
function cancelExtraction() {
    extractionState.status = "cancelled";
    broadcastState();
    if (activeExtractionTabId) {
        chrome.tabs.sendMessage(activeExtractionTabId, { type: "CANCEL_EXTRACT" }).catch(() => {
            // The content script might already be gone.
        });
    }
}
// Update progress
function updateExtractionProgress(data) {
    extractionState = { ...extractionState, ...data };
    broadcastState();
}
// Complete extraction
function completeExtraction(capturePackage) {
    extractionState.status = "complete";
    activeExtractionTabId = undefined;
    broadcastState();
    // Store the latest capture package temporarily for download/copy actions.
    chrome.storage.local.set({
        lastCapturePackage: capturePackage,
        lastEvidencePack: capturePackage,
        lastExtractionTime: Date.now(),
    });
}
// Handle error
function handleError(error) {
    extractionState.status = "error";
    extractionState.errors.push(error);
    activeExtractionTabId = undefined;
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
        const isFamilySearchCapture = tab.url.includes("familysearch.org/tree/person") &&
            (tab.url.includes("sources") || tab.url.includes("memories"));
        const title = isFamilySearchCapture
            ? "Capture FamilySearch sources or memories"
            : "Open a FamilySearch person sources or memories page";
        // Keep icon assets aligned with manifest paths. Status differences are shown
        // through the action title until separate inactive icons exist.
        chrome.action.setIcon({
            tabId,
            path: ICON_PATHS,
        }).catch(() => {
            // Some browser versions are stricter about runtime icon formats.
        });
        chrome.action.setTitle({
            tabId,
            title,
        }).catch(() => {
            // Non-fatal browser API failure.
        });
    }
});
console.log("Discover Their Stories Service Worker initialized");
