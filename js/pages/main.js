import { getData, saveData, saveSetting } from '../core/storage.js';
import { getNumericGrade } from '../core/calculations.js';
import { renderSubjectTable, populateUnitesModal } from '../ui/render.js';
import { initializeModal } from '../ui/modals.js';

let mbsData;
let activeTab = 'etape1';

document.addEventListener('DOMContentLoaded', () => {
    mbsData = getData();
    
    if (!mbsData.valid) {
        document.getElementById('tab-contents').innerHTML = `
            <p class="no-data">
                Aucune donnée trouvée. Veuillez commencer par mettre à jour vos données.
                <br><br>
                <a href="data.html" class="btn">Mettre à jour les données</a>
            </p>`;
        // Hide side panel content if no data
        document.querySelector('.side-panel').classList.add('hidden');
        return;
    }
    
    loadSettings();
    setupEventListeners();
    renderAll();
});

function loadSettings() {
    const { settings } = mbsData;
    document.getElementById('niveau-secondaire').value = settings.niveau || '';
    document.getElementById('unites-mode').value = settings.unitesMode || 'defaut';
}

function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.tab-btn.active').classList.remove('active');
            tab.classList.add('active');
            document.querySelector('.tab-content.active').classList.remove('active');
            activeTab = tab.dataset.tab;
            document.getElementById(activeTab).classList.add('active');
            renderSidePanel();
        });
    });

    // Settings
    document.getElementById('niveau-secondaire').addEventListener('change', (e) => {
        saveSetting('niveau', e.target.value);
        mbsData = getData(); // Refresh data after saving
        renderAll();
    });

    document.getElementById('unites-mode').addEventListener('change', (e) => {
        saveSetting('unitesMode', e.target.value);
        mbsData = getData();
        populateUnitesModal(mbsData);
    });

    // Modals
    const unitesModal = initializeModal('unites-modal', 'unites-btn', 'close-unites-modal');
    // Add event listener to the modal itself for saving on close
    document.getElementById('unites-modal').addEventListener('click', (e) => {
        if (e.target.id === 'unites-modal') {
            saveCustomUnits();
            unitesModal.close();
            renderAll();
        }
    });

    // Dynamic input logic
    const tabContents = document.getElementById('tab-contents');
    tabContents.addEventListener('input', handleDynamicInput);
    tabContents.addEventListener('click', handleGradeClick);
    tabContents.addEventListener('focusout', handleGradeFocusOut);
    tabContents.addEventListener('keydown', handleGradeKeyDown);
}

function renderAll() {
    renderTermTables();
    renderSidePanel();
}

function renderTermTables() {
    ['etape1', 'etape2', 'etape3'].forEach(etapeKey => {
        const container = document.getElementById(etapeKey);
        const termData = mbsData[etapeKey];
        container.innerHTML = ''; // Clear previous content
        if (!termData || termData.length === 0) {
            container.innerHTML = '<p class="no-data">Aucune donnée pour cette étape.</p>';
            return;
        }
        termData.forEach(subject => container.appendChild(renderSubjectTable(subject)));
    });
}

function renderSidePanel() {
    const averages = calculateAveragesFromDOM();
    const { niveau } = mbsData.settings;
    
    const globalAvgEl = document.getElementById('moyenne-generale');
    const termAvgEl = document.getElementById('moyenne-etape');
    
    globalAvgEl.classList.toggle('invalid', !niveau);
    termAvgEl.classList.toggle('invalid', !niveau);
    
    const formatAvg = (avg) => avg !== null ? `${avg.toFixed(2)}%` : '--';
    
    globalAvgEl.textContent = !niveau ? 'N/A' : formatAvg(averages.globalAverage);
    termAvgEl.textContent = !niveau ? 'N/A' : formatAvg(averages.termAverages[activeTab]);

    const subjectListEl = document.getElementById('subject-averages-list');
    subjectListEl.innerHTML = '';
    const activeTermSubjects = averages.subjectAverages[activeTab];

    if (activeTermSubjects && Object.keys(activeTermSubjects).length > 0) {
        Object.entries(activeTermSubjects).forEach(([code, subj]) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${subj.name}</span><strong>${subj.average !== null ? `<span class="grade-percentage">${subj.average.toFixed(2)}%</span>` : '--'}</strong>`;
            subjectListEl.appendChild(li);
        });
    } else {
        subjectListEl.innerHTML = '<li class="no-data">Aucune matière pour cette étape</li>';
    }
}

// --- DYNAMIC INPUT HANDLERS ---
function handleDynamicInput(e) {
    const target = e.target;
    if (target.classList.contains('pond-input-field')) {
        // Note: Ponderations are NOT saved automatically. A save button could be added.
        // For now, this just provides visual feedback.
        target.classList.add('modified-input');
        renderSidePanel();
    }
    if (target.classList.contains('grade-input-field')) {
        target.classList.add('modified-input');
        renderSidePanel();
    }
}

function handleGradeClick(e) {
    const gradeDisplay = e.target.closest('.grade-display');
    if (gradeDisplay) {
        const container = gradeDisplay.closest('.grade-container');
        const inputField = container.querySelector('.grade-input-field');
        const originalResult = container.dataset.originalResult;
        const numericGrade = getNumericGrade(originalResult);

        gradeDisplay.classList.add('hidden');
        inputField.classList.remove('hidden');
        inputField.value = numericGrade !== null ? numericGrade.toFixed(2) : '';
        inputField.focus();
        inputField.select();
    }
}

function handleGradeFocusOut(e) {
    const inputField = e.target;
    if (inputField.classList.contains('grade-input-field')) {
        if (inputField.value.trim() === '') {
            const container = inputField.closest('.grade-container');
            const displaySpan = container.querySelector('.grade-display');
            inputField.classList.add('hidden');
            displaySpan.classList.remove('hidden');
            inputField.classList.remove('modified-input');
            renderSidePanel();
        }
    }
}

function handleGradeKeyDown(e) {
    if (e.target.classList.contains('grade-input-field')) {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            if (e.key === 'Escape') {
                e.target.value = '';
            }
            e.target.blur(); // Triggers the focusout event
        }
    }
}

// --- UNITS MODAL LOGIC ---
document.getElementById('unites-btn').addEventListener('click', () => {
    populateUnitesModal(mbsData);
});

document.getElementById('close-unites-modal').addEventListener('click', () => {
    saveCustomUnits();
    renderAll();
});

function saveCustomUnits() {
    if (document.getElementById('unites-mode').value !== 'perso') return;
    let customUnites = {};
    document.querySelectorAll('.unite-item input').forEach(input => {
        customUnites[input.dataset.code] = parseFloat(input.value) || 1;
    });
    saveSetting('customUnites', customUnites);
    mbsData = getData(); // Refresh data
}

// --- LIVE AVERAGE CALCULATION FROM DOM ---
function calculateAveragesFromDOM() {
    // This is a simplified version for demonstration. It mirrors the logic
    // from calculations.js but reads directly from the live input fields.
    // A full implementation would be more robust.
    const TERM_WEIGHTS = { etape1: 0.2, etape2: 0.2, etape3: 0.6 };
    const { niveau } = mbsData.settings;
    
    let termAverages = {};
    let subjectAverages = {};

    ['etape1', 'etape2', 'etape3'].forEach(etapeKey => {
        const etapeData = mbsData[etapeKey];
        subjectAverages[etapeKey] = {};
        if (!etapeData || etapeData.length === 0) {
            termAverages[etapeKey] = null;
            return;
        }

        etapeData.forEach(subject => {
            let totalWeightedGrade = 0;
            let totalCompetencyWeight = 0;
            subject.competencies.forEach((comp, compIndex) => {
                const compWeightMatch = comp.name.match(/\((\d+)%\)/);
                if (!compWeightMatch) return;
                const compWeight = parseFloat(compWeightMatch[1]);
                let totalAssignmentGrade = 0;
                let totalAssignmentWeight = 0;
                comp.assignments.forEach((assign, assignIndex) => {
                    const uniqueId = `${subject.code}-${compIndex}-${assignIndex}`;
                    const pondInput = document.querySelector(`.pond-input-field[data-row-id="${uniqueId}"]`);
                    const gradeInput = document.querySelector(`.grade-input-field[data-row-id="${uniqueId}"]`);
                    let grade = null;
                    let weight = parseFloat(pondInput.value) || parseFloat(assign.pond);

                    if (gradeInput && !gradeInput.classList.contains('hidden') && gradeInput.value.trim() !== '') {
                        grade = parseFloat(gradeInput.value);
                    } else {
                        grade = getNumericGrade(assign.result);
                    }

                    if (grade !== null && !isNaN(weight) && weight > 0) {
                        totalAssignmentGrade += grade * weight;
                        totalAssignmentWeight += weight;
                    }
                });
                if (totalAssignmentWeight > 0) {
                    const competencyAverage = totalAssignmentGrade / totalAssignmentWeight;
                    totalWeightedGrade += competencyAverage * compWeight;
                    totalCompetencyWeight += compWeight;
                }
            });
            const subjectAvg = totalCompetencyWeight > 0 ? totalWeightedGrade / totalCompetencyWeight : null;
            subjectAverages[etapeKey][subject.code] = { name: subject.name, average: subjectAvg };
        });

        // Simplified term average for the live view
        let termSum = 0;
        let termCount = 0;
        Object.values(subjectAverages[etapeKey]).forEach(subj => {
            if (subj.average !== null) {
                termSum += subj.average;
                termCount++;
            }
        });
        termAverages[etapeKey] = termCount > 0 ? termSum / termCount : null;
    });

    // Calculate global average
    let globalWeightedSum = 0;
    let totalWeightUsed = 0;
    if (niveau) {
        for (const etapeKey in termAverages) {
            if (termAverages[etapeKey] !== null) {
                globalWeightedSum += termAverages[etapeKey] * TERM_WEIGHTS[etapeKey];
                totalWeightUsed += TERM_WEIGHTS[etapeKey];
            }
        }
    }
    const globalAverage = totalWeightUsed > 0 ? globalWeightedSum / totalWeightUsed : null;

    return { termAverages, globalAverage, subjectAverages };
}
