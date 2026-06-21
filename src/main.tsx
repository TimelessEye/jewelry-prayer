import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

if (new URLSearchParams(window.location.search).has('reset')) {
  localStorage.removeItem('prayer-jewelry.state.v1')
  localStorage.removeItem('prayer-jewelry.currentParticipantId.v1')
  window.history.replaceState(null, '', window.location.pathname)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
