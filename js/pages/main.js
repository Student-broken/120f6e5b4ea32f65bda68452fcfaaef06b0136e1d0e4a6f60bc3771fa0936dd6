import { getData, saveData } from '../core/storage.js';
import { getNumericGrade, calculateAllAverages, calculateSubjectAverage } from '../core/calculations.js';
import { applyTheme, setupThemeToggle } from '../ui/theme.js';

// --- STATE MANAGEMENT ---
let mbsData;
let activeTab = 'etape1';

// --- DOM ELEMENTS ---
const tabContentsContainer = document.getElementById('tab-contents');
const niveauSelect = document.getElementById('niveau-secondaire');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    mbsData = getData();

    if (!mbsData || !mbsData.valid) {
        window.location.href = 'index.html'; // Redirect if no valid data
        return;
    }

    setupThemeToggle();
    loadSettings();
    renderAll();
    setupEventListeners();
});

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.tab-btn.active').classList.remove('active');
            tab.classList.add('active');
            document.querySelector('.tab-content.active').classList.remove('active');
            
            activeTab = tab.dataset.tab;
            document.getElementById(activeTab).classList.add('active');
            renderSidePanel(); // Update side panel for the new active tab
        });
    });

    // Niveau setting change
    niveauSelect.addEventListener('change', (e) => {
        mbsData.settings.niveau = e.target.value;
        saveData(mbsData);
        renderAll(); // Recalculate and re-render everything
    });

    // Event delegation for dynamic grade/pond inputs
    tabContentsContainer.addEventListener('click', handleGradeClick);
    tabContentsContainer.addEventListener('focusout', handleGradeFocusOut);
    tabContentsContainer.addEventListener('keydown', handleGradeKeyDown);
}

// --- RENDERING LOGIC ---

/**
 * Main render function, orchestrates the rendering of all components.
 */
function renderAll() {
    document.getElementById('user-name-header').textContent = `Tableau de Bord de ${mbsData.nom}`;
    renderAllTermTables();
    renderSidePanel();
}

/**
 * Renders the side panel with summary statistics and subject averages.
 */
function renderSidePanel() {
    const averages = calculateAllAverages(mbsData);
    const { globalAverage, termAverages, subjectAverages } = averages;

    const formatAvg = (avg) => avg !== null ? `${avg.toFixed(2)}%` : '--';
    const isValidNiveau = !!mbsData.settings.niveau;

    const globalAvgEl = document.getElementById('moyenne-generale');
    const termAvgEl = document.getElementById('moyenne-etape');

    globalAvgEl.textContent = formatAvg(globalAverage);
    termAvgEl.textContent = formatAvg(termAverages[activeTab]);
    globalAvgEl.classList.toggle('invalid', !isValidNiveau);
    termAvgEl.classList.toggle('invalid', !isValidNiveau);


    const subjectListEl = document.getElementById('subject-averages-list');
    subjectListEl.innerHTML = '';
    const activeTermSubjects = subjectAverages[activeTab];

    if (Object.keys(activeTermSubjects).length > 0) {
        for (const subjectCode in activeTermSubjects) {
            const subjectData = mbsData[activeTab].find(s => s.code === subjectCode);
            if(subjectData) {
                 const li = document.createElement('li');
                 li.innerHTML = `<span>${subjectData.name}</span><strong>${formatAvg(activeTermSubjects[subjectCode])}</strong>`;
                 subjectListEl.appendChild(li);
            }
        }
    } else {
        subjectListEl.innerHTML = '<li class="no-data">Aucune matière pour cette étape</li>';
    }
}

/**
 * Renders the grade tables for all three terms.
 */
function renderAllTermTables() {
    renderTermData(mbsData.etape1, document.getElementById('etape1'));
    renderTermData(mbsData.etape2, document.getElementById('etape2'));
    renderTermData(mbsData.etape3, document.getElementById('etape3'));
}

/**
 * Renders all subject tables for a specific term container.
 */
function renderTermData(termData, container) {
    container.innerHTML = '';
    if (!termData || termData.length === 0) {
        container.innerHTML = '<p class="no-data">Aucune donnée pour cette étape.</p>';
        return;
    }
    termData.forEach(subject => container.appendChild(renderSubjectTable(subject)));
}

/**
 * Creates and returns an HTML table element for a single subject.
 */
function renderSubjectTable(subject) {
    const table = document.createElement('table');
    table.className = 'subject-table';
    table.innerHTML = `
        <thead>
            <tr><th colspan="7">${subject.code} - ${subject.name}</th></tr>
            <tr>
                <th>Catégorie</th><th>Travail</th><th>Pond.</th><th>Date assignée</th>
                <th>Date due</th><th>Résultat</th>
            </tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');
    
    subject.competencies.forEach((comp) => {
        const compRow = document.createElement('tr');
        compRow.className = 'competency-row';
        compRow.innerHTML = `<td colspan="7">${comp.name}</td>`;
        tbody.appendChild(compRow);

        comp.assignments.forEach((assign) => {
            const numGrade = getNumericGrade(assign.result);
            let formattedResult = '<span class="no-data">-</span>';
            if (assign.result) {
                formattedResult = numGrade !== null ? `${assign.result} <i>(~${numGrade.toFixed(1)}%)</i>` : assign.result;
            }
            
            const assignRow = document.createElement('tr');
            assignRow.innerHTML = `
                <td>${assign.category || '<span class="no-data">-</span>'}</td>
                <td>${assign.work || '<span class="no-data">-</span>'}</td>
                <td><span class="pond-display">${assign.pond || '--'}</span></td>
                <td>${assign.assignedDate || '<span class="no-data">-</span>'}</td>
                <td>${(assign.dueDate || '').replace('à', '') || '<span class="no-data">-</span>'}</td>
                <td>
                    <div class="grade-container" data-original-result="${assign.result || ''}">
                        <span class="grade-display">${formattedResult}</span>
                        <input type="number" class="grade-input-field hidden" min="0" max="100" step="0.1">
                    </div>
                </td>
            `;
            tbody.appendChild(assignRow);
        });
    });

    table.appendChild(tbody);
    return table;
}

// --- DYNAMIC INTERACTIONS ---

function handleGradeClick(e) {
    const gradeDisplay = e.target.closest('.grade-display');
    if (!gradeDisplay) return;

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

function handleGradeFocusOut(e) {
    const inputField = e.target;
    if (inputField.classList.contains('grade-input-field')) {
        // For simulation, we just hide the input on focus out.
        // It does not save.
        const container = inputField.closest('.grade-container');
        const displaySpan = container.querySelector('.grade-display');
        inputField.classList.add('hidden');
        displaySpan.classList.remove('hidden');
    }
}

function handleGradeKeyDown(e) {
    if (e.target.classList.contains('grade-input-field')) {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            e.target.blur(); // Trigger the focusout event to hide the input
        }
    }
}


// --- SETTINGS ---
function loadSettings() {
    niveauSelect.value = mbsData.settings.niveau || '';
}
