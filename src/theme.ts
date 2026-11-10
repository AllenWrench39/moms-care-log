// Light / dark / follow-the-phone. The choice is kept on this phone only.
export type ThemeChoice = 'auto' | 'light' | 'dark'
const KEY = 'theme-choice'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch { return 'auto' }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'auto' && media.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // Colours the phone's status bar to match.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#28221d' : '#ffffff')
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch { /* private mode: applies for this visit only */ }
  apply(choice)
}

export function initTheme() {
  apply(getThemeChoice())
  media.addEventListener('change', () => apply(getThemeChoice()))
}
