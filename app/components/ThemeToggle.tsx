'use client'

import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sungbok-theme'

function getCurrentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function subscribe(callback: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY || (event.newValue !== 'light' && event.newValue !== 'dark')) return
    document.documentElement.dataset.theme = event.newValue
    document.documentElement.style.colorScheme = event.newValue
    callback()
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener('sungbok-theme-change', callback)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener('sungbok-theme-change', callback)
  }
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getCurrentTheme, () => 'light')

  function toggleTheme() {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
    localStorage.setItem(STORAGE_KEY, nextTheme)
    window.dispatchEvent(new Event('sungbok-theme-change'))
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드' : '다크 모드'}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">
          {isDark ? (
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M20.2 15.2A8.4 8.4 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v2.1M12 19.9V22M4.93 4.93l1.49 1.49M17.58 17.58l1.49 1.49M2 12h2.1M19.9 12H22M4.93 19.07l1.49-1.49M17.58 6.42l1.49-1.49" />
            </svg>
          )}
        </span>
      </span>
    </button>
  )
}
