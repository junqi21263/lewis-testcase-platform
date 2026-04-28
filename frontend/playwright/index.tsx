import { createRoot } from 'react-dom/client'
import { registerRoot } from '@playwright/experimental-ct-react'

// This file is required by Playwright Component Testing (React).
// It wires Playwright's mount() into React's root renderer.
registerRoot(createRoot(document.getElementById('root')!))

