import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

// Capture control before the app registers a worker that can claim this page.
const controlledAtLoad = !!navigator.serviceWorker?.controller

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controlledAtLoad={controlledAtLoad} />
  </StrictMode>,
)
