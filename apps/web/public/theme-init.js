// Applies the saved theme before the page first paints, so it never flashes the wrong theme.
// An external file (not inline) so the CSP needs no hash. Same key and values as
// src/components/ThemeMenu.vue. No saved value = follow the system setting.
try {
  var theme = localStorage.getItem('mfcd-theme')
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
  }
} catch {
  // Storage blocked: follow the system setting.
}
