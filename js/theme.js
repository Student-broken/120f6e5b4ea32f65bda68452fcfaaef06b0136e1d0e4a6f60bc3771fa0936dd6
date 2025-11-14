/* js/theme.js */

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('theme-toggle');
    const loader = document.getElementById('page-loader');
    const html = document.documentElement;
    
    // 1. Handle Loading Animation
    // Fake a short delay to show animation, or remove setTimeout to hide immediately after load
    setTimeout(() => {
        loader.style.opacity = '0';
        loader.style.visibility = 'hidden';
    }, 600); 

    // 2. Handle Dark Mode Logic
    const storedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Apply initial theme
    if (storedTheme === 'dark' || (!storedTheme && systemPrefersDark)) {
        html.setAttribute('data-theme', 'dark');
        updateIcon(true);
    } else {
        html.setAttribute('data-theme', 'light');
        updateIcon(false);
    }

    // Toggle Event
    toggleBtn.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateIcon(newTheme === 'dark');
    });

    function updateIcon(isDark) {
        // Simple Sun/Moon text or SVG replacement
        toggleBtn.innerHTML = isDark ? '☀️' : '🌙';
        toggleBtn.setAttribute('title', isDark ? 'Passer en mode clair' : 'Passer en mode sombre');
    }
});
