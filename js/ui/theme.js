/**
 * Applies the theme based on localStorage or system preference.
 * Should be called in the <head> of the HTML for instant application.
 */
export function applyTheme() {
    const savedTheme = localStorage.getItem('mbs-theme') || 'auto';
    
    if (savedTheme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
        document.documentElement.dataset.theme = savedTheme;
    }
}

/**
 * Sets up the event listener for the theme toggle switch.
 */
export function setupThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    // Set initial state of the checkbox
    const currentTheme = document.documentElement.dataset.theme;
    toggle.checked = currentTheme === 'dark';

    toggle.addEventListener('change', () => {
        const newTheme = toggle.checked ? 'dark' : 'light';
        localStorage.setItem('mbs-theme', newTheme);
        document.documentElement.dataset.theme = newTheme;
    });
}

// Apply theme immediately on script load
applyTheme();
