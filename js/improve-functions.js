document.addEventListener('DOMContentLoaded', () => {
    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    let mbsData = {};
    let activeChart = null;
    let activeGauges = {};
    const activeWidgetCharts = {}; // Store references to histogram/line charts

    const widgetGrid = document.getElementById('widget-grid');
    const detailsModal = document.getElementById('details-modal');

    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};
        // Initialize necessary data structures
        mbsData.settings = mbsData.settings || {};
        mbsData.settings.objectives = mbsData.settings.objectives || {};
        mbsData.settings.chartViewPrefs = mbsData.settings.chartViewPrefs || {};
        mbsData.historique = mbsData.historique || {};
        mbsData.historiqueSelections = mbsData.historiqueSelections || {};
        
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
    }

    function updateHistory(historyArray, newValue, maxLength) {
        if (!Array.isArray(historyArray)) historyArray = [];
        if (historyArray.length > 0 && historyArray[historyArray.length - 1].toFixed(2) === newValue.toFixed(2)) {
            return historyArray;
        }
        historyArray.push(newValue);
        while (historyArray.length > maxLength) {
            historyArray.shift();
        }
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
        Object.values(activeWidgetCharts).forEach(chart => chart.destroy());
        activeGauges = {};
        
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
                if (initialHistory.length !== mbsData.historique[subject.code].length) {
                    hasHistoryChanges = true;
                }
            }

            const subjectHistory = mbsData.historique[subject.code] || [];
            let trend;
            if (subjectHistory.length < 2) {
                trend = { direction: '▲', change: 'Nouveau', class: 'up' };
            } else {
                const [previousAvg, currentAvg] = subjectHistory.slice(-2);
                const change = currentAvg - previousAvg;
                trend = change < 0 
                    ? { direction: '▼', change: `${change.toFixed(2)}%`, class: 'down' }
                    : { direction: '▲', change: `+${change.toFixed(2)}%`, class: 'up' };
            }

            const widget = document.createElement('div');
            widget.className = 'subject-widget';
            const chartCanvasId = `dist-chart-${subject.code.replace(/\s+/g, '')}-${etapeKey}`;
            
            widget.innerHTML = `
                <div class="widget-top-section">
                    <div class="widget-info">
                        <h3 class="widget-title">${subject.name}</h3>
                        <p class="widget-average">${subject.average.toFixed(2)}%</p>
                        <div class="widget-trend ${trend.class}">
                            <span>${trend.direction}</span>
                            <span>${trend.change}</span>
                        </div>
                    </div>
                    <div class="gauge-container"><canvas id="gauge-${chartCanvasId}"></canvas></div>
                </div>
                <div class="widget-chart-controls">
                    <button class="chart-toggle-btn" data-subject-code="${subject.code}" data-canvas-id="${chartCanvasId}"><i class="fa-solid fa-chart-simple"></i> Changer</button>
                </div>
                <div class="histogram-container"><canvas id="${chartCanvasId}"></canvas></div>`;
            
            widget.querySelector('.widget-top-section').addEventListener('click', () => openDetailsModal(subject, etapeKey));
            widgetGrid.appendChild(widget);
            
            renderGauge(`gauge-${chartCanvasId}`, subject.average, mbsData.settings.objectives[subject.code]);
            
            // Render initial chart based on preference or default to histogram
            const preferredView = mbsData.settings.chartViewPrefs[subject.code] || 'histogram';
            if (preferredView === 'line') {
                renderLineGraph(chartCanvasId, subject);
            } else {
                renderHistogram(chartCanvasId, subject);
            }
        });
        
        // Add event listeners for new toggle buttons
        document.querySelectorAll('.chart-toggle-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent modal from opening
                const subjectCode = button.dataset.subjectCode;
                const canvasId = button.dataset.canvasId;
                const subject = subjectsToRender.find(s => s.code === subjectCode);

                // Toggle preference
                const currentView = mbsData.settings.chartViewPrefs[subjectCode] || 'histogram';
                const newView = currentView === 'histogram' ? 'line' : 'histogram';
                mbsData.settings.chartViewPrefs[subjectCode] = newView;
                localStorage.setItem('mbsData', JSON.stringify(mbsData));

                // Re-render chart
                if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
                if (newView === 'line') {
                    renderLineGraph(canvasId, subject);
                } else {
                    renderHistogram(canvasId, subject);
                }
            });
        });

        if (hasHistoryChanges) {
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
        }

        if (!widgetGrid.children.length) {
            widgetGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align:center;">Aucune donnée pour cette période.</p>`;
        }
    }

    function renderGauge(canvasId, value, goal) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 120, 0);
        gradient.addColorStop(0, '#e74c3c');
        gradient.addColorStop(0.6, '#f39c12');
        gradient.addColorStop(1, '#27ae60');
        activeGauges[canvasId] = new Chart(ctx, {
            type: 'doughnut', data: { datasets: [{ data: [100], backgroundColor: [gradient], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, circumference: 180, rotation: -90, cutout: '60%', plugins: { tooltip: { enabled: false } } },
            plugins: [{
                id: 'gaugeNeedleAndLine',
                afterDraw: chart => {
                    const { ctx, chartArea } = chart;
                    const angle = Math.PI + (value / 100) * Math.PI;
                    const cx = chartArea.left + chartArea.width / 2;
                    const cy = chartArea.top + chartArea.height;
                    const needleRadius = chart.getDatasetMeta(0).data[0].outerRadius;
                    ctx.save();
                    ctx.translate(cx, cy); ctx.rotate(angle); ctx.beginPath();
                    ctx.moveTo(0, -5); ctx.lineTo(needleRadius - 10, 0); ctx.lineTo(0, 5);
                    ctx.fillStyle = 'var(--secondary-color)'; ctx.fill();
                    ctx.restore();
                    if (goal) {
                        const goalAngle = Math.PI + (goal / 100) * Math.PI;
                        const innerRadius = chart.getDatasetMeta(0).data[0].innerRadius;
                        ctx.save();
                        ctx.translate(cx, cy); ctx.rotate(goalAngle); ctx.beginPath();
                        ctx.moveTo(innerRadius, 0); ctx.lineTo(needleRadius, 0);
                        ctx.strokeStyle = 'var(--danger-color)'; ctx.lineWidth = 3; ctx.stroke();
                        ctx.restore();
                    }
                }
            }]
        });
    }

    function renderHistogram(canvasId, subject) {
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const colors = isDarkMode
            ? ['#ff5252', '#ff9800', '#cddc39', '#4caf50']
            : ['#e74c3c', '#f39c12', '#a0c800', '#27ae60'];

        const grades = subject.competencies.flatMap(comp => comp.assignments.map(a => getNumericGrade(a.result)).filter(g => g !== null));
        const bins = { 'Echec (<60)': 0, 'C (60-69)': 0, 'B (70-89)': 0, 'A (90+)': 0 };
        grades.forEach(g => {
            if (g < 60) bins['Echec (<60)']++; else if (g < 70) bins['C (60-69)']++;
            else if (g < 90) bins['B (70-89)']++; else bins['A (90+)']++;
        });

        const ctx = document.getElementById(canvasId).getContext('2d');
        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: { labels: Object.keys(bins), datasets: [{ data: Object.values(bins), backgroundColor: colors }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false }, title: { display: true, text: 'Distribution des notes' } }
            }
        });
    }

    function renderLineGraph(canvasId, subject) {
        const history = mbsData.historique[subject.code] || [];
        const data = Array(6).fill(null);
        history.slice(-6).forEach((val, i) => data[i] = val); // Use last 6 values

        const labels = Array.from({ length: 6 }, (_, i) => `Point ${i + 1}`);
        const lineGraphColor = '#3498db';

        const ctx = document.getElementById(canvasId).getContext('2d');
        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Moyenne',
                    data: data,
                    fill: false,
                    borderColor: lineGraphColor,
                    tension: 0.1,
                    pointBackgroundColor: lineGraphColor,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: false, min: Math.min(...history) > 50 ? 50 : 0, max: 100 } },
                plugins: { legend: { display: false }, title: { display: true, text: 'Historique des moyennes' } },
                onClick: (evt) => {
                    const chart = evt.chart;
                    if (chart.getElementsAtEventForMode(evt, 'point', { intersect: true }, true).length > 0) return;
                    openHistoryEditor(subject); // Open editor if clicking on empty space
                }
            }
        });
    }

    function openHistoryEditor(subject) {
        // Find all assignments for this subject across all etapes
        const allAssignments = ['etape1', 'etape2', 'etape3'].flatMap(etapeKey => 
            (mbsData[etapeKey] || [])
                .filter(s => s.code === subject.code)
                .flatMap(s => s.competencies.flatMap(c => c.assignments.map(a => ({...a, compName: c.name}))))
        ).map((a, index) => ({...a, uniqueId: `${subject.code}-${index}`})); // Assign a truly unique ID

        // Create modal element
        const modal = document.createElement('div');
        modal.id = 'history-editor-modal';
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="history-editor-content">
                <div class="history-editor-header">
                    <h3>Éditeur d'historique pour ${subject.name}</h3>
                    <p>Cochez les travaux qui étaient complétés à chaque point de sauvegarde pour reconstruire votre historique.</p>
                </div>
                <div class="history-steps-container">
                    <span class="arrow">Ancien</span>
                    <button class="step-btn" data-step="0">1</button><span class="arrow">→</span>
                    <button class="step-btn" data-step="1">2</button><span class="arrow">→</span>
                    <button class="step-btn" data-step="2">3</button><span class="arrow">→</span>
                    <button class="step-btn" data-step="3">4</button><span class="arrow">→</span>
                    <button class="step-btn" data-step="4">5</button><span class="arrow">→</span>
                    <button class="step-btn" data-step="5">6</button>
                    <span class="arrow">Récent</span>
                </div>
                <div class="assignments-list"></div>
                <div class="history-editor-footer">
                    <button id="close-history-editor" class="btn-secondary">Fermer</button>
                    <button id="save-history-step" class="btn-primary">Calculer et Sauvegarder ce Point</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const assignmentsContainer = modal.querySelector('.assignments-list');
        const stepButtons = modal.querySelectorAll('.step-btn');
        let activeStep = 0;

        const loadStep = (stepIndex) => {
            activeStep = stepIndex;
            stepButtons.forEach(btn => btn.classList.remove('active'));
            stepButtons[stepIndex].classList.add('active');

            const savedSelections = mbsData.historiqueSelections?.[subject.code]?.[stepIndex] || [];
            assignmentsContainer.innerHTML = allAssignments.map(assign => `
                <div class="assignment-item">
                    <input type="checkbox" id="${assign.uniqueId}" data-id="${assign.uniqueId}" ${savedSelections.includes(assign.uniqueId) ? 'checked' : ''}>
                    <label for="${assign.uniqueId}">
                        ${assign.work.replace('<br>', ' ')}
                        <small>(${assign.compName}) - Pondération: ${assign.pond}%</small>
                    </label>
                </div>
            `).join('');
        };

        stepButtons.forEach(btn => btn.addEventListener('click', () => loadStep(parseInt(btn.dataset.step))));

        modal.querySelector('#save-history-step').addEventListener('click', () => {
            const selectedIds = Array.from(assignmentsContainer.querySelectorAll('input:checked')).map(input => input.dataset.id);
            const selectedAssignments = allAssignments.filter(a => selectedIds.includes(a.uniqueId));

            // Group assignments by competency to calculate subject average correctly
            const competenciesForCalc = [];
            const competencyMap = new Map();
            selectedAssignments.forEach(assign => {
                if (!competencyMap.has(assign.compName)) {
                    competencyMap.set(assign.compName, { name: assign.compName, assignments: [] });
                    competenciesForCalc.push(competencyMap.get(assign.compName));
                }
                competencyMap.get(assign.compName).assignments.push(assign);
            });

            const newAverage = calculateSubjectAverage({ competencies: competenciesForCalc });

            // Initialize structures if they don't exist
            if (!mbsData.historique[subject.code]) mbsData.historique[subject.code] = Array(6).fill(null);
            if (!mbsData.historiqueSelections[subject.code]) mbsData.historiqueSelections[subject.code] = Array(6).fill([]);
            
            mbsData.historique[subject.code][activeStep] = newAverage;
            mbsData.historiqueSelections[subject.code][activeStep] = selectedIds;
            
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            
            // Provide feedback
            const saveBtn = modal.querySelector('#save-history-step');
            saveBtn.textContent = `Point ${activeStep + 1} Sauvé! (${newAverage !== null ? newAverage.toFixed(2) : 'N/A'}%)`;
            setTimeout(() => { saveBtn.textContent = 'Calculer et Sauvegarder ce Point'; }, 2000);
        });

        const closeModal = () => {
            modal.remove();
            renderWidgets(document.querySelector('.tab-btn.active').dataset.etape);
        };
        
        modal.querySelector('#close-history-editor').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

        loadStep(0); // Load the first step initially
    }
    
    // --- Omitted functions for brevity (openDetailsModal, closeDetailsModal, createOrUpdateChart, etc.) ---
    // --- Paste your existing functions for these here. They are unchanged. ---

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

    function closeDetailsModal() { detailsModal.classList.remove('active'); }

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
            if (!isNaN(newObjective) && newObjective >= 0 && newObjective <= 100) {
                mbsData.settings.objectives[subject.code] = newObjective;
            } else {
                delete mbsData.settings.objectives[subject.code];
            }
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            saveObjectiveBtn.textContent = 'Sauvé!';
            setTimeout(() => { saveObjectiveBtn.textContent = 'Sauvegarder'; }, 1500);
            renderWidgets(document.querySelector('.tab-btn.active').dataset.etape);
        });
        const calculatorContent = container.querySelector('#calculator-content');
        const hasFutureWork = subject.competencies.some(comp => comp.assignments.some(a => getNumericGrade(a.result) === null && parseFloat(a.pond) > 0));
        if (hasFutureWork) {
            container.querySelector('#objective-label').textContent = 'Objectif pour cette matière :';
            setupIntraSubjectCalculator(subject, calculatorContent, objectiveInput);
        } else {
            container.querySelector('#objective-label').textContent = 'Objectif global :';
            setupInterEtapeCalculator(calculatorContent, etapeKey, objectiveInput);
        }
    }
    
    function setupIntraSubjectCalculator(subject, container, goalInput) {
        container.innerHTML = `<p id="calc-info"></p><div id="goal-result" class="goal-result"></div>`;
        const goalResult = container.querySelector('#goal-result');
        const calcInfo = container.querySelector('#calc-info');
        function calculate() {
            let sumOfWeightedGrades = 0, sumOfCompletedWeights = 0, sumOfFutureWeights = 0, sumOfTotalWeights = 0;
            subject.competencies.forEach(comp => comp.assignments.forEach(assign => {
                const weight = parseFloat(assign.pond);
                if (isNaN(weight) || weight <= 0) return;
                sumOfTotalWeights += weight;
                const grade = getNumericGrade(assign.result);
                if (grade !== null) {
                    sumOfWeightedGrades += grade * weight;
                    sumOfCompletedWeights += weight;
                } else { sumOfFutureWeights += weight; }
            }));
            if (sumOfTotalWeights <= 0) { calcInfo.textContent = 'Aucun travail avec une pondération valide n\'a été trouvé.'; return; }
            const currentAverage = sumOfCompletedWeights > 0 ? (sumOfWeightedGrades / sumOfCompletedWeights) : 0;
            const completedPercentage = (sumOfCompletedWeights / sumOfTotalWeights) * 100;
            calcInfo.innerHTML = `Moyenne actuelle : <strong>${currentAverage.toFixed(2)}%</strong> (sur <strong>${completedPercentage.toFixed(1)}%</strong> de la matière complétée).`;
            const targetAvg = parseFloat(goalInput.value);
            if (isNaN(targetAvg) || targetAvg < 0 || targetAvg > 100) { goalResult.innerHTML = 'Veuillez entrer un objectif entre 0 et 100.'; goalResult.className = 'goal-result danger'; return; }
            const totalPointsNeeded = targetAvg * sumOfTotalWeights;
            const pointsNeededFromFuture = totalPointsNeeded - sumOfWeightedGrades;
            const requiredAvgOnFuture = pointsNeededFromFuture / sumOfFutureWeights;
            let message, resultClass;
            if (requiredAvgOnFuture > 100.01) { message = `Il faudrait <strong>${requiredAvgOnFuture.toFixed(1)}%</strong> sur les travaux restants. Objectif impossible.`; resultClass = 'danger'; }
            else if (requiredAvgOnFuture < 0) { message = `Félicitations ! Objectif déjà atteint.`; resultClass = 'success'; }
            else { message = `Il vous faut une moyenne de <strong>${requiredAvgOnFuture.toFixed(1)}%</strong> sur les travaux restants.`; resultClass = 'warning'; }
            goalResult.innerHTML = message; goalResult.className = `goal-result ${resultClass}`;
        }
        goalInput.addEventListener('input', calculate);
        calculate();
    }

    function setupInterEtapeCalculator(container, currentEtapeKey, goalInput) {
        container.innerHTML = `<p id="calc-info"></p><div id="goal-result" class="goal-result"></div>`;
        const goalResult = container.querySelector('#goal-result');
        const calcInfo = container.querySelector('#calc-info');

        const etapeWeights = { etape1: 0.2, etape2: 0.2, etape3: 0.6 };
        const etapeSequence = ['etape1', 'etape2', 'etape3'];
        let nextEtape = null;
        if(currentEtapeKey === 'etape1') nextEtape = 'etape2';
        if(currentEtapeKey === 'etape2') nextEtape = 'etape3';

        if (!nextEtape || currentEtapeKey === 'generale') {
            calcInfo.innerHTML = 'Toutes les étapes futures sont déjà planifiées ou le contexte est général.';
            goalResult.style.display = 'none';
            return;
        }

        const etapeAverages = {};
        let currentGlobalContribution = 0;
        etapeSequence.forEach(etape => {
            const subjects = mbsData[etape];
            if(subjects) {
                const avg = calculateSubjectAverage({competencies: subjects.flatMap(s => s.competencies)});
                etapeAverages[etape] = avg;
                if(avg !== null && etape !== nextEtape) {
                    currentGlobalContribution += avg * etapeWeights[etape];
                }
            }
        });
        
        calcInfo.innerHTML = `Planifiez votre performance pour l'<b>Étape ${nextEtape.slice(-1)}</b>.`;
        
        function calculate() {
            const targetGlobalAvg = parseFloat(goalInput.value);
            if (isNaN(targetGlobalAvg) || targetGlobalAvg < 0 || targetGlobalAvg > 100) { goalResult.innerHTML = 'Veuillez entrer un objectif global valide.'; goalResult.className = 'goal-result danger'; return; }
            const pointsNeededFromFuture = targetGlobalAvg - currentGlobalContribution;
            const requiredAvgInNextEtape = pointsNeededFromFuture / etapeWeights[nextEtape];
            let message, resultClass;
            if (requiredAvgInNextEtape > 100.01) { message = `Pour atteindre <strong>${targetGlobalAvg}%</strong> global, il faudrait <strong>${requiredAvgInNextEtape.toFixed(1)}%</strong> à l'étape ${nextEtape.slice(-1)}. Objectif impossible.`; resultClass = 'danger'; }
            else if (requiredAvgInNextEtape < 0) { message = `Félicitations ! Objectif global déjà atteint.`; resultClass = 'success'; }
            else { message = `Pour atteindre <strong>${targetGlobalAvg}%</strong> global, il vous faut <strong>${requiredAvgInNextEtape.toFixed(1)}%</strong> à l'étape ${nextEtape.slice(-1)}.`; resultClass = 'warning'; }
            goalResult.innerHTML = message; goalResult.className = `goal-result ${resultClass}`;
        }
        goalInput.addEventListener('input', calculate);
        calculate();
    }
    
    init();
});
