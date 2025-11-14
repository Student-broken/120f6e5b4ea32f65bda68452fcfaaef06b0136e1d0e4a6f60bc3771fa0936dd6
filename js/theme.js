/* js/theme.js */

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('theme-toggle');
    const loader = document.getElementById('page-loader');
    const html = document.documentElement;
    
    // 1. Handle Loading Animation
    // Fade out the loader after a small delay to show the animation
    setTimeout(() => {
        loader.style.opacity = '0';
        // Wait for the fade-out transition to complete before setting visibility
        setTimeout(() => {
            loader.style.visibility = 'hidden';
        }, 500); // Matches the CSS transition duration
    }, 600); // Total delay of 1.1s (0.6s visible + 0.5s fade-out)

    // 2. Handle Dark Mode Logic
    // We already set the initial theme in the HTML <script> to prevent FOUC (Flash of Unstyled Content)
    
    // Toggle Event
    toggleBtn.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateIcon(newTheme === 'dark');
    });

    // Run once to ensure the button icon matches the current theme
    const isDark = html.getAttribute('data-theme') === 'dark';
    updateIcon(isDark);


    function updateIcon(isDark) {
        // Simple Sun/Moon icon toggle
        toggleBtn.innerHTML = isDark ? '☀️' : '🌙';
        toggleBtn.setAttribute('title', isDark ? 'Passer en mode clair' : 'Passer en mode sombre');
    }
});
