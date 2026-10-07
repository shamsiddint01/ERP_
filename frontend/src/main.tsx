import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { getThemeConfig } from './theme.ts'
import { useThemeStore } from './store/theme.store.ts'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

/** AntD follows the light / dark mode; the CSS variables flip via <html data-theme>. */
function ThemedRoot() {
  const mode = useThemeStore((state) => state.mode)
  const config = useMemo(() => getThemeConfig(mode), [mode])
  return (
    <ConfigProvider theme={config}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedRoot />
  </StrictMode>,
)
