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
        mbsData.historique = mbsData.historique || {};
        
        // --- NEW: Data structures for the new history system ---
        mbsData.settings.historyModes = mbsData.settings.historyModes || {}; // 'auto-average' or 'auto-assignment'
        mbsData.historyCustomSelections = mbsData.historyCustomSelections || {}; // Stores user's selected assignments
        mbsData.generalAverageMemory = mbsData.generalAverageMemory || [null, null]; // [latest, previous]
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

    function calculateOverallAverage(data) {
        let totalWeightedAverage = 0, totalEtapeWeight = 0;
        const etapeWeights = { etape1: 0.2, etape2: 0.2, etape3: 0.6 };
        ['etape1', 'etape2', 'etape3'].forEach(etapeKey => {
            const subjectsInEtape = data[etapeKey] || [];
            if (subjectsInEtape.length > 0) {
                let etapeTotalScore = 0, etapeSubjectCount = 0;
                subjectsInEtape.forEach(subject => {
                    const avg = calculateSubjectAverage(subject);
                    if (avg !== null) { etapeTotalScore += avg; etapeSubjectCount++; }
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
            (mbsData[etapeKey] || []).flatMap(s => s.competencies.flatMap(c => c.assignments.map((a, i) => ({ ...a, uniqueId: `${s.code}-${c.name}-${a.work.replace(/\s/g, '')}-${i}` }))))
        );
        allAssignments.forEach(assign => {
            if (oldSnapshot[assign.uniqueId] !== assign.result) {
                if (oldSnapshot[assign.uniqueId] !== undefined) {
                    changedAssignments.push({ name: assign.work, old: oldSnapshot[assign.uniqueId], new: assign.result });
                }
            }
            newSnapshot[assign.uniqueId] = assign.result;
        });
        if (changedAssignments.length > 0) console.log("Detected changes:", changedAssignments);
        mbsData.assignmentsSnapshot = newSnapshot;
    }

    /**
     * --- MODIFIED: Manages a 5-point sliding window for average history. ---
     */
    function updateAverageHistory(historyArray, newValue) {
        if (!Array.isArray(historyArray)) historyArray = [];
        // For first-time users, create the first two data points as requested.
        if (historyArray.length === 0 && newValue !== null) {
             const allGradedAssignments = getAllAssignmentsForSubject(mbsData, mbsData.subjects.find(s => s.average === newValue)?.code)
                .filter(a => getNumericGrade(a.result) !== null);

            const firstPointAverage = calculateSubjectAverage({
                competencies: groupAssignmentsByCompetency(allGradedAssignments)
            });
            // Data point 1: all grades. Data point 2: empty for future.
            historyArray.push(firstPointAverage);
            return { updated: true, history: historyArray };
        }
        if (historyArray.length > 0 && historyArray[historyArray.length - 1]?.toFixed(2) === newValue.toFixed(2)) {
            return { updated: false, history: historyArray };
        }
        historyArray.push(newValue);
        while (historyArray.length > 5) { historyArray.shift(); } // Keep only the last 5 points
        return { updated: true, history: historyArray };
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
        let totalWeightedGrade = 0, totalWeight = 0;
        assignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            const weight = parseFloat(assign.pond);
            if (grade !== null && !isNaN(weight) && weight > 0) {
                totalWeightedGrade += grade * weight; totalWeight += weight;
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

    // --- HELPER: Get all assignments for a subject across all etapes ---
    function getAllAssignmentsForSubject(data, subjectCode) {
        return ['etape1', 'etape2', 'etape3']
            .flatMap(etapeKey => (data[etapeKey] || []).filter(s => s.code === subjectCode))
            .flatMap((s, etapeIndex) => s.competencies.flatMap(c => c.assignments.map((a, i) => ({
                ...a,
                compName: c.name,
                // Create a stable unique ID for each assignment
                uniqueId: `${s.code}-${etapeIndex}-${c.name.replace(/\s/g, '')}-${i}`
            }))));
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
                    if (!allSubjects.has(subject.code)) allSubjects.set(subject.code, { name: subject.name, competencies: [] });
                    allSubjects.get(subject.code).competencies.push(...subject.competencies);
                });
            });
            subjectsToRender = Array.from(allSubjects.entries()).map(([code, data]) => ({
                code, name: data.name, competencies: data.competencies,
                average: calculateSubjectAverage({ competencies: data.competencies })
            }));
        } else {
            subjectsToRender = (mbsData[etapeKey] || []).map(subject => ({ ...subject, average: calculateSubjectAverage(subject) }));
        }

        let needsDataSave = false;
        subjectsToRender.forEach(subject => {
            if (subject.average === null) return;

            // Trend arrows are ALWAYS based on average history, regardless of graph mode.
            const overallSubjectData = { competencies: getAllAssignmentsForSubject(mbsData, subject.code).reduce((acc, assign) => {
                let comp = acc.find(c => c.name === assign.compName);
                if (!comp) { comp = { name: assign.compName, assignments: [] }; acc.push(comp); }
                comp.assignments.push(assign);
                return acc;
            }, []) };
            const overallAverage = calculateSubjectAverage(overallSubjectData);

            if (overallAverage !== null) {
                const historyResult = updateAverageHistory(mbsData.historique[subject.code] || [], overallAverage);
                if (historyResult.updated) {
                    mbsData.historique[subject.code] = historyResult.history;
                    needsDataSave = true;
                }
            }
            
            const subjectHistory = (mbsData.historique[subject.code] || []).filter(h => h !== null);
            let trend = { direction: '▲', change: '0.00%', class: 'up' };
            if (subjectHistory.length >= 2) {
                const change = subjectHistory[subjectHistory.length - 1] - subjectHistory[subjectHistory.length - 2];
                trend = change < 0 ? { direction: '▼', change: `${change.toFixed(2)}%`, class: 'down' }
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
                    <button class="history-edit-btn" data-subject-code="${subject.code}"><i class="fa-solid fa-pen-to-square"></i> Éditer l'historique</button>
                    <small class="chart-swap-hint">Cliquer sur le graphique pour le changer</small>
                </div>
                <div class="chart-container"><canvas id="${chartCanvasId}"></canvas></div>`;
            
            widget.querySelector('.widget-top-section').addEventListener('click', () => openDetailsModal(subject, etapeKey));
            widgetGrid.appendChild(widget);
            
            renderGauge(`gauge-${chartCanvasId}`, subject.average, mbsData.settings.objectives[subject.code]);
            
            const chartCanvas = document.getElementById(chartCanvasId);
            chartCanvas.addEventListener('click', () => toggleChartView(subject.code, chartCanvasId, subject));
            widget.querySelector('.history-edit-btn').addEventListener('click', (e) => { e.stopPropagation(); openHistoryEditor(subject); });

            const preferredView = mbsData.settings.chartViewPrefs[subject.code] || 'histogram';
            renderChartView(preferredView, chartCanvasId, subject);
        });

        if (needsDataSave) localStorage.setItem('mbsData', JSON.stringify(mbsData));
        if (!widgetGrid.children.length) widgetGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align:center;">Aucune donnée pour cette période.</p>`;
    }

    function toggleChartView(subjectCode, canvasId, subject) {
        const currentView = mbsData.settings.chartViewPrefs[subjectCode] || 'histogram';
        const newView = currentView === 'histogram' ? 'line' : 'histogram';
        mbsData.settings.chartViewPrefs[subjectCode] = newView;
        localStorage.setItem('mbsData', JSON.stringify(mbsData));
        renderChartView(newView, canvasId, subject);
    }

    function renderChartView(view, canvasId, subject) {
        if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
        if (view === 'line') {
            renderLineGraph(canvasId, subject);
        } else {
            renderHistogram(canvasId, subject);
        }
    }
    
    // RENDER GAUGE AND HISTOGRAM (Unchanged)
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
                    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.beginPath();
                    ctx.moveTo(0, -5); ctx.lineTo(needleRadius - 10, 0); ctx.lineTo(0, 5);
                    ctx.fillStyle = 'var(--secondary-color)'; ctx.fill(); ctx.restore();
                    if (goal) {
                        const goalAngle = Math.PI + (goal / 100) * Math.PI;
                        const innerRadius = chart.getDatasetMeta(0).data[0].innerRadius;
                        ctx.save(); ctx.translate(cx, cy); ctx.rotate(goalAngle); ctx.beginPath();
                        ctx.moveTo(innerRadius, 0); ctx.lineTo(needleRadius, 0);
                        ctx.strokeStyle = 'var(--danger-color)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
                    }
                }
            }]
        });
    }
    function renderHistogram(canvasId, subject) {
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const colors = isDarkMode ? ['#ff5252', '#ff9800', '#cddc39', '#4caf50'] : ['#e74c3c', '#f39c12', '#a0c800', '#27ae60'];
        const grades = subject.competencies.flatMap(comp => comp.assignments.map(a => getNumericGrade(a.result)).filter(g => g !== null));
        const bins = { 'Echec (<60)': 0, 'C (60-69)': 0, 'B (70-89)': 0, 'A (90+)': 0 };
        grades.forEach(g => {
            if (g < 60) bins['Echec (<60)']++; else if (g < 70) bins['C (60-69)']++;
            else if (g < 90) bins['B (70-89)']++; else bins['A (90+)']++;
        });
        const ctx = document.getElementById(canvasId).getContext('2d');
        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'bar', data: { labels: Object.keys(bins), datasets: [{ data: Object.values(bins), backgroundColor: colors }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false }, title: { display: true, text: 'Distribution des notes' } },
            onClick: () => toggleChartView(subject.code, canvasId, subject) }
        });
    }

    /**
     * --- REWRITTEN LINE GRAPH: Now handles both 'auto-average' and 'auto-assignment' modes ---
     */
    function renderLineGraph(canvasId, subject) {
        const historyMode = mbsData.settings.historyModes[subject.code] || 'auto-average';
        const lineGraphColor = '#3498db';
        const ctx = document.getElementById(canvasId).getContext('2d');
        let chartData, chartTitle;

        if (historyMode === 'auto-assignment') {
            chartTitle = 'Notes des travaux individuels';
            const allGradedAssignments = getAllAssignmentsForSubject(mbsData, subject.code)
                .filter(a => getNumericGrade(a.result) !== null);

            // Automatically include newly graded assignments along with the user's selections
            const userSelections = new Set(mbsData.historyCustomSelections[subject.code] || []);
            const assignmentsToPlot = allGradedAssignments.filter(a => userSelections.has(a.uniqueId));

            // Add any new assignments not in the original selection list, to auto-append them
            allGradedAssignments.forEach(a => {
                if(!assignmentsToPlot.find(p => p.uniqueId === a.uniqueId)){
                    assignmentsToPlot.push(a);
                }
            });

            chartData = {
                labels: assignmentsToPlot.map(a => a.work.replace('<br>', ' ')),
                datasets: [{ label: 'Note', data: assignmentsToPlot.map(a => getNumericGrade(a.result)), borderColor: lineGraphColor, pointBackgroundColor: lineGraphColor, pointRadius: 5 }]
            };
        } else { // Default 'auto-average' mode
            chartTitle = 'Historique des moyennes';
            const history = (mbsData.historique[subject.code] || []).filter(h => h !== null);
            chartData = {
                labels: history.map((_, i) => `Point ${i + 1}`),
                datasets: [{ label: 'Moyenne', data: history, borderColor: lineGraphColor, pointBackgroundColor: lineGraphColor, pointRadius: 5 }]
            };
        }

        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'line', data: chartData,
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: 50, suggestedMax: 100 } },
                plugins: { legend: { display: false }, title: { display: true, text: chartTitle } },
                onClick: (e) => {
                    const chart = e.chart;
                    const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
                    if (points.length) {
                        openHistoryEditor(subject); // Allow click on points to open editor
                    } else {
                        toggleChartView(subject.code, canvasId, subject); // Click on empty space swaps view
                    }
                }
            }
        });
    }

    /**
     * --- REWRITTEN AND SIMPLIFIED HISTORY EDITOR ---
     */
    function openHistoryEditor(subject) {
        const allGradedAssignments = getAllAssignmentsForSubject(mbsData, subject.code)
            .filter(a => getNumericGrade(a.result) !== null);

        if (allGradedAssignments.length < 1) {
            alert("L'éditeur ne peut être utilisé que pour les matières avec au moins un travail noté.");
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'history-editor-modal';
        modal.className = 'modal-overlay active';

        const currentSelections = new Set(mbsData.historyCustomSelections[subject.code] || []);
        // In auto-average mode, pre-select all for the user's convenience
        if (currentSelections.size === 0 && (mbsData.settings.historyModes[subject.code] || 'auto-average') === 'auto-average') {
            allGradedAssignments.forEach(a => currentSelections.add(a.uniqueId));
        }

        const assignmentsHTML = allGradedAssignments.map(assign => {
            const isChecked = currentSelections.has(assign.uniqueId);
            return `
            <div class="assignment-item">
                <input type="checkbox" id="${assign.uniqueId}" data-id="${assign.uniqueId}" ${isChecked ? 'checked' : ''}>
                <label for="${assign.uniqueId}">
                    ${assign.work.replace('<br>', ' ')}
                    <small>Note: ${assign.result || 'N/A'} | Pondération: ${assign.pond}%</small>
                </label>
            </div>`;
        }).join('');

        modal.innerHTML = `
            <div class="history-editor-content">
                <div class="history-editor-header">
                    <h3>Éditeur d'historique pour ${subject.name}</h3>
                    <p>Cochez les travaux que vous souhaitez afficher sur le graphique. Si vous ne cochez rien, le graphique reviendra au mode "moyenne automatique".</p>
                </div>
                <div class="assignments-list">${assignmentsHTML}</div>
                <div class="history-editor-footer">
                    <button id="close-history-editor" class="btn-secondary">Annuler</button>
                    <button id="save-history-selections" class="btn-primary">Sauvegarder et Appliquer</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.remove();
            renderWidgets(document.querySelector('.tab-btn.active').dataset.etape);
        };

        modal.querySelector('#save-history-selections').addEventListener('click', () => {
            const newSelections = [];
            modal.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                newSelections.push(cb.dataset.id);
            });

            // --- FIX: Logic to switch modes and save selections correctly ---
            if (newSelections.length > 0) {
                mbsData.settings.historyModes[subject.code] = 'auto-assignment';
                mbsData.historyCustomSelections[subject.code] = newSelections;
            } else {
                mbsData.settings.historyModes[subject.code] = 'auto-average';
                delete mbsData.historyCustomSelections[subject.code];
            }
            
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            closeModal();
        });

        modal.querySelector('#close-history-editor').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    }
    
    // MODAL AND CALCULATOR FUNCTIONS (largely unchanged)
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
            } else { delete mbsData.settings.objectives[subject.code]; }
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
                const weight = parseFloat(assign.pond); if (isNaN(weight) || weight <= 0) return;
                sumOfTotalWeights += weight; const grade = getNumericGrade(assign.result);
                if (grade !== null) { sumOfWeightedGrades += grade * weight; sumOfCompletedWeights += weight; } else { sumOfFutureWeights += weight; }
            }));
            if (sumOfTotalWeights <= 0) { calcInfo.textContent = 'Aucun travail avec une pondération valide n\'a été trouvé.'; return; }
            const currentAverage = sumOfCompletedWeights > 0 ? (sumOfWeightedGrades / sumOfCompletedWeights) : 0;
            const completedPercentage = (sumOfCompletedWeights / sumOfTotalWeights) * 100;
            calcInfo.innerHTML = `Moyenne actuelle : <strong>${currentAverage.toFixed(2)}%</strong> (sur <strong>${completedPercentage.toFixed(1)}%</strong> de la matière complétée).`;
            const targetAvg = parseFloat(goalInput.value); if (isNaN(targetAvg) || targetAvg < 0 || targetAvg > 100) { goalResult.innerHTML = 'Veuillez entrer un objectif entre 0 et 100.'; goalResult.className = 'goal-result danger'; return; }
            const requiredAvgOnFuture = (targetAvg * sumOfTotalWeights - sumOfWeightedGrades) / sumOfFutureWeights;
            let message, resultClass;
            if (requiredAvgOnFuture > 100.01) { message = `Il faudrait <strong>${requiredAvgOnFuture.toFixed(1)}%</strong> sur les travaux restants. Objectif impossible.`; resultClass = 'danger'; }
            else if (requiredAvgOnFuture < 0) { message = `Félicitations ! Objectif déjà atteint.`; resultClass = 'success'; }
            else { message = `Il vous faut une moyenne de <strong>${requiredAvgOnFuture.toFixed(1)}%</strong> sur les travaux restants.`; resultClass = 'warning'; }
            goalResult.innerHTML = message; goalResult.className = `goal-result ${resultClass}`;
        }
        goalInput.addEventListener('input', calculate); calculate();
    }
    function setupInterEtapeCalculator(container, currentEtapeKey, goalInput) {
        container.innerHTML = `<p id="calc-info"></p><div id="goal-result" class="goal-result"></div>`;
        const goalResult = container.querySelector('#goal-result'), calcInfo = container.querySelector('#calc-info');
        const etapeWeights = { etape1: 0.2, etape2: 0.2, etape3: 0.6 }, etapeSequence = ['etape1', 'etape2', 'etape3'];
        let nextEtape = (currentEtapeKey === 'etape1') ? 'etape2' : (currentEtapeKey === 'etape2') ? 'etape3' : null;
        if (!nextEtape || currentEtapeKey === 'generale') {
            calcInfo.innerHTML = 'Toutes les étapes futures sont déjà planifiées ou le contexte est général.'; goalResult.style.display = 'none'; return;
        }
        let currentGlobalContribution = 0;
        etapeSequence.forEach(etape => {
            const subjects = mbsData[etape];
            if (subjects) { const avg = calculateSubjectAverage({ competencies: subjects.flatMap(s => s.competencies) }); if (avg !== null && etape !== nextEtape) { currentGlobalContribution += avg * etapeWeights[etape]; } }
        });
        calcInfo.innerHTML = `Planifiez votre performance pour l'<b>Étape ${nextEtape.slice(-1)}</b>.`;
        function calculate() {
            const targetGlobalAvg = parseFloat(goalInput.value); if (isNaN(targetGlobalAvg) || targetGlobalAvg < 0 || targetGlobalAvg > 100) { goalResult.innerHTML = 'Veuillez entrer un objectif global valide.'; goalResult.className = 'goal-result danger'; return; }
            const requiredAvgInNextEtape = (targetGlobalAvg - currentGlobalContribution) / etapeWeights[nextEtape];
            let message, resultClass;
            if (requiredAvgInNextEtape > 100.01) { message = `Pour atteindre <strong>${targetGlobalAvg}%</strong> global, il faudrait <strong>${requiredAvgInNextEtape.toFixed(1)}%</strong> à l'étape ${nextEtape.slice(-1)}. Objectif impossible.`; resultClass = 'danger'; }
            else if (requiredAvgInNextEtape < 0) { message = `Félicitations ! Objectif global déjà atteint.`; resultClass = 'success'; }
            else { message = `Pour atteindre <strong>${targetGlobalAvg}%</strong> global, il vous faut <strong>${requiredAvgInNextEtape.toFixed(1)}%</strong> à l'étape ${nextEtape.slice(-1)}.`; resultClass = 'warning'; }
            goalResult.innerHTML = message; goalResult.className = `goal-result ${resultClass}`;
        }
        goalInput.addEventListener('input', calculate); calculate();
    }
});
