import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/design-tokens.css'
import './styles/global.css'
import './styles/layout.css'
import './styles/wallet.css'
import './styles/settings.css'
import App from './App.tsx'

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
  );
}
