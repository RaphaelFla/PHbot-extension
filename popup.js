    'use strict';

    function updateStatus() {
        const statusText = document.getElementById('bot-status');
        const versionText = document.getElementById('bot-version');

        chrome.storage.local.get('botState', ({ botState }) => {
            if (botState) {
                if (botState.isPaused) {
                    statusText.textContent = 'PAUSADO';
                    statusText.className = 'status-text status-paused';
                } else {
                    statusText.textContent = 'ATIVO';
                    statusText.className = 'status-text status-active';
                }
                if(botState.version) {
                    versionText.textContent = `v${botState.version}`;
                }
            }
        });
    }

    // Atualiza o status quando o popup é aberto
    document.addEventListener('DOMContentLoaded', updateStatus);

    // Atualiza o status em tempo real se o estado do bot mudar
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.botState) {
            updateStatus();
        }
    });

    // Lógica do botão "Ir para o Jogo"
    document.getElementById('go-to-game').addEventListener('click', () => {
        chrome.tabs.query({ url: 'https://bestiaryarena.com/*' }, (tabs) => {
            if (tabs.length > 0) {
                const gameTab = tabs[0];
                chrome.tabs.update(gameTab.id, { active: true });
                chrome.windows.update(gameTab.windowId, { focused: true });
            } else {
                chrome.tabs.create({ url: 'https://bestiaryarena.com' });
            }
        });
    });