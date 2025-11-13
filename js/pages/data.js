
import { getData, initializeUserData, updateEtapeData, recordHistorique } from '../core/storage.js';
import { parsePortalData } from '../core/parser.js';
import { calculateAllAverages } from '../core/calculations.js';

const rawTextArea = document.getElementById('raw-text');
const statusArea = document.getElementById('status-area');

// Allow pasting by temporarily removing readonly attribute on focus
rawTextArea.addEventListener('focus', () => {
    rawTextArea.removeAttribute('readonly');
});
rawTextArea.addEventListener('blur', () => {
    rawTextArea.setAttribute('readonly', 'readonly');
});

// Main paste event listener
rawTextArea.addEventListener('paste', (event) => {
    // Let the paste operation complete before processing
    setTimeout(async () => {
        const pastedText = rawTextArea.value;
        if (!pastedText.trim()) return;

        statusArea.innerHTML = `<div class="loader-small"></div><p>Analyse en cours...</p>`;

        const parsedResult = parsePortalData(pastedText);

        if (!parsedResult) {
            statusArea.innerHTML = `<p class="error">❌ Erreur: Les données semblent invalides. Veuillez réessayer.</p>`;
            return;
        }

        const { nom, etapeKey, etapeData } = parsedResult;
        const currentUserData = getData();

        if (!currentUserData.valid) {
            // First time user
            initializeUserData(nom, etapeKey, etapeData);
        } else {
            // Existing user, overwrite data
            updateEtapeData(etapeKey, etapeData);
        }

        // After saving, record the new average for trend analysis
        const updatedData = getData();
        const allAverages = calculateAllAverages(updatedData);
        const newEtapeAverage = allAverages.termAverages[etapeKey];
        recordHistorique(etapeKey, newEtapeAverage);

        statusArea.innerHTML = `<p class="success">Données analysées avec succès ! Redirection...</p>`;
        
        // Redirect to the main dashboard
        setTimeout(() => {
            window.location.href = 'main.html';
        }, 1500);

    }, 0);
});
