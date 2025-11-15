document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const openModalBtn = document.getElementById('open-modal-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const tutorialModal = document.getElementById('tutorial-modal');
    const rawTextArea = document.getElementById('raw-text');
    
    // Nouveaux éléments pour le thème et l'animation
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const pageBody = document.getElementById('page-body');
    const dataWidget = document.getElementById('data-widget');
    const loadingOverlay = document.getElementById('loading-overlay');

    // --- Initial Loading Animation ---
    // Déclenchement de l'animation d'entrée du widget
    dataWidget.classList.add('loaded');
    
    // Masquage de l'écran de chargement après un court délai
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => {
            if (loadingOverlay.parentNode) {
                loadingOverlay.parentNode.removeChild(loadingOverlay);
            }
        }, 500); // 500ms correspond à la transition CSS
    }, 100);

    // --- Dark Mode Logic ---
    const THEME_KEY = 'mbsTheme';
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    
    const applyTheme = (theme) => {
        pageBody.setAttribute('data-theme', theme);
        const isDark = theme === 'dark';
        // Mise à jour de l'icône
        themeIcon.classList.toggle('fa-sun', isDark);
        themeIcon.classList.toggle('fa-moon', !isDark);
        themeToggleBtn.title = isDark ? 'Mode Clair' : 'Mode Sombre';
    };

    // Application du thème initial
    applyTheme(savedTheme);

    // Fonction de bascule
    const toggleTheme = () => {
        const currentTheme = pageBody.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
    };

    // Écouteur d'événement pour le bouton de bascule
    themeToggleBtn.addEventListener('click', toggleTheme);

    // --- Modal Logic ---
    const openModal = () => tutorialModal.classList.add('active');
    const closeModal = () => tutorialModal.classList.remove('active');

    openModalBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    tutorialModal.addEventListener('click', (e) => { if (e.target === tutorialModal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    // --- Core Paste & Save Logic ---
    rawTextArea.addEventListener('paste', (e) => {
        // Animation temporaire sur la zone de texte
        rawTextArea.style.boxShadow = '0 0 0 5px var(--primary-color)';
        setTimeout(() => {
            rawTextArea.style.boxShadow = ''; // Laisser la transition CSS reprendre le contrôle
        }, 300);

        // Allow the pasted text to populate the textarea before we read it
        setTimeout(() => {
            const rawText = rawTextArea.value;
            if (!rawText.trim()) return;

            handleDataProcessing(rawText);
        }, 0);
    });

    function handleDataProcessing(rawText) {
        try {
            const parsedResult = parsePortalData(rawText);
            
            if (!parsedResult.nom || !parsedResult.etapeData) {
                alert("Erreur d'analyse : Le nom ou le numéro d'étape n'a pas été trouvé. Assurez-vous d'avoir bien copié toute la page du portail.");
                rawTextArea.value = ''; // Clear the textarea for another attempt
                return;
            }

            // Get existing data or create a new object
            let existingData = JSON.parse(localStorage.getItem('mbsData')) || {};

            // Create user ID if it doesn't exist
            if (!existingData.user_random) {
                existingData.user_random = 'user-' + Date.now().toString(36) + Math.random().toString(36).substring(2);
            }
            
            // Overwrite data for the specific etape
            const updatedData = {
                ...existingData,
                valid: true, // Mark data as valid
                nom: parsedResult.nom,
                [parsedResult.etapeKey]: parsedResult.etapeData,
            };

            // ---- START: HISTORY TRACKING LOGIC (for improve.html) ----
            const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
            
            function getNumericGrade(result) {
                if (!result) return null;
                const trimmed = result.trim();
                if (gradeMap[trimmed]) return gradeMap[trimmed];
                const scoreMatch = trimmed.match(/(\d+[,.]?\d*)\s*\/\s*(\d+[,.]?\d*)/);
                if (scoreMatch) {
                    const score = parseFloat(scoreMatch[1].replace(',', '.'));
                    const max = parseFloat(scoreMatch[2].replace(',', '.'));
                    return (max > 0) ? (score / max) * 100 : null;
                }
                return null;
            }

            let currentTermAverage = 0;
            let totalWeight = 0;
            parsedResult.etapeData.forEach(subject => {
                subject.competencies.forEach(comp => {
                    const compWeightMatch = comp.name.match(/\((\d+)%\)/);
                    if (compWeightMatch) {
                        const compWeight = parseFloat(compWeightMatch[1]);
                        let competencyGrade = 0;
                        let competencyTotalWeight = 0;
                        comp.assignments.forEach(assign => {
                            const grade = getNumericGrade(assign.result);
                            const weight = parseFloat(assign.pond);
                            if (grade !== null && !isNaN(weight) && weight > 0) {
                                competencyGrade += grade * weight;
                                competencyTotalWeight += weight;
                            }
                        });
                        if (competencyTotalWeight > 0) {
                            currentTermAverage += (competencyGrade / competencyTotalWeight) * compWeight;
                            totalWeight += compWeight;
                        }
                    }
                });
            });
            
            const finalTermAvg = totalWeight > 0 ? currentTermAverage / totalWeight : null;

            if (finalTermAvg !== null) {
                if (!updatedData.historique) updatedData.historique = {};
                if (!updatedData.historique[parsedResult.etapeKey]) {
                    updatedData.historique[parsedResult.etapeKey] = { timestamps: [], moyennes: [] };
                }
                updatedData.historique[parsedResult.etapeKey].timestamps.push(Date.now());
                updatedData.historique[parsedResult.etapeKey].moyennes.push(finalTermAvg);
            }
            // ---- END: HISTORY TRACKING LOGIC ----


            // Save the updated data
            localStorage.setItem('mbsData', JSON.stringify(updatedData));
            
            // Redirect to the main dashboard
            window.location.href = 'main.html';

        } catch (error) {
            console.error("An error occurred during data processing:", error);
            alert("Une erreur inattendue est survenue. Veuillez réessayer.");
            rawTextArea.value = '';
        }
    }

    // --- Data Parsing Function (from your original code, slightly adapted) ---
    function parsePortalData(text) {
        const nameMatch = text.match(/Photo\s*\n(.+)/);
        const semesterMatch = text.match(/Classe\s*\n\s*(\d)/);
        const nom = nameMatch ? nameMatch[1].trim() : null;
        const etapeNumber = semesterMatch ? semesterMatch[1].trim() : null;
        if (!nom || !etapeNumber) return {};
        const etapeKey = `etape${etapeNumber}`;

        const POND_REGEX = /^\d{1,3}$/;
        const DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;
        const RESULT_REGEX = /^(\d{1,3},\d\s\/\s\d{1,3}\s\(.+\)|[A-DF][+-]?)$/;

        const createNewAssignment = () => ({ textBuffer: [], category: '', work: '', pond: '', assignedDate: '', dueDate: '', result: '' });

        const parseAssignments = (lines) => {
            let assignments = [];
            if (lines.length === 0) return assignments;
            let currentAssignment = createNewAssignment();

            const finalizeAssignment = () => {
                if (currentAssignment.textBuffer.length === 0 && !currentAssignment.pond) return;
                const buffer = currentAssignment.textBuffer;
                if (buffer.length === 1) {
                    currentAssignment.work = buffer[0];
                } else if (buffer.length > 1) {
                    currentAssignment.category = buffer[0];
                    currentAssignment.work = buffer.slice(1).join('<br>');
                }
                delete currentAssignment.textBuffer;
                assignments.push(currentAssignment);
            };

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine.includes('Catégorie\tTravail\tPond.')) continue;

                if (RESULT_REGEX.test(trimmedLine)) {
                    currentAssignment.result = trimmedLine;
                    finalizeAssignment();
                    currentAssignment = createNewAssignment();
                } else if (POND_REGEX.test(trimmedLine)) {
                    currentAssignment.pond = trimmedLine;
                } else if (DATE_REGEX.test(trimmedLine)) {
                    if (!currentAssignment.assignedDate) {
                        currentAssignment.assignedDate = trimmedLine.split('à')[0].trim();
                    }
                    currentAssignment.dueDate = trimmedLine;
                } else {
                    if (currentAssignment.pond || currentAssignment.assignedDate) {
                        finalizeAssignment();
                        currentAssignment = createNewAssignment();
                    }
                    currentAssignment.textBuffer.push(trimmedLine);
                }
            }
            finalizeAssignment();
            return assignments;
        };
        
        const subjects = [];
        const subjectRegex = /([A-Z]{3}\d{3}[A-Z]?) - (.+)/g;
        // Use a non-global regex in match/exec or reset it if reusing
        const subjectsText = text.split(subjectRegex).slice(1);
        
        for (let i = 0; i < subjectsText.length; i += 3) {
            const subjectData = { code: subjectsText[i].trim(), name: subjectsText[i+1].trim(), competencies: [] };
            let subjectContent = subjectsText[i+2] || '';
            const competencyBlocks = subjectContent.split('Compétence - ').slice(1);
            
            for(const block of competencyBlocks) {
                const blockLines = block.trim().split('\n');
                const compName = blockLines.shift();
                const competencyData = {
                    name: `Compétence - ${compName.trim()}`,
                    assignments: parseAssignments(blockLines)
                };
                if (competencyData.assignments.length > 0) {
                    subjectData.competencies.push(competencyData);
                }
            }
            if (subjectData.competencies.length > 0) {
                subjects.push(subjectData);
            }
        }
        return { nom, etapeKey, etapeData: subjects };
    }
});
