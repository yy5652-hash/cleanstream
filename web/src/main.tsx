import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { prepareServiceWorker } from './bootstrap'
import { t } from './i18n'
import './styles.css'
import App from './App.tsx'

// Capture control before the app registers a worker that can claim this page.
const controlledAtLoad = !!navigator.serviceWorker?.controller

const container = document.getElementById('root')!
container.textContent = t('Loading…')

async function mount() {
  if (import.meta.env.PROD && await prepareServiceWorker()) return
  createRoot(container).render(
    <StrictMode>
      <App controlledAtLoad={controlledAtLoad} />
    </StrictMode>,
  )
}
void mount()
