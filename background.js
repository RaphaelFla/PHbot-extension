// PHbot Pro - background.js (O Cérebro)
'use strict';
let botState = {};

function initializeStateAndAlarms() {
    chrome.storage.local.get("botState", (result) => {
        if (result.botState && Object.keys(result.botState).length > 0) {
            botState = result.botState;
        } else {
            botState = { isPaused: true };
            chrome.storage.local.set({ botState });
        }
        console.log('PHbot Pro Brain Initialized. State:', botState);
        chrome.alarms.clear('mainLogicLoop');
        if (!botState.isPaused) {
            chrome.alarms.create('mainLogicLoop', { periodInMinutes: 1 / 60 });
        }
    });
}
chrome.runtime.onInstalled.addListener(() => { initializeStateAndAlarms(); });
chrome.runtime.onStartup.addListener(() => { initializeStateAndAlarms(); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateState") {
        botState = message.state;
        chrome.storage.local.set({ botState });
        if (!botState.isPaused) {
            chrome.alarms.create('mainLogicLoop', { periodInMinutes: 1 / 60 });
        } else {
            chrome.alarms.clear('mainLogicLoop');
        }
    }
    return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'mainLogicLoop') {
        chrome.tabs.query({ url: "https://bestiaryarena.com/*" }, function(tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "runCycle" }).catch(error => {});
            }
        });
    }
});