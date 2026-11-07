import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'styled-components'
import { App } from './App'
import { theme } from './theme'
import { BuzzLook } from './ui/look'
import './assets/fonts/fonts.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <ThemeProvider theme={theme}>
    <BuzzLook />
    <App />
  </ThemeProvider>,
)
