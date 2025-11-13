import { getData } from '../core/storage.js';

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loader');
    const contentArea = document.getElementById('content-area');
    
    // Simulate a quick check
    setTimeout(() => {
        const data = getData();

        if (data && data.valid) {
            // User has data
            contentArea.innerHTML = `
                <h2 class="welcome-back">Bon retour, ${data.nom}</h2>
                <div class="button-group">
                    <a href="main.html" class="btn btn-primary">📊 Accéder au tableau de bord</a>
                    <a href="data.html" class="btn">🔄 Mettre à jour les données</a>
                    <a href="improve.html" class="btn">📈 Analyser ma performance</a>
                </div>
            `;
        } else {
            // New user
            contentArea.innerHTML = `
                <p class="welcome-message">Calculez votre moyenne et analysez votre performance académique.</p>
                <div class="button-group">
                    <a href="data.html" class="btn btn-primary">🚀 Commencer l'analyse</a>
                </div>
            `;
        }

        loader.classList.add('hidden');
        contentArea.classList.remove('hidden');
    }, 250); // A small delay to make the transition feel smooth
});
