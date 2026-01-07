import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './style.css'

// Service Worker registration for controlled updates
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // @ts-ignore - virtual:pwa-register is provided by vite-plugin-pwa at build time
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Dispatch event with the update function
        window.dispatchEvent(new CustomEvent('sw-update-available', {
          detail: { updateSW }
        }));
      },
      onOfflineReady() {
        console.log('Service Worker ready for offline use');
      },
      onRegistered(registration: ServiceWorkerRegistration | undefined) {
        console.log('Service Worker registered');
        // Check for updates periodically (every hour)
        if (registration) {
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        }
      },
      onRegisterError(error: Error) {
        console.error('Service Worker registration error:', error);
      },
    });
  });
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

