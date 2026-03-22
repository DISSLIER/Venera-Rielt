let deferredInstallPrompt = null;

function getInstallMenuLink() {
  return document.getElementById('mobile-install-app-link');
}

function isAppAlreadyInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showInstallButton() {
  const btn = getInstallMenuLink();
  if (!btn) return;
  btn.classList.remove('hidden');
}

function hideInstallButton() {
  const btn = getInstallMenuLink();
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
  const installBtn = getInstallMenuLink();
  if (!installBtn) return;

  if (isAppAlreadyInstalled()) {
    hideInstallButton();
    return;
  }

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice && choice.outcome === 'accepted') {
      hideInstallButton();
    }

    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
      mobileMenu.classList.add('hidden');
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
  hideInstallButton();
  registerServiceWorker();
  bindInstallFlow();
});
