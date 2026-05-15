import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadSettings } from './utils/settings'
import { applyThemeMode } from './utils/theme'

applyThemeMode(loadSettings().themeMode ?? 'system');
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { ConfirmProvider } from './contexts/ConfirmContext.tsx'

if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

// Prevent browser-level zoom (pinch, Ctrl+scroll, gesture)
// Our custom zoom only affects the content area inside SolveView/SolveViewDoc
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
// Do NOT globally block touchmove — viewport handles its own 2-finger gestures
// via touchAction: 'none' on the element itself

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ErrorBoundary>
  </StrictMode>,
)
