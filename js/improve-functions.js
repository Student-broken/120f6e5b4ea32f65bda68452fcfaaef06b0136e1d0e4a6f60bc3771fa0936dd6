document.addEventListener('DOMContentLoaded', () => {
    // --- START: VITAL CHANGES FOR PAGE LIFECYCLE ---
    let listenersAttached = false;
    window.addEventListener('pageshow', () => {
        console.log("Page shown. Reloading data and widgets.");
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
        mbsData.settings = mbsData.settings || {};
        mbsData.settings.objectives = mbsData.settings.objectives || {};
        mbsData.settings.chartViewPrefs = mbsData.settings.chartViewPrefs || {};
        mbsData.settings.historyModes = mbsData.settings.historyModes || {}; // 'average' or 'assignment'

        mbsData.historique = mbsData.historique || {}; // ALWAYS stores average history for trend arrows
        mbsData.assignmentHistory = mbsData.assignmentHistory || {}; // Stores user-defined assignment history for graphs

        mbsData.generalAverageMemory = mbsData.generalAverageMemory || [null, null];
        mbsData.assignmentsSnapshot = mbsData.assignmentsSnapshot || {};

        if (!mbsData.valid) {
            widgetGrid.innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée à analyser. Veuillez d'abord <a href="data.html">importer vos données</a>.</p>`;
            return;
        }

        updateGeneralAverageMemory();

        if (!listenersAttached) {
            setupEventListeners();
            listenersAttached = true;
        }

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
        (subject.competencies || []).forEach(comp => {
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

    function updateAverageHistory(subjectCode) {
        const allCompetencies = ['etape1', 'etape2', 'etape3']
            .flatMap(e => (mbsData[e] || []).filter(s => s.code === subjectCode))
            .flatMap(s => s.competencies);

        if (allCompetencies.length === 0) return false;
        const currentAverage = calculateSubjectAverage({ competencies: allCompetencies });
        if (currentAverage === null) return false;

        let historyArray = mbsData.historique[subjectCode] || [];

        if (historyArray.length === 0) {
            historyArray.push(currentAverage);
            mbsData.historique[subjectCode] = historyArray;
            return true;
        }

        const lastAverage = historyArray[historyArray.length - 1];
        if (Math.abs(currentAverage - lastAverage) < 0.01) {
            return false;
        }

        historyArray.push(currentAverage);
        while (historyArray.length > 5) { historyArray.shift(); }
        mbsData.historique[subjectCode] = historyArray;
        return true;
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
                        allSubjects.set(subject.code, { code: subject.code, name: subject.name, competencies: [] });
                    }
                    allSubjects.get(subject.code).competencies.push(...subject.competencies);
                });
            });
            subjectsToRender = Array.from(allSubjects.values());
            subjectsToRender.forEach(s => s.average = calculateSubjectAverage(s));
        } else {
            subjectsToRender = (mbsData[etapeKey] || []).map(subject => ({ ...subject, average: calculateSubjectAverage(subject) }));
        }

        let needsDataSave = false;
        subjectsToRender.forEach(subject => {
            if (subject.average === null) return;

            if (updateAverageHistory(subject.code)) {
                needsDataSave = true;
            }

            const averageHistory = (mbsData.historique[subject.code] || []).filter(h => h !== null);
            let trend;

            if (averageHistory.length < 2) {
                trend = { direction: '▲', change: '0.00%', class: 'up' };
            } else {
                const currentAvg = averageHistory[averageHistory.length - 1];
                const previousAvg = averageHistory[averageHistory.length - 2];
                const change = currentAvg - previousAvg;
                trend = change < 0 ?
                    { direction: '▼', change: `${change.toFixed(2)}%`, class: 'down' } :
                    { direction: '▲', change: `+${change.toFixed(2)}%`, class: 'up' };
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
                    <button class="chart-toggle-btn" data-subject-code="${subject.code}" data-canvas-id="${chartCanvasId}"><i class="fa-solid fa-edit"></i> Éditer Historique</button>
                </div>
                <div class="histogram-container" style="cursor: pointer;"><canvas id="${chartCanvasId}"></canvas></div>`;

            widget.querySelector('.widget-top-section').addEventListener('click', () => openDetailsModal(subject, etapeKey));
            widgetGrid.appendChild(widget);

            renderGauge(`gauge-${chartCanvasId}`, subject.average, mbsData.settings.objectives[subject.code]);

            const preferredView = mbsData.settings.chartViewPrefs[subject.code] || 'histogram';
            if (preferredView === 'line') {
                renderLineGraph(chartCanvasId, subject);
            } else {
                renderHistogram(chartCanvasId, subject);
            }
        });
        
        const toggleGraphView = (button) => {
            const subjectCode = button.dataset.subjectCode;
            const canvasId = button.dataset.canvasId;
            const subject = subjectsToRender.find(s => s.code === subjectCode);
            if (!subject) return;

            const currentView = mbsData.settings.chartViewPrefs[subjectCode] || 'histogram';
            const newView = currentView === 'histogram' ? 'line' : 'histogram';
            mbsData.settings.chartViewPrefs[subjectCode] = newView;
            localStorage.setItem('mbsData', JSON.stringify(mbsData));

            if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
            if (newView === 'line') {
                renderLineGraph(canvasId, subject);
            } else {
                renderHistogram(canvasId, subject);
            }
        };

        // --- FIX: "Changer" button now opens the editor. ---
        document.querySelectorAll('.chart-toggle-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const subjectCode = button.dataset.subjectCode;
                const subject = subjectsToRender.find(s => s.code === subjectCode);
                if (subject) {
                    openHistoryEditor(subject);
                }
            });
        });

        // --- FIX: Clicking the graph container toggles the view. ---
        document.querySelectorAll('.histogram-container').forEach(container => {
            container.addEventListener('click', (e) => {
                const button = e.currentTarget.closest('.subject-widget').querySelector('.chart-toggle-btn');
                if (button) {
                    toggleGraphView(button);
                }
            });
        });

        if (needsDataSave) {
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
        }

        if (!widgetGrid.children.length) {
            widgetGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align:center;">Aucune donnée pour cette période.</p>`;
        }
    }

    function renderLineGraph(canvasId, subject) {
        const mode = mbsData.settings.historyModes[subject.code] || 'average';
        
        let labels = [];
        let data = [];
        let title = '';

        if (mode === 'average') {
            const history = (mbsData.historique[subject.code] || []).filter(h => h !== null);
            labels = history.map((_, i) => `Point ${i + 1}`);
            data = history;
            title = 'Historique des moyennes';
        } else { // mode === 'assignment'
            const history = (mbsData.assignmentHistory[subject.code] || []).filter(h => h && h.assignmentName && h.grade !== null);
            labels = history.map(h => h.assignmentName);
            data = history.map(h => h.grade);
            title = 'Historique des travaux';
        }

        const ctx = document.getElementById(canvasId).getContext('2d');
        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{ label: 'Note', data, borderColor: '#3498db', pointBackgroundColor: '#3498db', pointRadius: 5 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { suggestedMin: 50, suggestedMax: 100 } },
                plugins: { legend: { display: false }, title: { display: true, text: title } },
                // --- FIX: Clicking the line graph now toggles the view. ---
                onClick: (e) => {
                    const canvas = e.chart.canvas;
                    const button = document.querySelector(`[data-canvas-id="${canvas.id}"]`);
                    if(button) {
                         const subjectCode = button.dataset.subjectCode;
                         const currentView = mbsData.settings.chartViewPrefs[subjectCode] || 'histogram';
                         const newView = currentView === 'histogram' ? 'line' : 'histogram';
                         mbsData.settings.chartViewPrefs[subjectCode] = newView;
                         localStorage.setItem('mbsData', JSON.stringify(mbsData));
                         
                         if (activeWidgetCharts[canvas.id]) activeWidgetCharts[canvas.id].destroy();
                         renderHistogram(canvas.id, subject);
                    }
                }
            }
        });
    }
    
    function openHistoryEditor(subject) {
        const allGradedAssignments = ['etape1', 'etape2', 'etape3']
            .flatMap(etapeKey =>
                (mbsData[etapeKey] || []).filter(s => s.code === subject.code)
                .flatMap(s => s.competencies.flatMap(c => c.assignments))
            )
            .map((a, index) => ({ ...a, uniqueId: `${subject.code}-${index}` }))
            .filter(a => getNumericGrade(a.result) !== null);

        const currentMode = mbsData.settings.historyModes[subject.code] || 'average';

        const modal = document.createElement('div');
        modal.id = 'history-editor-modal';
        modal.className = 'modal-overlay active';

        let editorBodyHTML = '';
        if (currentMode === 'average') {
            const averageHistory = mbsData.historique[subject.code] || [];
            editorBodyHTML = `
                <p>Le mode actuel est <strong>Auto Moyenne</strong>. Le graphique suit l'évolution de votre moyenne générale pour cette matière.</p>
                <p>Pour suivre des travaux spécifiques, passez en mode manuel.</p>
                <div class="history-editor-actions">
                    <button id="switch-to-assignment-mode" class="btn-primary">Passer en Mode Manuel</button>
                </div>
                <div class="history-data-display">
                    <h4>Points de données actuels (Moyennes) :</h4>
                    <ul>${averageHistory.map(avg => `<li>${avg.toFixed(2)}%</li>`).join('') || '<li>Aucune donnée.</li>'}</ul>
                </div>`;
        } else {
            editorBodyHTML = `
                <p>Le mode actuel est <strong>Manuel (par travail)</strong>. Choisissez un travail noté pour chaque point de donnée.</p>
                <div id="data-points-container"></div>
                <div class="history-editor-actions">
                    <button id="add-point-btn" class="btn-secondary">Ajouter un point</button>
                    <button id="reset-to-average-mode" class="btn-danger">Réinitialiser en Mode Auto</button>
                </div>`;
        }

        modal.innerHTML = `
            <div class="history-editor-content">
                <div class="history-editor-header"><h3>Éditeur d'historique pour ${subject.name}</h3><span class="close-btn">&times;</span></div>
                <div class="editor-body">${editorBodyHTML}</div>
                <div class="history-editor-footer">
                    <button id="close-history-editor" class="btn-secondary">Annuler</button>
                    ${currentMode === 'assignment' ? '<button id="save-history-assignments" class="btn-primary">Sauvegarder</button>' : ''}
                </div>
            </div>`;
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.remove();
            renderWidgets(document.querySelector('.tab-btn.active').dataset.etape);
        };
        modal.querySelector('.close-btn').addEventListener('click', closeModal);
        modal.querySelector('#close-history-editor').addEventListener('click', closeModal);

        if (currentMode === 'average') {
            modal.querySelector('#switch-to-assignment-mode').addEventListener('click', () => {
                mbsData.settings.historyModes[subject.code] = 'assignment';
                mbsData.assignmentHistory[subject.code] = allGradedAssignments.slice(0, 5).map(a => ({
                    assignmentId: a.uniqueId,
                    assignmentName: a.work.replace('<br>', ' '),
                    grade: getNumericGrade(a.result)
                }));
                localStorage.setItem('mbsData', JSON.stringify(mbsData));
                modal.remove();
                openHistoryEditor(subject);
            });
        } else {
            let tempHistory = JSON.parse(JSON.stringify(mbsData.assignmentHistory[subject.code] || []));
            const pointsContainer = modal.querySelector('#data-points-container');

            const renderDataPointEditors = () => {
                pointsContainer.innerHTML = tempHistory.map((pointData, i) => {
                    const assignmentOptions = allGradedAssignments.map(a =>
                        `<option value="${a.uniqueId}" ${pointData && pointData.assignmentId === a.uniqueId ? 'selected' : ''}>
                            ${a.work.replace('<br>', ' ')} (${getNumericGrade(a.result).toFixed(1)}%)
                        </option>`
                    ).join('');
                    return `
                        <div class="data-point-editor">
                            <label>Point ${i + 1}:</label>
                            <select data-index="${i}">
                                <option value="">-- Choisissez un travail --</option>
                                ${assignmentOptions}
                            </select>
                            <button class="remove-point-btn" data-index="${i}">&times;</button>
                        </div>`;
                }).join('');
                modal.querySelector('#add-point-btn').disabled = tempHistory.length >= 5;
            };

            pointsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-point-btn')) {
                    const index = parseInt(e.target.dataset.index);
                    tempHistory.splice(index, 1);
                    renderDataPointEditors();
                }
            });

            pointsContainer.addEventListener('change', (e) => {
                if (e.target.tagName === 'SELECT') {
                    const index = parseInt(e.target.dataset.index);
                    const selectedAssignment = allGradedAssignments.find(a => a.uniqueId === e.target.value);
                    if (selectedAssignment) {
                        tempHistory[index] = {
                            assignmentId: selectedAssignment.uniqueId,
                            assignmentName: selectedAssignment.work.replace('<br>', ' '),
                            grade: getNumericGrade(selectedAssignment.result)
                        };
                    } else {
                        // --- FIX: Explicitly set the history point to null when deselected. ---
                        tempHistory[index] = null;
                    }
                }
            });

            modal.querySelector('#add-point-btn').addEventListener('click', () => {
                if (tempHistory.length < 5) {
                    tempHistory.push(null);
                    renderDataPointEditors();
                }
            });

            modal.querySelector('#save-history-assignments').addEventListener('click', () => {
                mbsData.assignmentHistory[subject.code] = tempHistory.filter(h => h !== null);
                localStorage.setItem('mbsData', JSON.stringify(mbsData));
                closeModal();
            });

            modal.querySelector('#reset-to-average-mode').addEventListener('click', () => {
                mbsData.settings.historyModes[subject.code] = 'average';
                delete mbsData.assignmentHistory[subject.code];
                localStorage.setItem('mbsData', JSON.stringify(mbsData));
                closeModal();
            });

            renderDataPointEditors();
        }
    }


    // --- Unchanged Helper Functions (Gauge, Histogram, Modals, Calculators, etc.) ---
    
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
            // ... (rest of function is unchanged)
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

    function openDetailsModal(subject, etapeKey) {
        // ... (function is unchanged)
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
        // ... (function is unchanged)
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
        // ... (function is unchanged)
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
        // ... (function is unchanged)
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
    
    // --- General Average Memory Functions (unchanged) ---

    function calculateOverallAverage(data) {
        let totalWeightedAverage = 0;
        let totalEtapeWeight = 0;
        const etapeWeights = { etape1: 0.2, etape2: 0.2, etape3: 0.6 };
        ['etape1', 'etape2', 'etape3'].forEach(etapeKey => {
            const subjectsInEtape = data[etapeKey] || [];
            if (subjectsInEtape.length > 0) {
                let etapeTotalScore = 0;
                let etapeSubjectCount = 0;
                subjectsInEtape.forEach(subject => {
                    const avg = calculateSubjectAverage(subject);
                    if (avg !== null) {
                        etapeTotalScore += avg;
                        etapeSubjectCount++;
                    }
                });
                if (etapeSubjectCount > 0) {
                    const etapeAverage = etapeTotalScore / etapeSubjectCount;
                    totalWeightedAverage += etapeAverage * etapeWeights[etapeKey];
                    totalEtapeWeight += etapeWeights[etapeKey];
                }
            }
        });
        return totalEtapeWeight > 0 ? totalWeightedAverage / totalEtapeWeight : null;
    }

    function updateGeneralAverageMemory() {
        const currentOverallAverage = calculateOverallAverage(mbsData);
        if (currentOverallAverage === null) return;
        const storedAverage = mbsData.generalAverageMemory[0];
        if (storedAverage === null || Math.abs(currentOverallAverage - storedAverage) > 0.01) {
            console.log("General average has changed. Updating memory and checking assignments.");
            mbsData.generalAverageMemory[1] = storedAverage;
            mbsData.generalAverageMemory[0] = currentOverallAverage;
            checkForAssignmentChanges();
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
        }
    }

    function checkForAssignmentChanges() {
        const oldSnapshot = mbsData.assignmentsSnapshot || {};
        const newSnapshot = {};
        const changedAssignments = [];
        const allAssignments = ['etape1', 'etape2', 'etape3'].flatMap(etapeKey =>
            (mbsData[etapeKey] || []).flatMap(s =>
                s.competencies.flatMap(c =>
                    c.assignments.map((a, index) => ({ ...a, uniqueId: `${s.code}-${c.name}-${a.work.replace(/\s/g, '')}-${index}` }))
                )
            )
        );
        allAssignments.forEach(assign => {
            const oldResult = oldSnapshot[assign.uniqueId];
            const newResult = assign.result;
            if (oldResult !== newResult) {
                if (oldResult !== undefined) {
                    changedAssignments.push({ name: assign.work, subject: assign.uniqueId.split('-')[0], old: oldResult, new: newResult });
                }
            }
            newSnapshot[assign.uniqueId] = newResult;
        });
        if (changedAssignments.length > 0) {
            console.log("Detected changes in assignment grades:", changedAssignments);
        }
        mbsData.assignmentsSnapshot = newSnapshot;
    }
});
