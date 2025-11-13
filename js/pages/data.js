import { getData, saveData } from '../core/storage.js';
import { parsePortalData } from '../core/parser.js';
import { calculateAveragesFromSource } from '../core/calculations.js';

document.addEventListener('DOMContentLoaded', () => {
    const dataForm = document.getElementById('data-form');
    const rawTextArea = document.getElementById('raw-text');
    const submitBtn = document.getElementById('submit-btn');

    const updateSubmitButtonState = () => {
        submitBtn.disabled = rawTextArea.value.trim().length === 0;
    };

    rawTextArea.addEventListener('paste', () => {
        // Use a short timeout to allow the paste operation to complete
        setTimeout(updateSubmitButtonState, 0);
    });

    dataForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Analyse en cours...';

        const rawText = rawTextArea.value;
        if (!rawText.trim()) {
            alert("Veuillez coller des données avant de sauvegarder.");
            submitBtn.disabled = false;
            submitBtn.textContent = 'Analyser et Sauvegarder';
            return;
        }

        const parsedResult = parsePortalData(rawText);
        if (!parsedResult) {
            alert("Erreur: Les données collées sont invalides ou incomplètes. Vérifiez le texte et réessayez.");
            submitBtn.disabled = false;
            submitBtn.textContent = 'Analyser et Sauvegarder';
            return;
        }
        
        // Overwrite strategy
        const mbsData = getData();
        mbsData.nom = parsedResult.nom;
        mbsData[parsedResult.etapeKey] = parsedResult.etapeData;
        mbsData.valid = true;

        // Record history
        const averages = calculateAveragesFromSource(mbsData);
        const termAverage = averages.termAverages[parsedResult.etapeKey];
        if (termAverage !== null) {
            const history = mbsData.historique[parsedResult.etapeKey];
            history.timestamps.push(Date.now());
            history.moyennes.push(termAverage);
        }

        saveData(mbsData);
        
        // Redirect to main page after successful save
        window.location.href = 'main.html';
    });
});
