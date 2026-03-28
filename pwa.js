let deferredInstallPrompt = null;
const APP_SPLASH_SESSION_KEY = 'venera_app_splash_session_shown';

function getInstallMenuLink() {
  return document.getElementById('mobile-install-app-link');
}

function isAppAlreadyInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getAppSplashElements() {
  return {
    container: document.getElementById('app-splash'),
    video: document.getElementById('app-splash-video')
  };
}

function shouldShowSplash() {
  if (typeof window.__VENERA_SPLASH_PRELOAD__ === 'boolean') {
    return window.__VENERA_SPLASH_PRELOAD__;
  }

  if (!isAppAlreadyInstalled()) {
    return false;
  }

  try {
    return sessionStorage.getItem(APP_SPLASH_SESSION_KEY) !== '1';
  } catch (_) {
    return true;
  }
}

function markSplashAsShown() {
  try {
    sessionStorage.setItem(APP_SPLASH_SESSION_KEY, '1');
  } catch (_) {
    // ignore storage errors
  }
}

function hideSplash(container) {
  if (!container) return;
  container.classList.add('fade-out');
  window.setTimeout(() => {
    container.classList.add('hidden');
    container.classList.remove('fade-out');
    document.documentElement.classList.remove('show-app-splash-preload');
  }, 460);
}

function runAppSplashOnce() {
  const { container, video } = getAppSplashElements();
  if (!container || !video || !shouldShowSplash()) {
    if (container) {
      container.classList.add('hidden');
    }
    document.documentElement.classList.remove('show-app-splash-preload');
    return;
  }

  container.classList.remove('hidden');
  markSplashAsShown();

  let finished = false;
  const complete = () => {
    if (finished) return;
    finished = true;
    hideSplash(container);
  };

  // Закрываем splash строго по завершению ролика.
  video.addEventListener('ended', complete, { once: true });

  // Если видео не может быть загружено/проиграно, не блокируем вход в приложение.
  video.addEventListener('error', complete, { once: true });

  // iOS/Safari: для autoplay видео должно быть muted + inline на уровне property и attribute.
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.removeAttribute('controls');

  video.currentTime = 0;

  // Несколько попыток autoplay подряд, чтобы обойти гонки готовности видео в iOS.
  const tryPlay = () => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Ничего не делаем здесь: дополнительные попытки ниже.
      });
    }
  };

  tryPlay();
  window.requestAnimationFrame(tryPlay);
  window.setTimeout(tryPlay, 120);
  video.addEventListener('canplay', tryPlay, { once: true });

  // Если iOS все равно блокирует autoplay (напр. Low Power Mode), не держим splash бесконечно.
  window.setTimeout(() => {
    if (video.paused) {
      complete();
    }
  }, 2200);
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
    await navigator.serviceWorker.register('/sw.js?v=4');
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
  runAppSplashOnce();
  registerServiceWorker();
  bindInstallFlow();
});
