import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app.jsx'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing #root element. Add <div id="root"></div> to the HTML page.')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
