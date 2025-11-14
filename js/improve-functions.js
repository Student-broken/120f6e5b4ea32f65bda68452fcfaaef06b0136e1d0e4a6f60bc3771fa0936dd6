document.addEventListener('DOMContentLoaded', () => {
    // --- START: Global Variables & Configuration ---
    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    let mbsData = {};
    let activeChart = null; // For the details modal chart
    let activeGauges = {}; // For the main widget gauges
    let activeWidgetCharts = {}; // Manages the swappable histogram/line charts

    const widgetGrid = document.getElementById('widget-grid');
    const detailsModal = document.getElementById('details-modal');
    const historyEditorModal = document.getElementById('history-editor-modal');
    
    // Make renderWidgets globally accessible so the theme switcher can refresh charts
    window.renderWidgets = renderWidgets;
    // --- END: Global Variables & Configuration ---

    /**
     * Main initialization function. Loads data and sets up the page.
     */
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

    /**
     * Sets up primary event listeners for tabs and modals.
     */
    function setupEventListeners() {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
            document.querySelector('.tab-btn.active').classList.remove('active');
            btn.classList.add('active');
            renderWidgets(btn.dataset.etape);
        }));
        detailsModal.addEventListener('click', e => { if (e.target === detailsModal) closeDetailsModal(); });
        historyEditorModal.addEventListener('click', e => { if (e.target === historyEditorModal) closeHistoryEditorModal(); });
    }

    // --- START: Data Calculation & History Management ---
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
        let totalWeightedGrade = 0, totalWeight = 0;
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
        let totalWeightedCompetencyScore = 0, totalCompetencyWeight = 0;
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

    function updateHistory(historyArray, newValue, maxLength) {
        if (!Array.isArray(historyArray)) historyArray = [];
        if (historyArray.length > 0 && historyArray[historyArray.length - 1].toFixed(2) === newValue.toFixed(2)) {
            return historyArray;
        }
        historyArray.push(newValue);
        while (historyArray.length > maxLength) historyArray.shift();
        return historyArray;
    }
    // --- END: Data Calculation & History Management ---


    // --- START: Main Widget Rendering ---
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
                        allSubjects.set(subject.code, { ...subject, competencies: [] });
                    }
                    allSubjects.get(subject.code).competencies.push(...subject.competencies);
                });
            });
            subjectsToRender = Array.from(allSubjects.values()).map(data => ({
                ...data, average: calculateSubjectAverage(data)
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
                trend = change < 0 ? { direction: '▼', change: `${change.toFixed(2)}%`, class: 'down' } : { direction: '▲', change: `+${change.toFixed(2)}%`, class: 'up' };
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
                        <div class="widget-trend ${trend.class}"><span>${trend.direction}</span><span>${trend.change}</span></div>
                    </div>
                    <div class="gauge-container"><canvas id="${gaugeId}"></canvas></div>
                </div>
                <div class="widget-bottom-section">
                    <div class="chart-toggle-header">
                        <button class="icon-btn chart-toggle-btn" title="Changer de vue" data-target-hist="${histId}" data-target-line="${lineId}">
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

        if (hasHistoryChanges) localStorage.setItem('mbsData', JSON.stringify(mbsData));
        
        setupChartToggles(subjectsToRender, etapeKey);

        if (!widgetGrid.children.length) {
            widgetGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align:center;">Aucune donnée pour cette période.</p>`;
        }
    }
    // --- END: Main Widget Rendering ---


    // --- START: Widget Chart Rendering & Toggling ---
    function setupChartToggles(subjects, etapeKey) {
        document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const histCanvas = document.getElementById(btn.dataset.targetHist);
                const lineCanvas = document.getElementById(btn.dataset.targetLine);
                const icon = btn.querySelector('i');
                const subjectCode = btn.closest('.widget-top-section, .subject-widget').querySelector('.widget-top-section').dataset.subjectCode;
                const subject = subjects.find(s => s.code === subjectCode);

                if (lineCanvas.style.display === 'none') {
                    histCanvas.style.display = 'none'; lineCanvas.style.display = 'block';
                    icon.classList.replace('fa-chart-column', 'fa-chart-line');
                    renderHistoryChart(lineCanvas.id, subject, etapeKey);
                } else {
                    lineCanvas.style.display = 'none'; histCanvas.style.display = 'block';
                    icon.classList.replace('fa-chart-line', 'fa-chart-column');
                    renderHistogram(histCanvas.id, subject);
                }
            });
        });
    }

    function renderGauge(canvasId, value, goal) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 120, 0);
        gradient.addColorStop(0, '#e74c3c'); gradient.addColorStop(0.6, '#f39c12'); gradient.addColorStop(1, '#27ae60');
        activeGauges[canvasId] = new Chart(ctx, {
            type: 'doughnut', data: { datasets: [{ data: [100], backgroundColor: [gradient], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, circumference: 180, rotation: -90, cutout: '60%', plugins: { tooltip: { enabled: false } } },
            plugins: [{
                id: 'gaugeNeedleAndLine',
                afterDraw: chart => {
                    const { ctx, chartArea } = chart;
                    const angle = Math.PI + (value / 100) * Math.PI, cx = chartArea.left + chartArea.width / 2, cy = chartArea.top + chartArea.height;
                    const needleRadius = chart.getDatasetMeta(0).data[0].outerRadius;
                    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.beginPath();
                    ctx.moveTo(0, -5); ctx.lineTo(needleRadius - 10, 0); ctx.lineTo(0, 5);
                    ctx.fillStyle = 'var(--secondary-color)'; ctx.fill(); ctx.restore();
                    if (goal) {
                        const goalAngle = Math.PI + (goal / 100) * Math.PI, innerRadius = chart.getDatasetMeta(0).data[0].innerRadius;
                        ctx.save(); ctx.translate(cx, cy); ctx.rotate(goalAngle); ctx.beginPath();
                        ctx.moveTo(innerRadius, 0); ctx.lineTo(needleRadius, 0);
                        ctx.strokeStyle = 'var(--danger-color)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
                    }
                }
            }]
        });
    }

    function renderHistogram(canvasId, subject) {
        if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const colors = isDarkMode ? ['#ff7675', '#fdcb6e', '#81ecec', '#55efc4'] : ['#e74c3c', '#f39c12', '#a0c800', '#27ae60'];
        const textColor = isDarkMode ? '#aaa' : '#666';

        const grades = subject.competencies.flatMap(c => c.assignments).map(a => getNumericGrade(a.result)).filter(g => g !== null);
        const bins = { 'Echec (<60)': 0, 'C (60-69)': 0, 'B (70-89)': 0, 'A (90+)': 0 };
        grades.forEach(g => {
            if (g < 60) bins['Echec (<60)']++; else if (g < 70) bins['C (60-69)']++; else if (g < 90) bins['B (70-89)']++; else bins['A (90+)']++;
        });

        const ctx = document.getElementById(canvasId).getContext('2d');
        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'bar', data: { labels: Object.keys(bins), datasets: [{ data: Object.values(bins), backgroundColor: colors }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: textColor } }, x: { ticks: { color: textColor } } }, plugins: { legend: { display: false } } }
        });
    }

    function renderHistoryChart(canvasId, subject, etapeKey) {
        if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
        const history = mbsData.historique[subject.code] || [];
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDarkMode ? '#aaa' : '#666';
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();

        const ctx = document.getElementById(canvasId).getContext('2d');
        const container = ctx.canvas.parentElement;
        if (container.querySelector('.reconstruct-prompt')) container.querySelector('.reconstruct-prompt').remove(); // Clear old prompt

        if (history.length <= 1 && etapeKey !== 'generale') {
            container.classList.add('clickable');
            const prompt = document.createElement('div');
            prompt.className = 'reconstruct-prompt';
            prompt.innerHTML = `<p>Pas assez d'historique.</p><strong>Cliquez pour reconstruire.</strong>`;
            container.appendChild(prompt);
            ctx.canvas.onclick = () => openHistoryEditor(subject, etapeKey);
        } else {
            container.classList.remove('clickable');
            ctx.canvas.onclick = null;
        }

        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map((_, i) => `T${i + 1}`),
                datasets: [{ data: history, borderColor: primaryColor, backgroundColor: primaryColor + '33', fill: true, tension: 0.3 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 40, max: 100, ticks: { color: textColor } }, x: { ticks: { color: textColor } } }, plugins: { legend: { display: false } } }
        });
    }
    // --- END: Widget Chart Rendering & Toggling ---


    // --- START: History Editor Modal ---
    function openHistoryEditor(subject, etapeKey) {
        let tempHistorySelections = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        let activeStep = 1;
        const allAssignments = subject.competencies.flatMap(c => c.assignments).filter(a => parseFloat(a.pond) > 0);

        historyEditorModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header"><h2 class="modal-title">Reconstruire: ${subject.name}</h2></div>
                <div class="modal-body">
                    <div class="steps-timeline">Oldest &nbsp; <i class="fa-solid fa-arrow-right"></i> &nbsp; Newest</div>
                    <div class="editor-container">
                        <div class="steps-panel">${[1, 2, 3, 4, 5].map(i => `<button class="step-btn" data-step="${i}">Point ${i}</button>`).join('')}</div>
                        <div class="assignments-panel">
                            <h4>Travaux terminés à ce point :</h4>
                            <div class="assignments-list">${allAssignments.map((assign, i) => `
                                <label class="assignment-item">
                                    <input type="checkbox" data-assignment-index="${i}">
                                    <span>${assign.work.replace('<br>', ' ')} (${assign.pond}%)</span>
                                </label>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="editor-actions"><button id="save-history-btn" class="btn-save">Sauvegarder l'Historique</button></div>
                </div>
            </div>`;

        const stepButtons = historyEditorModal.querySelectorAll('.step-btn');
        const checkboxes = historyEditorModal.querySelectorAll('.assignments-list input');

        function updateUI() {
            stepButtons.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.step) === activeStep));
            const selectedForThisStep = tempHistorySelections[activeStep];
            checkboxes.forEach(cb => cb.checked = selectedForThisStep.includes(parseInt(cb.dataset.assignmentIndex)));
        }

        stepButtons.forEach(btn => btn.addEventListener('click', () => { activeStep = parseInt(btn.dataset.step); updateUI(); }));

        checkboxes.forEach(cb => cb.addEventListener('change', () => {
            const index = parseInt(cb.dataset.assignmentIndex);
            if (cb.checked) { if (!tempHistorySelections[activeStep].includes(index)) tempHistorySelections[activeStep].push(index); } 
            else { tempHistorySelections[activeStep] = tempHistorySelections[activeStep].filter(i => i !== index); }
        }));

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
    
    function closeHistoryEditorModal() { historyEditorModal.classList.remove('active'); }
    // --- END: History Editor Modal ---


    // --- START: Details Modal & Calculators ---
    function openDetailsModal(subject, etapeKey) {
        const modalContent = document.getElementById('modal-content');
        modalContent.innerHTML = `
            <div class="modal-header"><h2 class="modal-title">${subject.name} (${subject.code})</h2></div>
            <div class="modal-body">
                <div class="competency-widgets"></div>
                <div class="graph-container" style="display:none;"><canvas id="assignmentsChart"></canvas></div>
                <div class="calculator-container"></div>
            </div>`;
        const competencyContainer = modalContent.querySelector('.competency-widgets');
        const graphContainer = modalContent.querySelector('.graph-container');

        const uniqueCompetencies = new Map();
        subject.competencies.forEach(comp => {
            if (!uniqueCompetencies.has(comp.name)) uniqueCompetencies.set(comp.name, { name: comp.name, assignments: [] });
            uniqueCompetencies.get(comp.name).assignments.push(...comp.assignments);
        });
        const compsForChart = Array.from(uniqueCompetencies.values());

        compsForChart.forEach((comp, index) => {
            const compResult = calculateAverage(comp.assignments);
            if (!compResult) return;
            const compWidget = document.createElement('div');
            compWidget.className = 'comp-widget'; compWidget.dataset.index = index;
            compWidget.innerHTML = `<h4>${comp.name}</h4><div class="avg">${compResult.average.toFixed(1)}%</div>`;
            competencyContainer.appendChild(compWidget);
        });

        if (competencyContainer.children.length > 0) {
            graphContainer.style.display = 'block';
            createOrUpdateChart(compsForChart[0]);
            competencyContainer.children[0].classList.add('active');
        }

        competencyContainer.querySelectorAll('.comp-widget').forEach(widget => {
            widget.addEventListener('click', () => {
                competencyContainer.querySelector('.active')?.classList.remove('active');
                widget.classList.add('active');
                createOrUpdateChart(compsForChart[widget.dataset.index]);
            });
        });

        setupGoalFramework(subject, modalContent.querySelector('.calculator-container'), etapeKey);
        detailsModal.classList.add('active');
    }

    function closeDetailsModal() { detailsModal.classList.remove('active'); if(activeChart) activeChart.destroy(); }

    function createOrUpdateChart(competency) {
        if(activeChart) activeChart.destroy();
        const ctx = document.getElementById('assignmentsChart').getContext('2d');
        const gradedAssignments = competency.assignments.filter(a => getNumericGrade(a.result) !== null);
        activeChart = new Chart(ctx, {
            type: 'bar', data: { labels: gradedAssignments.map(a => a.work.replace('<br>', ' ')), datasets: [{ data: gradedAssignments.map(a => getNumericGrade(a.result)), backgroundColor: 'rgba(41, 128, 185, 0.6)' }] },
            options: { scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
        });
    }

    function setupGoalFramework(subject, container, etapeKey) {
        const currentObjective = mbsData.settings.objectives[subject.code] || '';
        container.innerHTML = `
            <h3>Planificateur d'Objectifs</h3>
            <div class="goal-input">
                <label for="objective-input" id="objective-label">Objectif :</label>
                <input type="number" id="objective-input" min="0" max="100" value="${currentObjective}">%
                <button id="save-objective-btn" class="btn-save">Sauvegarder</button>
            </div>
            <div id="calculator-content"></div>`;
        const objectiveInput = container.querySelector('#objective-input');
        const saveObjectiveBtn = container.querySelector('#save-objective-btn');
        saveObjectiveBtn.addEventListener('click', () => {
            const newObjective = parseFloat(objectiveInput.value);
            if (!isNaN(newObjective) && newObjective >= 0 && newObjective <= 100) { mbsData.settings.objectives[subject.code] = newObjective; } 
            else { delete mbsData.settings.objectives[subject.code]; }
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            saveObjectiveBtn.textContent = 'Sauvé!';
            setTimeout(() => { saveObjectiveBtn.textContent = 'Sauvegarder'; }, 1500);
            renderWidgets(document.querySelector('.tab-btn.active').dataset.etape);
        });

        const hasFutureWork = subject.competencies.some(c => c.assignments.some(a => getNumericGrade(a.result) === null && parseFloat(a.pond) > 0));
        if (hasFutureWork) {
            container.querySelector('#objective-label').textContent = 'Objectif pour cette matière :';
            setupIntraSubjectCalculator(subject, container.querySelector('#calculator-content'), objectiveInput);
        } else {
            container.querySelector('#objective-label').textContent = 'Objectif global :';
            // Placeholder or future inter-subject calculator
        }
    }
    
    function setupIntraSubjectCalculator(subject, container, goalInput) {
        container.innerHTML = `<p id="calc-info"></p><div id="goal-result" class="goal-result"></div>`;
        const goalResult = container.querySelector('#goal-result');
        const calcInfo = container.querySelector('#calc-info');
        
        function calculate() {
            let sumWGrades = 0, sumCompW = 0, sumFutW = 0, sumTotalW = 0;
            subject.competencies.forEach(c => c.assignments.forEach(a => {
                const weight = parseFloat(a.pond);
                if (isNaN(weight) || weight <= 0) return;
                sumTotalW += weight;
                const grade = getNumericGrade(a.result);
                if (grade !== null) { sumWGrades += grade * weight; sumCompW += weight; } 
                else { sumFutW += weight; }
            }));

            if (sumTotalW <= 0) { calcInfo.textContent = 'Aucun travail avec une pondération valide.'; return; }
            
            const currentAvg = sumCompW > 0 ? (sumWGrades / sumCompW) : 0;
            calcInfo.innerHTML = `Moyenne actuelle : <strong>${currentAvg.toFixed(2)}%</strong> (<strong>${((sumCompW / sumTotalW) * 100).toFixed(1)}%</strong> complété).`;
            
            const targetAvg = parseFloat(goalInput.value);
            if (isNaN(targetAvg) || targetAvg < 0 || targetAvg > 100) { goalResult.innerHTML = ''; return; }
            
            if (sumFutW <= 0) { goalResult.innerHTML = 'Aucun travail futur pour influencer la note.'; goalResult.className = 'goal-result warning'; return; }

            const requiredAvg = (targetAvg * sumTotalW - sumWGrades) / sumFutW;
            let message, resultClass;
            if (requiredAvg > 100.01) { message = `Il faudrait <strong>${requiredAvg.toFixed(1)}%</strong> sur le reste. Objectif impossible.`; resultClass = 'danger'; }
            else if (requiredAvg < 0) { message = `Félicitations ! Objectif déjà atteint.`; resultClass = 'success'; }
            else { message = `Il vous faut <strong>${requiredAvg.toFixed(1)}%</strong> sur les travaux restants.`; resultClass = 'warning'; }
            goalResult.innerHTML = message; goalResult.className = `goal-result ${resultClass}`;
        }
        goalInput.addEventListener('input', calculate);
        calculate();
    }
    // --- END: Details Modal & Calculators ---

    // --- Let's Go! ---
    init();
});
