document.addEventListener('DOMContentLoaded', () => {
    // --- START: VITAL CHANGES FOR PAGE LIFECYCLE ---
    let listenersAttached = false; 
    window.addEventListener('pageshow', function (event) {
        console.log("Page shown. Reloading widgets to get fresh data.");
        init();
    });
    // --- END: VITAL CHANGES ---

    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    let mbsData = {};
    let activeChart = null;
    let activeGauges = {};
    const activeWidgetCharts = {};

    const widgetGrid = document.getElementById('widget-grid');
    const detailsModal = document.getElementById('details-modal');

    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};
        // Initialize new data structures for improved functionality
        mbsData.settings = mbsData.settings || {};
        mbsData.settings.objectives = mbsData.settings.objectives || {};
        mbsData.settings.chartViewPrefs = mbsData.settings.chartViewPrefs || {};
        mbsData.historique = mbsData.historique || {};
        mbsData.generalAverageHistory = mbsData.generalAverageHistory || []; // [current, previous]
        mbsData.assignmentSnapshot = mbsData.assignmentSnapshot || {}; // For tracking individual grade changes

        if (!mbsData.valid) {
            widgetGrid.innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée à analyser. Veuillez d'abord <a href="data.html">importer vos données</a>.</p>`;
            return;
        }

        if (!listenersAttached) {
            setupEventListeners();
            listenersAttached = true;
        }

        renderWidgets(document.querySelector('.tab-btn.active')?.dataset.etape || 'generale');
    }

    function setupEventListeners() {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
            document.querySelector('.tab-btn.active').classList.remove('active');
            btn.classList.add('active');
            renderWidgets(btn.dataset.etape);
        }));
        detailsModal.addEventListener('click', e => { if (e.target === detailsModal) closeDetailsModal(); });
    }

    // --- UTILITY & CALCULATION FUNCTIONS ---

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
    
    function calculateOverallAverage() {
        // Assuming etape weights for a final grade calculation.
        const etapeWeights = { etape1: 0.2, etape2: 0.2, etape3: 0.6 };
        let totalWeightedAverage = 0;
        let totalWeightUsed = 0;

        ['etape1', 'etape2', 'etape3'].forEach(etapeKey => {
            if (mbsData[etapeKey] && mbsData[etapeKey].length > 0) {
                const allEtapeCompetencies = mbsData[etapeKey].flatMap(s => s.competencies);
                const etapeAverage = calculateSubjectAverage({ competencies: allEtapeCompetencies });
                if (etapeAverage !== null) {
                    totalWeightedAverage += etapeAverage * etapeWeights[etapeKey];
                    totalWeightUsed += etapeWeights[etapeKey];
                }
            }
        });

        return totalWeightUsed > 0 ? totalWeightedAverage / totalWeightUsed : null;
    }

    // --- NEW: ASSIGNMENT CHANGE DETECTION ---
    function checkAssignmentChanges() {
        const allAssignments = ['etape1', 'etape2', 'etape3']
            .flatMap(etapeKey => mbsData[etapeKey] || [])
            .flatMap(s => s.competencies.flatMap(c => c.assignments))
            .map((a, index) => ({ ...a, uniqueId: `asgn-${index}` }));

        const changedAssignments = [];
        const newSnapshot = {};

        allAssignments.forEach(assign => {
            const currentGrade = getNumericGrade(assign.result);
            newSnapshot[assign.uniqueId] = currentGrade;
            
            const oldGrade = mbsData.assignmentSnapshot[assign.uniqueId];
            if (currentGrade !== oldGrade && (currentGrade !== null || oldGrade !== null)) {
                 changedAssignments.push({
                    name: assign.work,
                    old: oldGrade,
                    new: currentGrade
                });
            }
        });

        if (changedAssignments.length > 0) {
            console.log("Changement de notes détecté :", changedAssignments);
            // In a real application, you might show a notification to the user here.
        }

        mbsData.assignmentSnapshot = newSnapshot; // Update the snapshot
    }

    // --- WIDGET & UI RENDERING ---

    function renderWidgets(etapeKey) {
        widgetGrid.innerHTML = '';
        Object.values(activeGauges).forEach(chart => chart.destroy());
        Object.values(activeWidgetCharts).forEach(chart => chart.destroy());
        activeGauges = {};
        
        let needsDataSave = false;

        // --- NEW: General Average Widget Logic ---
        if (etapeKey === 'generale') {
            const newOverallAverage = calculateOverallAverage();
            
            if (newOverallAverage !== null) {
                const latestStored = mbsData.generalAverageHistory[0];
                
                if (latestStored === undefined || latestStored?.toFixed(4) !== newOverallAverage.toFixed(4)) {
                    // Average is new or has changed, update history
                    const oldAverage = latestStored;
                    mbsData.generalAverageHistory = [newOverallAverage, oldAverage].filter(v => v !== undefined);
                    needsDataSave = true;
                    // Since average changed, check for specific assignment changes
                    checkAssignmentChanges();
                }
                
                renderOverallAverageWidget(mbsData.generalAverageHistory);
            }
        }
        
        let subjectsToRender = [];
        if (etapeKey === 'generale') {
            const allSubjects = new Map();
            ['etape1', 'etape2', 'etape3'].forEach(etape => {
                (mbsData[etape] || []).forEach(subject => {
                    if (!allSubjects.has(subject.code)) allSubjects.set(subject.code, { name: subject.name, competencies: [] });
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

        subjectsToRender.forEach(subject => {
            if (subject.average === null) return;

            // Update subject-specific history (only for etape views)
            if (etapeKey !== 'generale' && mbsData.historique[subject.code]) {
                const lastHistoryPoint = mbsData.historique[subject.code].slice(-1)[0];
                if (lastHistoryPoint?.toFixed(2) !== subject.average.toFixed(2)) {
                    mbsData.historique[subject.code].push(subject.average);
                    needsDataSave = true;
                }
            }

            const subjectHistory = (mbsData.historique[subject.code] || []).filter(h => h !== null);
            let trend;
            if (subjectHistory.length < 2) {
                trend = { direction: '▲', change: '0.00%', class: 'up' };
            } else {
                const change = subjectHistory[subjectHistory.length - 1] - subjectHistory[subjectHistory.length - 2];
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
                        <div class="widget-trend ${trend.class}"><span>${trend.direction}</span><span>${trend.change}</span></div>
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
            
            const preferredView = mbsData.settings.chartViewPrefs[subject.code] || 'histogram';
            if (preferredView === 'line') renderLineGraph(chartCanvasId, subject);
            else renderHistogram(chartCanvasId, subject);
        });
        
        document.querySelectorAll('.chart-toggle-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const subjectCode = button.dataset.subjectCode;
                const canvasId = button.dataset.canvasId;
                const subject = subjectsToRender.find(s => s.code === subjectCode);

                const currentView = mbsData.settings.chartViewPrefs[subjectCode] || 'histogram';
                const newView = currentView === 'histogram' ? 'line' : 'histogram';
                mbsData.settings.chartViewPrefs[subjectCode] = newView;
                needsDataSave = true;

                if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
                if (newView === 'line') renderLineGraph(canvasId, subject);
                else renderHistogram(canvasId, subject);
            });
        });

        if (needsDataSave) {
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
        }

        if (!widgetGrid.children.length) {
            widgetGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align:center;">Aucune donnée pour cette période.</p>`;
        }
    }

    function renderOverallAverageWidget(history) {
        const [current, previous] = history;
        let trend = { direction: '▲', change: '0.00%', class: 'up' }; // Default for no previous data

        if (current !== undefined && previous !== undefined) {
            const change = current - previous;
             trend = change < 0 
                ? { direction: '▼', change: `${change.toFixed(2)}%`, class: 'down' }
                : { direction: '▲', change: `+${change.toFixed(2)}%`, class: 'up' };
        }
        
        const widget = document.createElement('div');
        widget.className = 'subject-widget overall-average-widget'; // Special class for styling
        widget.innerHTML = `
            <div class="widget-top-section">
                <div class="widget-info">
                    <h3 class="widget-title">Moyenne Générale Pondérée</h3>
                    <p class="widget-average">${current.toFixed(2)}%</p>
                    <div class="widget-trend ${trend.class}">
                        <span>${trend.direction}</span>
                        <span>${trend.change}</span>
                    </div>
                </div>
                <div class="gauge-container"><canvas id="gauge-overall"></canvas></div>
            </div>`;
        widgetGrid.appendChild(widget);
        renderGauge(`gauge-overall`, current);
    }
    
    // --- REWRITTEN AND FIXED HISTORY EDITOR ---
    function openHistoryEditor(subject) {
        const allAssignments = ['etape1', 'etape2', 'etape3'].flatMap(etapeKey => 
            (mbsData[etapeKey] || []).filter(s => s.code === subject.code)
            .flatMap(s => s.competencies.flatMap(c => c.assignments.map(a => ({...a, compName: c.name}))))
        ).map((a, index) => ({...a, uniqueId: `${subject.code}-${index}`}));

        const gradedAssignments = allAssignments.filter(a => getNumericGrade(a.result) !== null);

        // Determine if this is the first time the user edits this subject's history.
        const isFirstEdit = !mbsData.historique[subject.code] || mbsData.historique[subject.code].length === 0;

        let numSteps;
        if (isFirstEdit) {
            numSteps = 2; // Provide 2 data points for a new user: current state and one for the future.
        } else {
            numSteps = Math.max(gradedAssignments.length, mbsData.historique[subject.code].length);
        }
        
        const modal = document.createElement('div');
        modal.id = 'history-editor-modal';
        modal.className = 'modal-overlay active';
        
        let stepButtonsHTML = Array.from({ length: numSteps }, (_, i) => 
            `<button class="step-btn" data-step="${i}">${i + 1}</button>`
        ).join('<span class="arrow">→</span>');

        modal.innerHTML = `
            <div class="history-editor-content">
                <div class="history-editor-header">
                    <h3>Éditeur d'historique pour ${subject.name}</h3>
                    <p>Chaque point représente un moment. Cochez les travaux complétés à ce moment pour calculer la moyenne.</p>
                </div>
                <div class="history-steps-container"><span class="arrow">Ancien</span>${stepButtonsHTML}<span class="arrow">Récent</span></div>
                <div class="assignments-list"></div>
                <div class="history-editor-footer">
                    <button id="close-history-editor" class="btn-secondary">Annuler</button>
                    <button id="save-history-all" class="btn-primary">Sauvegarder l'Historique</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const assignmentsContainer = modal.querySelector('.assignments-list');
        const stepButtons = modal.querySelectorAll('.step-btn');
        let activeStep = 0;

        // State Management: Array of Sets, each holding assignment uniqueIDs for a step.
        let historyStepSelections = Array.from({ length: numSteps }, () => new Set());
        
        if (isFirstEdit) {
            // For first-time users, automatically check all graded assignments for the first data point.
            // The second data point is left empty for future use.
            gradedAssignments.forEach(assign => historyStepSelections[0].add(assign.uniqueId));
        } else {
            // This is a simplification. A more robust solution would be to save the selections themselves.
            // For now, we recreate a plausible history based on chronological additions.
            for (let i = 0; i < gradedAssignments.length; i++) {
                if (historyStepSelections[i]) {
                    for (let j = 0; j <= i; j++) {
                        historyStepSelections[i].add(gradedAssignments[j].uniqueId);
                    }
                }
            }
        }
        
        const loadStep = (stepIndex) => {
            activeStep = stepIndex;
            stepButtons.forEach(btn => btn.classList.remove('active'));
            stepButtons[stepIndex].classList.add('active');
            
            const currentSelections = historyStepSelections[activeStep];
            
            assignmentsContainer.innerHTML = allAssignments.map(assign => {
                const isChecked = currentSelections.has(assign.uniqueId);
                return `
                <div class="assignment-item">
                    <input type="checkbox" id="${assign.uniqueId}-${stepIndex}" data-id="${assign.uniqueId}" ${isChecked ? 'checked' : ''}>
                    <label for="${assign.uniqueId}-${stepIndex}">
                        ${assign.work.replace('<br>', ' ')}
                        <small>Note: ${assign.result || 'N/A'} | Pondération: ${assign.pond}%</small>
                    </label>
                </div>`;
            }).join('');

            assignmentsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    const id = checkbox.dataset.id;
                    if (checkbox.checked) historyStepSelections[activeStep].add(id);
                    else historyStepSelections[activeStep].delete(id);
                });
            });
        };

        stepButtons.forEach(btn => btn.addEventListener('click', () => loadStep(parseInt(btn.dataset.step))));
        
        const closeModal = () => {
            modal.remove();
            renderWidgets(document.querySelector('.tab-btn.active').dataset.etape);
        };
        
        modal.querySelector('#save-history-all').addEventListener('click', () => {
            const newHistory = [];
            historyStepSelections.forEach(stepSelections => {
                if (stepSelections.size > 0) {
                    const assignmentsForStep = allAssignments.filter(a => stepSelections.has(a.uniqueId));
                    const competenciesForCalc = new Map();
                    assignmentsForStep.forEach(assign => {
                        if (!competenciesForCalc.has(assign.compName)) {
                            competenciesForCalc.set(assign.compName, { name: assign.compName, assignments: [] });
                        }
                        competenciesForCalc.get(assign.compName).assignments.push(assign);
                    });
                    const newAverage = calculateSubjectAverage({ competencies: Array.from(competenciesForCalc.values()) });
                    newHistory.push(newAverage);
                }
            });
            
            mbsData.historique[subject.code] = newHistory.filter(h => h !== null);
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            closeModal();
        });

        modal.querySelector('#close-history-editor').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

        loadStep(isFirstEdit ? 0 : numSteps - 1);
    }

    // --- CHARTING & MODAL FUNCTIONS (Largely unchanged, but included for completeness) ---
    
    function renderGauge(canvasId, value, goal) {
        const canvas = document.getElementById(canvasId);
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
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
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false }, title: { display: true, text: 'Distribution des notes' } } }
        });
    }

    function renderLineGraph(canvasId, subject) {
        // The graph menu is now empty by default; history is built via the editor.
        const history = (mbsData.historique[subject.code] || []).filter(h => h !== null);
        const labels = history.map((_, i) => `Point ${i + 1}`);
        const lineGraphColor = '#3498db';
        const ctx = document.getElementById(canvasId).getContext('2d');
        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{ label: 'Moyenne', data: history, borderColor: lineGraphColor, pointBackgroundColor: lineGraphColor, pointRadius: 5 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false, min: history.length > 0 ? Math.min(...history) > 50 ? 50 : 0 : 0, max: 100 } }, plugins: { legend: { display: false }, title: { display: true, text: 'Historique des moyennes' } }, onClick: () => openHistoryEditor(subject) }
        });
    }
    
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
        let currentGlobalContribution = 0;
        etapeSequence.forEach(etape => {
            const subjects = mbsData[etape];
            if(subjects) {
                const avg = calculateSubjectAverage({competencies: subjects.flatMap(s => s.competencies)});
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
});
