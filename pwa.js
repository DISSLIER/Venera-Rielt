let deferredInstallPrompt = null;

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showAppLaunchSplash() {
  const splash = document.getElementById('app-launch-splash');
  if (!splash || !isStandaloneMode()) return;

  splash.classList.remove('hidden');

  window.setTimeout(() => {
    splash.classList.add('fade-out');
    window.setTimeout(() => {
      splash.classList.add('hidden');
      splash.classList.remove('fade-out');
    }, 360);
  }, 900);
}

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
    await navigator.serviceWorker.register('/sw.js?v=2');
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
  showAppLaunchSplash();
  registerServiceWorker();
  bindInstallFlow();
});
