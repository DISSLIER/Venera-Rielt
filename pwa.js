let deferredInstallPrompt = null;

function showInstallButton() {
  const btn = document.getElementById('install-app-btn');
  if (!btn) return;
  btn.classList.remove('hidden');
}

function hideInstallButton() {
  const btn = document.getElementById('install-app-btn');
  if (!btn) return;
  btn.classList.add('hidden');
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.log('SW register error:', error);
  }
}

function bindInstallFlow() {
  const installBtn = document.getElementById('install-app-btn');
  if (!installBtn) return;

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice && choice.outcome === 'accepted') {
      hideInstallButton();
    }
    deferredInstallPrompt = null;
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallButton();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  bindInstallFlow();
});
