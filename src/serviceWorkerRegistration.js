const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

// Capture whether the page already had a SW controller BEFORE this load.
// • false = first-ever install  → no reload needed; new SW just starts caching
//                                  for the NEXT visit.
// • true  = SW upgrade scenario → reload so the new SW serves fresh assets.
const wasControlledOnLoad = !!navigator.serviceWorker?.controller;

// Registered ONCE at module level — never accumulates, never fires twice.
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  // ── First install guard ───────────────────────────────────────────────────
  // On a brand-new install (no previous SW), clientsClaim() in the SW fires
  // controllerchange, but there's nothing stale to evict.  Reloading here
  // would break the first-load experience (and cause the drawer/CTA glitch).
  if (!wasControlledOnLoad) {
    console.log('[SW] First install — skipping reload.');
    return;
  }

  // ── SW update scenario ────────────────────────────────────────────────────
  // A new SW just took over from an old one.  Reload once so the page is
  // served by the fresh SW.  The sessionStorage flag prevents a second
  // reload if controllerchange fires again before the page unloads.
  if (sessionStorage.getItem('sw-reloading')) {
    sessionStorage.removeItem('sw-reloading');
    return;
  }
  sessionStorage.setItem('sw-reloading', '1');

  console.log('[SW] Controller updated — reloading for fresh assets.');
  // Small delay so any in-flight async work can settle before the reload.
  setTimeout(() => window.location.reload(), 300);
});

export function register(config) {
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) return;

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;
      if (isLocalhost) {
        checkValidServiceWorker(swUrl, config);
      } else {
        registerValidSW(swUrl, config);
      }
    });
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) return;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New SW is waiting — send SKIP_WAITING.
              // The controllerchange listener above handles the single reload.
              if (config && config.onUpdate) config.onUpdate(registration);
            } else {
              if (config && config.onSuccess) config.onSuccess(registration);
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('[SW] Registration error:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // SW file not found — unregister silently.
        navigator.serviceWorker.ready.then((reg) => reg.unregister());
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('[SW] No internet connection. App running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => registration.unregister())
      .catch((error) => console.error(error.message));
  }
}