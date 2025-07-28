// PHbot Pro - content_script.js (Olhos e Mãos da Extensão)
'use strict';

// ===================================================================
// COMUNICAÇÃO COM O CÉREBRO (background.js)
// ===================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "runCycle") {
        runSingleCycle();
    }
    return true;
});

async function runSingleCycle() {
    if (settings.isPaused) return;
    updateStatsDisplay();
    await checkAndUseStaminaIfNeeded();
    await handleItemActions();
    await handleStartHunting();
}

// ===================================================================
// ESTADO E CONFIGURAÇÕES
// ===================================================================
const botVersion = "3.2.2";
let settings = {};
const defaultSettings = {
    isPaused: true,
    isSellEnabled: false, sellRarityThreshold: 79,
    isSqueezeEnabled: false, squeezeRarityMin: 80, squeezeRarityMax: 95,
    isStaminaEnabled: true, staminaThreshold: 15,
    isAutoDaycareEnabled: false, isAutoRewardEnabled: false,
    isMinimized: false, theme: 'theme-fenix', logVisible: false,
    webhookUrl: '', activeTab: 'geral'
};
let logMessages = []; const MAX_LOG_MESSAGES = 50;
let stats = { sold: 0, squeezed: 0, potions: 0, hunts: 0, activeTime: 0, lastTick: null };

function loadSettings() {
    chrome.storage.local.get("botState", (result) => {
        if (result.botState && Object.keys(result.botState).length > 0) {
            settings = { ...defaultSettings, ...result.botState };
        } else {
            settings = defaultSettings;
        }
        createHUD();
        setupFocusObserver();
    });
}

function saveSettings() {
    const hud = document.getElementById('phbot-hud');
    if (hud) {
        settings.theme = hud.className.match(/theme-\w+/)?.[0] || 'theme-classic';
        settings.isMinimized = hud.classList.contains('minimized');
        settings.activeTab = document.querySelector('.phbot-tab.active')?.dataset.tab || 'geral';
    }
    const logPanel = document.getElementById('phbot-log-panel');
    if (logPanel) {
        settings.logVisible = !logPanel.classList.contains('hidden');
    }
    chrome.runtime.sendMessage({ action: "updateState", state: settings });
}

// ===================================================================
// LÓGICA DE AÇÃO DO BOT
// ===================================================================
async function handleAutoConfig() {
    addToLog(" Procurando botão 'Autoconfigurar'...");
    const configBtn = findButtonByPartialText("Autoconfigurar");
    if (configBtn) { addToLog("✅ Botão 'Autoconfigurar' encontrado! Clicando..."); await clickAndSleep(configBtn, 1000); } 
    else { addToLog("❌ Botão 'Autoconfigurar' não encontrado na tela."); }
}

async function handleItemActions() {
    const monsterPopup = Array.from(document.querySelectorAll('div[role="dialog"][data-state="open"]')).find(d => findRaritySpan(d));
    if (!monsterPopup) return false;
    const raritySpan = findRaritySpan(monsterPopup); if (!raritySpan) return false;
    let rarity = -1; const text = raritySpan.textContent.trim().replace("%", ""); const parsed = parseInt(text, 10); if (!isNaN(parsed)) rarity = parsed; if (rarity === -1) return false;
    let actionTaken = false;
    if (settings.isSqueezeEnabled && rarity >= settings.squeezeRarityMin && rarity <= settings.squeezeRarityMax) {
        let pressBtn = findButtonByPartialText("Espremer", monsterPopup);
        if (pressBtn) { addToLog(`✨ Espremendo item: ${rarity}%`); await clickAndSleep(pressBtn, 1500); stats.squeezed++; actionTaken = true; }
    }
    if (!actionTaken && settings.isSellEnabled && rarity <= settings.sellRarityThreshold) {
        let sellBtn = findButtonByPartialText("Vender", monsterPopup);
        if (sellBtn) { addToLog(`💰 Vendendo item: ${rarity}%`); await clickAndSleep(sellBtn, 1500); stats.sold++; actionTaken = true; }
    }
    if (!actionTaken) {
        let closeBtn = findButtonByText("Fechar", monsterPopup);
        if (closeBtn) { await clickAndSleep(closeBtn, 1500); actionTaken = true; }
    }
    if (actionTaken) { updateStatsDisplay(); }
    return actionTaken;
}

function getCurrentStamina() { const staminaContainer = document.querySelector('div[title="Stamina"]'); if (!staminaContainer) return -1; const currentStaminaEl = staminaContainer.querySelector("span > span:first-child"); if (!currentStaminaEl) return -1; return parseInt(currentStaminaEl.textContent, 10); }
async function checkAndUseStaminaIfNeeded() { if (!settings.isStaminaEnabled) return false; const currentStamina = getCurrentStamina(); if (currentStamina === -1 || currentStamina >= settings.staminaThreshold) return false; if (document.querySelector('div[role="dialog"][data-state="open"]')) return false; addToLog(`Stamina baixa (${currentStamina}). Usando poção...`); const staminaContainer = document.querySelector('div[title="Stamina"]'); if (staminaContainer) { await clickAndSleep(staminaContainer, 1200); const openDialogs = document.querySelectorAll('div[role="dialog"][data-state="open"]'); if (openDialogs.length === 0) { addToLog("❌ Janela de poção não abriu."); return false; } const potionPopup = openDialogs[openDialogs.length - 1]; let useOneBtn = findButtonByPartialText("Usar poção", potionPopup); if (useOneBtn) { addToLog("⚡️ Usando poção de stamina"); await clickAndSleep(useOneBtn, 1000); stats.potions++; updateStatsDisplay(); let closePotionBtn = findButtonByText("Fechar", potionPopup); if (closePotionBtn) await clickAndSleep(closePotionBtn, 1000); await sleep(500); pressEscape(); await sleep(500); pressEscape(); return true; } else { addToLog("❌ Nenhuma poção encontrada na janela."); let closeBtn = findButtonByText("Fechar", potionPopup); if (closeBtn) await clickAndSleep(closeBtn, 1000); } } return false; }
async function handleStartHunting() { if (document.querySelector('div[role="dialog"][data-state="open"]')) return; let startBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Iniciar" && b.getAttribute("data-full") === "false"); if (startBtn) { addToLog("⚔️ Iniciando nova caçada"); await clickAndSleep(startBtn, 1500); stats.hunts++; updateStatsDisplay(); } }

// ===================================================================
// FUNÇÕES UTILITÁRIAS
// ===================================================================
function forcefulClick(element) { const eventSequence = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']; for (const eventType of eventSequence) { element.dispatchEvent(new PointerEvent(eventType, { bubbles: true, cancelable: true, view: window })); } }
async function clickAndSleep(element, ms) { forcefulClick(element); await sleep(ms); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function findButtonByText(exactText, scope = document) { return Array.from(scope.querySelectorAll("button")).find(b => b.textContent.trim() === exactText); }
function findButtonByPartialText(partialText, scope = document) { return Array.from(scope.querySelectorAll("button")).find(b => b.textContent.trim().toLowerCase().includes(partialText.toLowerCase())); }
function findRaritySpan(scope = document) { const spans = scope.querySelectorAll('span'); for (const span of spans) { if (span.textContent.includes('%')) { const text = span.textContent.split('%')[0].trim(); if (!isNaN(parseInt(text, 10))) return span; } } return null; }
function formatTime(ms) { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600).toString().padStart(2, '0'); const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0'); const sec = (s % 60).toString().padStart(2, '0'); return `${h}:${m}:${sec}`; }
function updateStatsDisplay() { const now = Date.now(); if (!settings.isPaused) { stats.activeTime += now - (stats.lastTick || now); } stats.lastTick = now; if (document.getElementById('phbot-stat-sold')) { Object.entries({ sold: stats.sold, squeezed: stats.squeezed, potions: stats.potions, hunts: stats.hunts }).forEach(([key, value]) => { document.getElementById(`phbot-stat-${key}`).textContent = value; }); document.getElementById('phbot-stat-time').textContent = formatTime(stats.activeTime); } }
function addToLog(message) { const logPanel = document.getElementById('phbot-log-panel-content'); if (!logPanel) return; const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false }); const fullMessage = `[${timestamp}] ${message}`; logMessages.push(fullMessage); if (logMessages.length > MAX_LOG_MESSAGES) logMessages.shift(); const logEntry = newElement('p', { className: 'phbot-log-entry', textContent: fullMessage }); logPanel.prepend(logEntry); while (logPanel.children.length > MAX_LOG_MESSAGES) logPanel.removeChild(logPanel.lastChild); }
function newElement(tag, props = {}, children = []) { const { dataset, ...otherProps } = props; const el = Object.assign(document.createElement(tag), otherProps); if (dataset) { for (const key in dataset) { el.dataset[key] = dataset[key]; } } children.forEach(child => el.appendChild(child)); return el; }
function pressEscape() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, })); }
function makeDraggable(element, handleSelector) { const handles = element.querySelectorAll(handleSelector); if (handles.length === 0) return; let pos = {}; const dragMouseDown = (e) => { if (e.target.closest('button, input, .phbot-menu-item')) return; e.preventDefault(); pos = { x: e.clientX, y: e.clientY, left: element.offsetLeft, top: element.offsetTop }; document.addEventListener('mousemove', elementDrag); document.addEventListener('mouseup', closeDragElement); }; const elementDrag = (e) => { e.preventDefault(); element.style.left = (pos.left + e.clientX - pos.x) + "px"; element.style.top = (pos.top + e.clientY - pos.y) + "px"; }; const closeDragElement = () => { document.removeEventListener('mousemove', elementDrag); document.removeEventListener('mouseup', closeDragElement); }; handles.forEach(handle => handle.addEventListener('mousedown', dragMouseDown)); }
function resetStats() { stats.sold = 0; stats.squeezed = 0; stats.potions = 0; stats.hunts = 0; stats.activeTime = 0; stats.lastTick = Date.now(); updateStatsDisplay(); addToLog("📊 Estatísticas da sessão resetadas."); }
function setupFocusObserver() {
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
                const targetElement = mutation.target;
                if (targetElement.getAttribute('aria-hidden') === 'true') {
                    if (document.activeElement && targetElement.contains(document.activeElement)) {
                        addToLog("🛡️ Guardião de Foco: Erro do jogo detectado e prevenido!");
                        document.activeElement.blur();
                    }
                }
            }
        }
    });
    observer.observe(document.body, { attributes: true, subtree: true });
    console.log("PHbot: Guardião de Foco (MutationObserver) ativado.");
}

// ===================================================================
// CONSTRUÇÃO DA INTERFACE
// ===================================================================
function createHUD() {
    if (document.getElementById('phbot-hud')) return;

    const allCSS = `
        :root { 
            --theme-fenix-accent: #FE5F2F; --theme-fenix-shadow: rgba(254, 95, 47, 0.5);
            --theme-classic-accent: #00aaff; --theme-classic-shadow: rgba(0, 170, 255, 0.5);
            --theme-stealth-accent: #6c757d; --theme-stealth-shadow: rgba(108, 117, 125, 0.5);
            --theme-cyberpunk-accent: #ff00ff; --theme-cyberpunk-shadow: rgba(255, 0, 255, 0.5);
            --theme-hacker-accent: #00ff41; --theme-hacker-shadow: rgba(0, 255, 65, 0.5);
            --theme-ciano-accent: #00ffff; --theme-ciano-shadow: rgba(0, 255, 255, 0.5);
            --theme-ouro-accent: #FFD700; --theme-ouro-shadow: rgba(255, 215, 0, 0.5);
            --theme-vampiro-accent: #DC143C; --theme-vampiro-shadow: rgba(220, 20, 60, 0.5);
            --theme-toxico-accent: #7CFC00; --theme-toxico-shadow: rgba(124, 252, 0, 0.5);
            --theme-profundo-accent: #9370DB; --theme-profundo-shadow: rgba(147, 112, 219, 0.5);
        }
        #phbot-hud.theme-classic, #phbot-log-panel.theme-classic { --theme-accent: var(--theme-classic-accent); --theme-accent-shadow: var(--theme-classic-shadow); }
        #phbot-hud.theme-fenix, #phbot-log-panel.theme-fenix { --theme-accent: var(--theme-fenix-accent); --theme-accent-shadow: var(--theme-fenix-shadow); }
        #phbot-hud.theme-stealth, #phbot-log-panel.theme-stealth { --theme-accent: var(--theme-stealth-accent); --theme-accent-shadow: var(--theme-stealth-shadow); }
        #phbot-hud.theme-cyberpunk, #phbot-log-panel.theme-cyberpunk { --theme-accent: var(--theme-cyberpunk-accent); --theme-accent-shadow: var(--theme-cyberpunk-shadow); }
        #phbot-hud.theme-hacker, #phbot-log-panel.theme-hacker { --theme-accent: var(--theme-hacker-accent); --theme-accent-shadow: var(--theme-hacker-shadow); }
        #phbot-hud.theme-ciano, #phbot-log-panel.theme-ciano { --theme-accent: var(--theme-ciano-accent); --theme-accent-shadow: var(--theme-ciano-shadow); }
        #phbot-hud.theme-ouro, #phbot-log-panel.theme-ouro { --theme-accent: var(--theme-ouro-accent); --theme-accent-shadow: var(--theme-ouro-shadow); }
        #phbot-hud.theme-vampiro, #phbot-log-panel.theme-vampiro { --theme-accent: var(--theme-vampiro-accent); --theme-accent-shadow: var(--theme-vampiro-shadow); }
        #phbot-hud.theme-toxico, #phbot-log-panel.theme-toxico { --theme-accent: var(--theme-toxico-accent); --theme-accent-shadow: var(--theme-toxico-shadow); }
        #phbot-hud.theme-profundo, #phbot-log-panel.theme-profundo { --theme-accent: var(--theme-profundo-accent); --theme-accent-shadow: var(--theme-profundo-shadow); }
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap');
        #phbot-hud, #phbot-log-panel { position: fixed; background: rgba(20, 22, 28, 0.85); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; color: #e0e0e0; font-family: 'Montserrat', sans-serif; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); user-select: none; z-index: 2147483647; }
        #phbot-hud { top: 20px; left: 20px; display: flex; flex-direction: column; transition: height .3s ease-in-out, width .3s ease-in-out; width: 240px; }
        #phbot-log-panel { top: 20px; left: 290px; display: flex; flex-direction: column; width: 280px; height: 300px; transition: opacity .3s ease-in-out, visibility .3s ease-in-out; }
        #phbot-log-panel.hidden { opacity: 0; visibility: hidden; }
        #phbot-log-header { display:flex; justify-content:space-between; align-items:center; padding: 10px 5px 5px 15px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); flex-shrink: 0; cursor: move; }
        #phbot-log-title { font-weight: 600; }
        #phbot-log-panel-content { flex-grow: 1; display: flex; flex-direction: column-reverse; padding: 10px; overflow-y: auto; min-height: 0; }
        .phbot-log-entry { margin: 2px 0; font-size: 11px; color: #ccc; line-height: 1.4; animation: log-fade-in .3s ease; }
        .phbot-wrapper { padding: 0; display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
        #phbot-hud.minimized .phbot-wrapper, #phbot-hud.minimized .phbot-stats-panel, #phbot-hud.minimized .phbot-header { display: none; }
        .phbot-header, .phbot-minimized-bar { display: flex; justify-content: space-between; align-items: center; width: 100%; flex-shrink: 0; }
        .phbot-minimized-bar { padding: 0 10px 0 15px; height: 38px; cursor: move; }
        .phbot-header { padding: 15px; padding-bottom: 10px; cursor: move; }
        .phbot-minimized-bar { display: none; } #phbot-hud.minimized .phbot-minimized-bar { display: flex; }
        .phbot-title { font-size: 16px; font-weight: 700; color: #ffffff; }
        .phbot-min-status { font-size: 12px; color: #aaa; margin-left: 10px; font-weight: 600; } .phbot-min-status.active { color: #00dd88; }
        .phbot-window-controls { display: flex; align-items: center; gap: 4px; }
        .phbot-window-btn { background: none; border: none; color: #aaa; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; }
        .phbot-window-btn:hover { color: #fff; } .phbot-window-btn svg { width: 18px; height: 18px; fill: currentColor; }
        .phbot-control-group, .phbot-button, .phbot-toggle { width: 100%; }
        .phbot-control-group { display: flex; flex-direction: column; gap: 8px; }
        .phbot-button, .phbot-toggle { display: flex; align-items: center; gap: 10px; background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #e0e0e0; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s ease; text-align: left; }
        .phbot-button:hover, .phbot-toggle:hover { background-color: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2); }
        .phbot-button.active, .phbot-toggle.active { background-color: var(--theme-accent); border-color: var(--theme-accent); color: #ffffff; box-shadow: 0 0 10px var(--theme-accent-shadow); }
        .phbot-button.disabled { background-color: rgba(100, 100, 100, 0.2); color: #888; cursor: not-allowed; } .phbot-button.disabled:hover { background-color: rgba(100, 100, 100, 0.2); border-color: rgba(255, 255, 255, 0.1); }
        .phbot-button svg, .phbot-toggle svg { width: 16px; height: 16px; fill: currentColor; }
        .phbot-label { font-size: 12px; font-weight: 600; color: #aaa; margin-bottom: -4px; }
        .phbot-input { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #fff; padding: 8px; font-family: 'Montserrat', sans-serif; font-size: 13px; box-sizing: border-box; }
        .phbot-input-group { display: flex; gap: 4px; align-items: center; } .phbot-input-group .phbot-input { width: 50%; }
        .phbot-toggle .toggle-icon { margin-left: auto; width: 38px; height: 22px; background-color: rgba(255, 255, 255, 0.05); border-radius: 11px; position: relative; transition: background-color .2s ease; }
        .phbot-toggle .toggle-icon::before { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; background-color: #fff; border-radius: 50%; transition: transform .2s ease; }
        .phbot-toggle.active .toggle-icon { background-color: var(--theme-accent); }
        .phbot-toggle.active .toggle-icon::before { transform: translateX(16px); }
        .phbot-divider { width: 100%; height: 1px; background-color: rgba(255, 255, 255, 0.1); margin: 4px 0; }
        .phbot-stats-panel { padding: 10px 15px; border-top: 1px solid rgba(255, 255, 255, 0.1); display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; font-size: 11px; flex-shrink: 0; }
        .phbot-stat-label { color: #aaa; } .phbot-stat-value { color: #fff; font-weight: 600; text-align: right; }
        .phbot-tabs { display: flex; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding: 0 8px; flex-shrink: 0; }
        .phbot-tab { padding: 8px 10px; cursor: pointer; color: #aaa; font-weight: 600; font-size: 13px; border-bottom: 2px solid transparent; }
        .phbot-tab:hover { color: #fff; }
        .phbot-tab.active { color: var(--theme-accent); border-bottom-color: var(--theme-accent); }
        .phbot-tab-content-wrapper { flex-grow: 1; min-height: 0; overflow-y: auto; padding: 15px; }
        .phbot-tab-content { display: none; flex-direction: column; gap: 12px; }
        .phbot-tab-content.active { display: flex; }
        #phbot-settings-menu { position: absolute; top: 50px; right: 15px; background: rgba(20, 22, 28, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; width: 180px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); opacity: 0; visibility: hidden; transition: all .2s ease; transform: translateY(-10px); }
        #phbot-hud.settings-visible #phbot-settings-menu { opacity: 1; visibility: visible; transform: translateY(0); }
        .phbot-menu-item { padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; position: relative; }
        .phbot-menu-item:hover { background-color: rgba(255, 255, 255, 0.1); }
        #phbot-themes-submenu { position: absolute; top: -5px; left: 100%; margin-left: 5px; background: rgba(20, 22, 28, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; width: 170px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: none; padding: 5px; }
        .theme-swatch { display: flex; align-items: center; gap: 8px; }
        .theme-color-dot { width: 12px; height: 12px; border-radius: 50%; }
        @keyframes log-fade-in { from { opacity: 0; transform: translateX(-10px) } to { opacity: 1; transform: translateX(0) } }
    `;
    const styleSheet = document.createElement("style"); styleSheet.innerText = allCSS;
    document.head.appendChild(styleSheet);
    
    const icons = {
        power: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,7V13H13V7H11Z" /></svg>`,
        sell: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,4C11.45,4 11,4.45 11,5V7H13V5C13,4.45 12.55,4 12,4M5,11C4.45,11 4,11.45 4,12C4,12.55 4.45,13 5,13H7V11H5M17,11V13H19C19.55,13 20,12.55 20,12C20,11.45 19.55,11 19,11H17M11,17V19C11,19.55 11.45,20 12,20C12.55,20 13,19.55 13,19V17H11M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" /></svg>`,
        squeeze: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6,2V8H6V8L2,5V5L6,2M18,2L22,5V5L18,8H18V2M11,2H13V22H11V2M2,16L6,19V19L6,13H6L2,16M18,13V19L22,16L18,13Z" /></svg>`,
        stamina: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,21.5C8,21.5 8,15 8,15H16C16,15 16,21.5 12,21.5M15,13H9V14C9,14.69 9.28,15.32 9.7,15.78C9.89,16 10.35,16.47 11,16.82V19.23L7,20.58L7.5,21.5L12,20L16.5,21.5L17,20.58L13,19.23V16.82C13.65,16.47 14.11,16 14.3,15.78C14.72,15.32 15,14.69 15,14V13M12,2C14.76,2 17,4.24 17,7C17,9.76 14.76,12 12,12C9.24,12 7,9.76 7,7C7,4.24 9.24,2 12,2Z" /></svg>`,
        daycare: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6C10.9,6 10,6.9 10,8C10,9.11 10.9,10 12,10C13.1,10 14,9.11 14,8C14,6.9 13.1,6 12,6M7,12C7,13.11 7.9,14 9,14V18H15V14C16.1,14 17,13.11 17,12V11H7V12Z" /></svg>`,
        reward: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5C7.25 2.5 4.5 5.5 4.5 5.5V11C4.5 13.5 5.25 16.5 12 19.5C18.75 16.5 19.5 13.5 19.5 11V5.5C19.5 5.5 16.75 2.5 12 2.5M12 4.5C15.25 4.5 16.5 6 16.5 6M12 4.5C8.75 4.5 7.5 6 7.5 6M12 11.25L14.25 13L12 14.75L9.75 13L12 11.25Z" /></svg>`,
        autoConfig: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z M14 7l3 3 M5 6v4 M19 14v4 M10 2v2 M7 8H3 M21 16h-4 M11 3H9" /></svg>`,
        analyze: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L21.5,20L20,21.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" /></svg>`,
        turbo: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5,15.5L7.5,18L10,15.5L7.5,13L5,15.5M14,15.5L16.5,18L19,15.5L16.5,13L14,15.5M7.5,8L10,5.5L7.5,3L5,5.5L7.5,8M16.5,8L19,5.5L16.5,3L14,5.5L16.5,8M3,21V3H21V21H3Z" /></svg>`,
        minimize: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20,14H4V10H20" /></svg>`,
        maximize: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4,14H20V16H4V14M4,8H20V10H4V8" /></svg>`,
        settings: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" /></svg>`,
        close: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></svg>`
    };
    
    const hud = newElement('div', { id: 'phbot-hud', className: settings.theme });
    if (settings.isMinimized) hud.classList.add('minimized');
    
    const header = newElement('div', { className: 'phbot-header' });
    const windowControls = newElement('div', { className: 'phbot-window-controls' });
    const settingsBtn = newElement('button', { className: 'phbot-window-btn', innerHTML: icons.settings });
    const minBtn = newElement('button', { id: 'phbot-min-btn', className: 'phbot-window-btn', innerHTML: icons.minimize });
    windowControls.append(settingsBtn, minBtn);
    header.append(newElement('span', { className: 'phbot-title', textContent: `PHbot v${botVersion}` }), windowControls);
    
    const wrapper = newElement('div', { className: 'phbot-wrapper' });
    const tabContainer = newElement('div', { className: 'phbot-tabs' });
    const contentContainer = newElement('div', { className: 'phbot-tab-content-wrapper'});

    const createTab = (id, name, contentElements) => {
        const tab = newElement('div', { className: 'phbot-tab', textContent: name, dataset: { tab: id } });
        const content = newElement('div', { id: `content-${id}`, className: 'phbot-tab-content' });
        content.append(...contentElements);
        tab.onclick = () => {
            document.querySelectorAll('.phbot-tab, .phbot-tab-content').forEach(el => el.classList.remove('active'));
            tab.classList.add('active');
            content.classList.add('active');
            settings.activeTab = id;
            saveSettings();
        };
        return { tab, content };
    };
    
    const createToggleButton = (text, icon, settingKey) => { const button = newElement("button", { className: `phbot-toggle ${!settings[settingKey] ? 'active' : ''}` }); if(settings[settingKey]) button.classList.remove("active"); else button.classList.add("active"); button.innerHTML = `${icon}<span>${text}</span><div class="toggle-icon"></div>`; button.onclick = () => { settings[settingKey] = !settings[settingKey]; button.classList.toggle("active", !settings[settingKey]); const s = document.getElementById('phbot-min-status'); s.textContent = settings.isPaused ? "Parado" : "Em Execução"; s.classList.toggle('active', !settings.isPaused); saveSettings(); }; return button; };
    const createActionButton = (text, icon, settingKey) => { const button = newElement("button", { className: `phbot-toggle ${settings[settingKey] ? 'active' : ''}` }); button.innerHTML = `${icon}<span>${text}</span><div class="toggle-icon"></div>`; button.onclick = () => { settings[settingKey] = !settings[settingKey]; button.classList.toggle("active", settings[settingKey]); saveSettings(); }; return button; };

    const geralTabContent = [
        createToggleButton("Bot Ativo", icons.power, 'isPaused'),
        newElement('button', { className: 'phbot-button', innerHTML: `${icons.autoConfig}<span>Autoconfigurar</span>`, onclick: handleAutoConfig })
    ];
    
    const autoTabContent = [
        createActionButton("Venda Automática", icons.sell, 'isSellEnabled'),
        newElement('div', { className: 'phbot-control-group' }, [ newElement('label', { className: 'phbot-label', textContent: 'Vender itens abaixo de:' }), newElement('input', { className: 'phbot-input', type: "number", value: settings.sellRarityThreshold, onchange: (e) => { settings.sellRarityThreshold=parseInt(e.target.value); saveSettings(); } }) ]),
        createActionButton("Espremer Automático", icons.squeeze, 'isSqueezeEnabled'),
        newElement('div', { className: 'phbot-control-group' }, [ newElement('label', { className: 'phbot-label', textContent: 'Espremer raridade entre:' }), newElement('div', { className: 'phbot-input-group' }, [ newElement('input', { className: 'phbot-input', type: "number", value: settings.squeezeRarityMin, onchange: (e) => { settings.squeezeRarityMin=parseInt(e.target.value); saveSettings(); } }), newElement('input', { className: 'phbot-input', type: "number", value: settings.squeezeRarityMax, onchange: (e) => { settings.squeezeRarityMax=parseInt(e.target.value); saveSettings(); } }) ]) ]),
        createActionButton("Stamina Automática", icons.stamina, 'isStaminaEnabled'),
        newElement('div', { className: 'phbot-control-group' }, [ newElement('label', { className: 'phbot-label', textContent: 'Usar poção abaixo de:' }), newElement('input', { className: 'phbot-input', type: "number", value: settings.staminaThreshold, onchange: (e) => { settings.staminaThreshold=parseInt(e.target.value); saveSettings(); } }) ]),
        newElement('div', {className: 'phbot-divider'}),
        newElement('button', { className: 'phbot-button disabled', innerHTML: `${icons.daycare}<span>Auto-Creche (Em Breve)</span>`}),
        newElement('button', { className: 'phbot-button disabled', innerHTML: `${icons.reward}<span>Coleta Auto (Em Breve)</span>`})
    ];
    
    const extrasTabContent = [
        newElement('button', { className: 'phbot-button disabled', innerHTML: `${icons.analyze}<span>Analisar Tabuleiro (Em Breve)</span>`}),
        newElement('button', { className: 'phbot-button disabled', innerHTML: `${icons.turbo}<span>Modo Turbo (Em Breve)</span>`}),
        newElement('button', { className: 'phbot-button disabled', innerHTML: `${icons.analyze}<span>Hunt Analyser (Em Breve)</span>`}),
    ];

    const { tab: geralTab, content: geralContent } = createTab('geral', 'Geral', geralTabContent);
    const { tab: autoTab, content: autoContent } = createTab('automacao', 'Automação', autoTabContent);
    const { tab: extrasTab, content: extrasContent } = createTab('extras', 'Extras', extrasTabContent);
    
    tabContainer.append(geralTab, autoTab, extrasTab);
    contentContainer.append(geralContent, autoContent, extrasContent);
    wrapper.append(tabContainer, contentContainer);
    
    const statsPanel = newElement('div', { className: 'phbot-stats-panel' });
    const statEntries = { 'Vendidos': 'phbot-stat-sold', 'Espremidos': 'phbot-stat-squeezed', 'Poções': 'phbot-stat-potions', 'Caçadas': 'phbot-stat-hunts', 'Atividade': 'phbot-stat-time' };
    for (const [label, id] of Object.entries(statEntries)) { statsPanel.append( newElement('span', {className:'phbot-stat-label', textContent:label}), newElement('span', {className:'phbot-stat-value', id:id, textContent:(label === 'Atividade')?'00:00:00':'0'}) ); }
    
    const minimizedBar = newElement('div', { className: 'phbot-minimized-bar' }); 
    const maxBtn = newElement('button', { id: 'phbot-max-btn', className: 'phbot-window-btn', innerHTML: icons.maximize });
    minimizedBar.append( newElement('span', { className: 'phbot-title', textContent: `PHbot`}), newElement('span', { id: 'phbot-min-status', className: `phbot-min-status ${!settings.isPaused ? 'active' : ''}`, textContent: settings.isPaused ? 'Parado' : 'Em Execução' }), maxBtn );

    const settingsMenu = newElement('div', { id: 'phbot-settings-menu' });
    
    hud.append(header, wrapper, statsPanel, minimizedBar, settingsMenu);
    
    const logPanel = newElement('div', { id: 'phbot-log-panel', className: settings.logVisible ? 'hidden' : '' });
    logPanel.append(
        newElement('div', { id: 'phbot-log-header' }, [
            newElement('span', { id: 'phbot-log-title', textContent: 'Log de Ações' }),
            newElement('button', { className: 'phbot-window-btn', innerHTML: icons.close, onclick: () => { logPanel.classList.add('hidden'); saveSettings(); } })
        ]),
        newElement('div', { id: 'phbot-log-panel-content' })
    );
    document.body.append(hud, logPanel);
    
    settingsBtn.onclick = (e) => { e.stopPropagation(); hud.classList.toggle('settings-visible'); };
    document.addEventListener('click', (e) => { if (!hud.contains(e.target)) hud.classList.remove('settings-visible'); });
    settingsMenu.addEventListener('click', (e) => e.stopPropagation());

    const logMenuItem = newElement('div', { className: 'phbot-menu-item', textContent: 'Ver Log' });
    logMenuItem.onclick = (e) => { e.stopPropagation(); logPanel.classList.toggle('hidden'); hud.classList.remove('settings-visible'); saveSettings(); };
    
    const themesMenuItem = newElement('div', { className: 'phbot-menu-item' });
    themesMenuItem.innerHTML = `<span>Temas</span><span style="font-size: 10px; color: #aaa;">></span>`;
    const themesSubMenu = newElement('div', { id: 'phbot-themes-submenu' });
    let themeMenuTimeout;
    themesMenuItem.addEventListener('mouseenter', () => { clearTimeout(themeMenuTimeout); themesSubMenu.style.display = 'block'; });
    themesMenuItem.addEventListener('mouseleave', () => { themeMenuTimeout = setTimeout(() => { themesSubMenu.style.display = 'none'; }, 200); });
    themesSubMenu.addEventListener('mouseenter', () => clearTimeout(themeMenuTimeout));
    themesSubMenu.addEventListener('mouseleave', () => { themeMenuTimeout = setTimeout(() => { themesSubMenu.style.display = 'none'; }, 200); });
    
    const themes = { 'Fênix': 'theme-fenix', 'Classic': 'theme-classic', 'Stealth': 'theme-stealth', 'Cyberpunk': 'theme-cyberpunk', 'Hacker': 'theme-hacker', 'Ciano': 'theme-ciano', 'Ouro': 'theme-ouro', 'Vampiro': 'theme-vampiro', 'Tóxico': 'theme-toxico', 'Profundo': 'theme-profundo' };
    const applyTheme = (themeName) => {
        const hudEl = document.getElementById('phbot-hud');
        let classes = hudEl.className.split(' ').filter(c => !c.startsWith('theme-')).join(' ');
        hudEl.className = `${classes} ${themeName}`;
        settings.theme = themeName; 
        saveSettings();
    };
    for (const [name, className] of Object.entries(themes)) { const themeOption = newElement('div', { className: 'phbot-menu-item theme-swatch' }); themeOption.onclick = (e) => { e.stopPropagation(); applyTheme(className); hud.classList.remove('settings-visible'); }; const colorDot = newElement('div', {className: 'theme-color-dot', style: {backgroundColor: `var(--${className.replace('theme-','')}-accent)`}}); themeOption.append(colorDot, newElement('span', {textContent: name})); themesSubMenu.appendChild(themeOption); }
    themesMenuItem.appendChild(themesSubMenu);
    
    const resetStatsBtn = newElement('div', { className: 'phbot-menu-item', textContent: 'Resetar Estatísticas' });
    resetStatsBtn.onclick = (e) => { e.stopPropagation(); resetStats(); hud.classList.remove('settings-visible'); };
    
    settingsMenu.append(logMenuItem, themesMenuItem, newElement('div',{className: 'phbot-divider'}), resetStatsBtn);

    document.querySelector(`.phbot-tab[data-tab="${settings.activeTab}"]`)?.click();
    minBtn.onclick = () => { hud.classList.add('minimized'); saveSettings(); };
    maxBtn.onclick = () => { hud.classList.remove('minimized'); saveSettings(); };
    makeDraggable(hud, '.phbot-header, .phbot-minimized-bar');
    makeDraggable(logPanel, '#phbot-log-header');
}

loadSettings();