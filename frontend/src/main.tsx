import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { WorkspaceToaster } from '@/components/ui/WorkspaceToaster'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <WorkspaceToaster />
  </React.StrictMode>,
)
