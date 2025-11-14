document.addEventListener('DOMContentLoaded', () => {
    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    let mbsData = {};
    let activeChart = null;
    let activeGauges = {};
    let activeWidgetCharts = {}; // To manage histogram/line charts

    const widgetGrid = document.getElementById('widget-grid');
    const detailsModal = document.getElementById('details-modal');
    const historyEditorModal = document.getElementById('history-editor-modal');

    // Make renderWidgets globally accessible for theme changes
    window.renderWidgets = renderWidgets;

    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};
        if (!mbsData.settings) mbsData.settings = {};
        if (!mbsData.settings.objectives) mbsData.settings.objectives = {};
        if (!mbsData.historique) mbsData.historique = {};
        if (!mbsData.valid) {
            widgetGrid.innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée à analyser. Veuillez d'abord <a href="data.html">importer vos données</a>.</p>`;
            return;
        }
        setupEventListeners();
        renderWidgets('generale');
    }

    function setupEventListeners() {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
            document.querySelector('.tab-btn.active').classList.remove('active');
            btn.classList.add('active');
            renderWidgets(btn.dataset.etape);
        }));
        detailsModal.addEventListener('click', e => { if (e.target === detailsModal) closeDetailsModal(); });
        historyEditorModal.addEventListener('click', e => { if (e.target === historyEditorModal) closeHistoryEditorModal(); });
    }

    function updateHistory(historyArray, newValue, maxLength) {
        if (!Array.isArray(historyArray)) historyArray = [];
        if (historyArray.length > 0 && historyArray[historyArray.length - 1].toFixed(2) === newValue.toFixed(2)) {
            return historyArray;
        }
        historyArray.push(newValue);
        while (historyArray.length > maxLength) historyArray.shift();
        return historyArray;
    }

    function getNumericGrade(result) {
        if (!result) return null;
        const trimmed = result.trim();
        if (gradeMap[trimmed]) return gradeMap[trimmed];
        const scoreMatch = trimmed.match(/(\d+[,.]?\d*)\s*\/\s*(\d+[,.]?\d*)/);
        if (scoreMatch) {
            const score = parseFloat(scoreMatch[1].replace(',', '.'));
            const max = parseFloat(scoreMatch[2].replace(',', '.'));
            return max > 0 ? (score / max) * 100 : null;
        }
        return null;
    }

    function calculateAverage(assignments) {
        let totalWeightedGrade = 0;
        let totalWeight = 0;
        assignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            const weight = parseFloat(assign.pond);
            if (grade !== null && !isNaN(weight) && weight > 0) {
                totalWeightedGrade += grade * weight;
                totalWeight += weight;
            }
        });
        return totalWeight > 0 ? { average: totalWeightedGrade / totalWeight, weight: totalWeight } : null;
    }
    
    function calculateSubjectAverage(subject) {
        let totalWeightedCompetencyScore = 0;
        let totalCompetencyWeight = 0;
        subject.competencies.forEach(comp => {
            const compWeightMatch = comp.name.match(/\((\d+)%\)/);
            if (!compWeightMatch) return;
            const competencyWeight = parseFloat(compWeightMatch[1]);
            const competencyResult = calculateAverage(comp.assignments);
            if (competencyResult) {
                totalWeightedCompetencyScore += competencyResult.average * competencyWeight;
                totalCompetencyWeight += competencyWeight;
            }
        });
        return totalCompetencyWeight > 0 ? totalWeightedCompetencyScore / totalCompetencyWeight : null;
    }
    
    function renderWidgets(etapeKey) {
        widgetGrid.innerHTML = '';
        Object.values(activeGauges).forEach(chart => chart.destroy());
        activeGauges = {};
        Object.values(activeWidgetCharts).forEach(chart => chart.destroy());
        activeWidgetCharts = {};

        let subjectsToRender = [];
        if (etapeKey === 'generale') {
            const allSubjects = new Map();
            ['etape1', 'etape2', 'etape3'].forEach(etape => {
                (mbsData[etape] || []).forEach(subject => {
                    if (!allSubjects.has(subject.code)) {
                        allSubjects.set(subject.code, { name: subject.name, competencies: [] });
                    }
                    allSubjects.get(subject.code).competencies.push(...subject.competencies);
                });
            });
            subjectsToRender = Array.from(allSubjects.entries()).map(([code, data]) => ({
                code, name: data.name, competencies: data.competencies,
                average: calculateSubjectAverage({ competencies: data.competencies })
            }));
        } else {
            subjectsToRender = (mbsData[etapeKey] || []).map(subject => ({
                ...subject, average: calculateSubjectAverage(subject)
            }));
        }

        let hasHistoryChanges = false;
        subjectsToRender.forEach(subject => {
            if (subject.average === null) return;
            if (etapeKey !== 'generale') {
                const initialHistory = mbsData.historique[subject.code] ? [...mbsData.historique[subject.code]] : [];
                mbsData.historique[subject.code] = updateHistory(initialHistory, subject.average, 6);
                if (initialHistory.length !== mbsData.historique[subject.code].length) hasHistoryChanges = true;
            }

            const subjectHistory = mbsData.historique[subject.code] || [];
            let trend;
            if (subjectHistory.length < 2) {
                trend = { direction: '▲', change: 'Nouveau', class: 'up' };
            } else {
                const change = subjectHistory[subjectHistory.length - 1] - subjectHistory[subjectHistory.length - 2];
                trend = change < 0 ? { direction: '▼', change: `${change.toFixed(2)}%`, class: 'down' }
                                   : { direction: '▲', change: `+${change.toFixed(2)}%`, class: 'up' };
            }

            const widget = document.createElement('div');
            widget.className = 'subject-widget';
            const safeCode = subject.code.replace(/\s+/g, '');
            const gaugeId = `gauge-${safeCode}-${etapeKey}`;
            const histId = `hist-${safeCode}-${etapeKey}`;
            const lineId = `line-${safeCode}-${etapeKey}`;

            widget.innerHTML = `
                <div class="widget-top-section" data-subject-code="${subject.code}" data-etape-key="${etapeKey}">
                    <div class="widget-info">
                        <h3 class="widget-title">${subject.name}</h3>
                        <p class="widget-average">${subject.average.toFixed(2)}%</p>
                        <div class="widget-trend ${trend.class}">
                            <span>${trend.direction}</span><span>${trend.change}</span>
                        </div>
                    </div>
                    <div class="gauge-container"><canvas id="${gaugeId}"></canvas></div>
                </div>
                <div class="widget-bottom-section">
                    <div class="chart-toggle-header">
                        <button class="icon-btn chart-toggle-btn" data-target-hist="${histId}" data-target-line="${lineId}">
                            <i class="fa-solid fa-chart-column"></i>
                        </button>
                    </div>
                    <div class="chart-container">
                        <canvas id="${histId}"></canvas>
                        <canvas id="${lineId}" style="display:none;"></canvas>
                    </div>
                </div>`;
            
            widget.querySelector('.widget-top-section').addEventListener('click', () => openDetailsModal(subject, etapeKey));
            widgetGrid.appendChild(widget);

            renderGauge(gaugeId, subject.average, mbsData.settings.objectives[subject.code]);
            renderHistogram(histId, subject);
        });

        if (hasHistoryChanges) {
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
        }

        setupChartToggles(subjectsToRender, etapeKey);

        if (!widgetGrid.children.length) {
            widgetGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align:center;">Aucune donnée pour cette période.</p>`;
        }
    }

    function setupChartToggles(subjects, etapeKey) {
        document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const histCanvas = document.getElementById(btn.dataset.targetHist);
                const lineCanvas = document.getElementById(btn.dataset.targetLine);
                const icon = btn.querySelector('i');
                const subjectCode = btn.closest('.subject-widget').querySelector('.widget-top-section').dataset.subjectCode;
                const subject = subjects.find(s => s.code === subjectCode);

                if (lineCanvas.style.display === 'none') {
                    histCanvas.style.display = 'none';
                    lineCanvas.style.display = 'block';
                    icon.classList.replace('fa-chart-column', 'fa-chart-line');
                    if (!activeWidgetCharts[lineCanvas.id]) {
                       renderHistoryChart(lineCanvas.id, subject, etapeKey);
                    }
                } else {
                    lineCanvas.style.display = 'none';
                    histCanvas.style.display = 'block';
                    icon.classList.replace('fa-chart-line', 'fa-chart-column');
                     if (!activeWidgetCharts[histCanvas.id]) {
                       renderHistogram(histCanvas.id, subject);
                    }
                }
            });
        });
    }

    function renderGauge(canvasId, value, goal) {
        // ... (this function remains unchanged)
    }

    function renderHistogram(canvasId, subject) {
        if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const lightColors = ['#e74c3c', '#f39c12', '#a0c800', '#27ae60'];
        const darkColors = ['#ff7675', '#fdcb6e', '#81ecec', '#55efc4'];

        const grades = [];
        subject.competencies.forEach(comp => comp.assignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            if (grade !== null) grades.push(grade);
        }));
        const bins = { 'Echec (<60)': 0, 'C (60-69)': 0, 'B (70-89)': 0, 'A (90+)': 0 };
        grades.forEach(g => {
            if (g < 60) bins['Echec (<60)']++; else if (g < 70) bins['C (60-69)']++;
            else if (g < 90) bins['B (70-89)']++; else bins['A (90+)']++;
        });

        const ctx = document.getElementById(canvasId).getContext('2d');
        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: { labels: Object.keys(bins), datasets: [{ data: Object.values(bins), backgroundColor: isDarkMode ? darkColors : lightColors }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color: isDarkMode ? '#aaa' : '#666' } },
                    x: { ticks: { color: isDarkMode ? '#aaa' : '#666' } }
                },
                plugins: { legend: { display: false }, title: { display: false } }
            }
        });
    }

    function renderHistoryChart(canvasId, subject, etapeKey) {
        if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
        const history = mbsData.historique[subject.code] || [];
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const line_color = 'var(--primary-color)';

        const ctx = document.getElementById(canvasId).getContext('2d');
        const container = ctx.canvas.parentElement;
        container.innerHTML = ''; // Clear previous content (like prompts)
        container.appendChild(ctx.canvas); // Re-add canvas

        if (history.length <= 1 && etapeKey !== 'generale') {
            container.classList.add('clickable');
            const prompt = document.createElement('div');
            prompt.className = 'reconstruct-prompt';
            prompt.innerHTML = `
                <p>Pas assez d'historique.</p>
                <strong>Cliquez pour reconstruire.</strong>`;
            container.appendChild(prompt);
            ctx.canvas.onclick = () => openHistoryEditor(subject, etapeKey);
        } else {
            container.classList.remove('clickable');
            ctx.canvas.onclick = null;
        }

        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map((_, i) => `Update ${i + 1}`),
                datasets: [{
                    label: 'Moyenne',
                    data: history,
                    borderColor: line_color,
                    backgroundColor: 'rgba(41, 128, 185, 0.2)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { min: 40, max: 100, ticks: { color: isDarkMode ? '#aaa' : '#666' } },
                    x: { ticks: { color: isDarkMode ? '#aaa' : '#666' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    function openHistoryEditor(subject, etapeKey) {
        let tempHistorySelections = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        let activeStep = 1;
        const allAssignments = subject.competencies.flatMap(c => c.assignments)
                                    .filter(a => parseFloat(a.pond) > 0);

        historyEditorModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Reconstruire l'Historique: ${subject.name}</h2>
                </div>
                <div class="modal-body">
                    <div class="steps-timeline">Oldest &nbsp; <i class="fa-solid fa-arrow-right"></i> &nbsp; Newest</div>
                    <div class="editor-container">
                        <div class="steps-panel">
                            ${[1, 2, 3, 4, 5].map(i => `<button class="step-btn" data-step="${i}">Étape ${i}</button>`).join('')}
                        </div>
                        <div class="assignments-panel">
                            <h4>Sélectionnez les travaux terminés à cette étape :</h4>
                            <div class="assignments-list">
                                ${allAssignments.map((assign, i) => `
                                    <label class="assignment-item">
                                        <input type="checkbox" data-assignment-index="${i}">
                                        <span>${assign.work.replace('<br>', ' ')} (${assign.pond}%)</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="editor-actions">
                        <button id="save-history-btn" class="btn-save">Sauvegarder l'Historique</button>
                    </div>
                </div>
            </div>`;

        const stepButtons = historyEditorModal.querySelectorAll('.step-btn');
        const checkboxes = historyEditorModal.querySelectorAll('.assignments-list input');

        function updateUI() {
            stepButtons.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.step) === activeStep));
            const selectedForThisStep = tempHistorySelections[activeStep];
            checkboxes.forEach(cb => {
                cb.checked = selectedForThisStep.includes(parseInt(cb.dataset.assignmentIndex));
            });
        }

        stepButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                activeStep = parseInt(btn.dataset.step);
                updateUI();
            });
        });

        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const index = parseInt(cb.dataset.assignmentIndex);
                if (cb.checked) {
                    if (!tempHistorySelections[activeStep].includes(index)) {
                        tempHistorySelections[activeStep].push(index);
                    }
                } else {
                    tempHistorySelections[activeStep] = tempHistorySelections[activeStep].filter(i => i !== index);
                }
            });
        });

        historyEditorModal.querySelector('#save-history-btn').addEventListener('click', () => {
            const newHistory = [];
            for (let i = 1; i <= 5; i++) {
                const assignmentIndices = tempHistorySelections[i];
                if (assignmentIndices.length > 0) {
                    const assignmentsForStep = assignmentIndices.map(idx => allAssignments[idx]);
                    const result = calculateAverage(assignmentsForStep);
                    if (result) newHistory.push(result.average);
                }
            }
            mbsData.historique[subject.code] = newHistory;
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            closeHistoryEditorModal();
            renderWidgets(etapeKey);
        });
        
        historyEditorModal.classList.add('active');
        updateUI();
    }
    
    function closeHistoryEditorModal() {
        historyEditorModal.classList.remove('active');
    }

    // --- All other functions (openDetailsModal, calculate, etc.) remain the same ---
    // Make sure they are included here from your previous code. I will add them for completeness.
    
    function openDetailsModal(subject, etapeKey) {
        const modalContent = document.getElementById('modal-content');
        modalContent.parentElement.classList.add('active'); // show modal
        // ... (rest of the function is the same as before)
    }

    function closeDetailsModal() { detailsModal.classList.remove('active'); }

    // Paste the rest of your unchanged functions here...
    // createOrUpdateChart, setupGoalFramework, setupIntraSubjectCalculator, etc.

    init();
});
