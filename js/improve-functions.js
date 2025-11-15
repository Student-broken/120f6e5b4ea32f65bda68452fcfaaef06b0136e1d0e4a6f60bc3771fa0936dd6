document.addEventListener('DOMContentLoaded', () => {
    // --- PAGE LIFECYCLE & SETUP ---
    let listenersAttached = false;
    window.addEventListener('pageshow', () => init());

    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    let mbsData = {};
    let activeChart = null;
    let activeGauges = {};
    const activeWidgetCharts = {};
    const widgetGrid = document.getElementById('widget-grid');
    const detailsModal = document.getElementById('details-modal');

    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};
        mbsData.settings = mbsData.settings || { objectives: {}, chartViewPrefs: {}, historyModes: {} };
        mbsData.historique = mbsData.historique || {};
        
        if (!mbsData.valid) {
            widgetGrid.innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée à analyser. Veuillez d'abord <a href="data.html">importer vos données</a>.</p>`;
            return;
        }

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

    // --- CORE DATA & CALCULATION UTILITIES ---

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
    
    /**
     * FIX: Generates a stable, unique ID for an assignment based on its properties, not its index.
     */
    function getStableAssignmentId(subjectCode, compName, workName) {
         // Create a simple, URL-safe ID from assignment properties.
         return `${subjectCode}|${compName}|${workName}`.replace(/<br>|\s|%/g, '');
    }

    function getAllAssignmentsForSubject(subjectCode) {
        return ['etape1', 'etape2', 'etape3'].flatMap(etapeKey =>
            (mbsData[etapeKey] || []).filter(s => s.code === subjectCode)
            .flatMap(s => s.competencies.flatMap(c => c.assignments.map(a => ({ 
                ...a, 
                compName: c.name,
                subjectCode: s.code,
                uniqueId: getStableAssignmentId(s.code, c.name, a.work)
            }))))
        );
    }
    
    function calculateAverageFromSelection(selection, allAssignments) {
        const assignmentsForCalc = allAssignments.filter(a => selection.has(a.uniqueId));
        if (assignmentsForCalc.length === 0) return null;

        const competenciesForCalc = new Map();
        assignmentsForCalc.forEach(assign => {
            if (!competenciesForCalc.has(assign.compName)) {
                competenciesForCalc.set(assign.compName, { name: assign.compName, assignments: [] });
            }
            competenciesForCalc.get(assign.compName).assignments.push(assign);
        });

        // Simplified subject average calculation for this specific context
        let totalWeightedCompetencyScore = 0, totalCompetencyWeight = 0;
        for (const comp of competenciesForCalc.values()) {
            const compWeightMatch = comp.name.match(/\((\d+)%\)/);
            if (!compWeightMatch) continue;
            const competencyWeight = parseFloat(compWeightMatch[1]);
            
            let totalWeightedGrade = 0, totalWeight = 0;
            comp.assignments.forEach(assign => {
                const grade = getNumericGrade(assign.result);
                const weight = parseFloat(assign.pond);
                if (grade !== null && !isNaN(weight) && weight > 0) {
                    totalWeightedGrade += grade * weight;
                    totalWeight += weight;
                }
            });
            const competencyResult = totalWeight > 0 ? totalWeightedGrade / totalWeight : null;

            if (competencyResult !== null) {
                totalWeightedCompetencyScore += competencyResult * competencyWeight;
                totalCompetencyWeight += competencyWeight;
            }
        }
        return totalCompetencyWeight > 0 ? totalWeightedCompetencyScore / totalCompetencyWeight : null;
    }


    /**
     * REWORKED: Manages automatic updates to a subject's history based on its mode.
     * This is now safer and more predictable.
     */
    function autoUpdateSubjectHistory(subjectCode) {
        const allAssignments = getAllAssignmentsForSubject(subjectCode);
        const gradedAssignments = allAssignments.filter(a => getNumericGrade(a.result) !== null);
        if (gradedAssignments.length === 0) return false;

        let history = (mbsData.historique[subjectCode] || []).map(arr => new Set(arr));
        const mode = mbsData.settings.historyModes[subjectCode] || 'auto_average';
        let needsSave = false;
        
        // Mode 1: Auto Average - First time setup
        if (mode === 'auto_average' && history.length === 0) {
            const allGradedIds = new Set(gradedAssignments.map(a => a.uniqueId));
            history.push(allGradedIds);
            needsSave = true;
        }
        // Mode 2: Custom Assignment - Auto-append new grades
        else if (mode === 'custom_assignment' && history.length > 0) {
            const lastPointSelection = history[history.length - 1];
            const newGradedAssignments = gradedAssignments.filter(a => !lastPointSelection.has(a.uniqueId));

            if (newGradedAssignments.length > 0) {
                const newPoint = new Set(lastPointSelection); // Copy last point
                newGradedAssignments.forEach(a => newPoint.add(a.uniqueId));
                history.push(newPoint);
                needsSave = true;
            }
        }
        
        if (needsSave) {
            while (history.length > 5) { history.shift(); }
            mbsData.historique[subjectCode] = history.map(s => Array.from(s));
        }
        return needsSave;
    }

    // --- WIDGET & CHART RENDERING ---

    function renderWidgets(etapeKey) {
        widgetGrid.innerHTML = '';
        Object.values(activeGauges).forEach(chart => chart.destroy());
        Object.values(activeWidgetCharts).forEach(chart => chart.destroy());
        activeGauges = {};
        
        let subjectsToRender = [];
        if (etapeKey === 'generale') {
            const allSubjectCodes = new Set(['etape1', 'etape2', 'etape3'].flatMap(e => (mbsData[e] || []).map(s => s.code)));
            subjectsToRender = Array.from(allSubjectCodes).map(code => {
                const allComps = ['etape1', 'etape2', 'etape3'].flatMap(e => (mbsData[e] || []).filter(s => s.code === code).flatMap(s => s.competencies));
                const subjectName = (mbsData.etape1.find(s=>s.code===code) || mbsData.etape2.find(s=>s.code===code) || mbsData.etape3.find(s=>s.code===code)).name;
                return { code, name: subjectName, competencies: allComps, average: calculateSubjectAverage({competencies: allComps}) };
            });
        } else {
            subjectsToRender = (mbsData[etapeKey] || []).map(subject => ({ ...subject, average: calculateSubjectAverage(subject) }));
        }

        let needsDataSave = false;
        subjectsToRender.forEach(subject => {
            if (subject.average === null) return;

            if (autoUpdateSubjectHistory(subject.code)) {
                needsDataSave = true;
            }
            
            const allAssignments = getAllAssignmentsForSubject(subject.code);
            const averageHistory = (mbsData.historique[subject.code] || [])
                .map(selectionArray => calculateAverageFromSelection(new Set(selectionArray), allAssignments))
                .filter(avg => avg !== null);

            let trend = { direction: '—', change: '0.00%', class: 'neutral' };
            if (averageHistory.length >= 2) {
                const currentAvg = averageHistory[averageHistory.length - 1];
                const previousAvg = averageHistory[averageHistory.length - 2];
                const change = currentAvg - previousAvg;
                if(Math.abs(change) > 0.01) {
                    trend = change < 0 
                        ? { direction: '▼', change: `${change.toFixed(2)}%`, class: 'down' }
                        : { direction: '▲', change: `+${change.toFixed(2)}%`, class: 'up' };
                }
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
                    <button class="history-editor-btn" data-subject-code="${subject.code}" title="Éditer l'historique"><i class="fa-solid fa-pen-to-square"></i> Changer</button>
                </div>
                <div class="chart-container" data-subject-code="${subject.code}" data-canvas-id="${chartCanvasId}" title="Cliquer pour changer de vue"><canvas id="${chartCanvasId}"></canvas></div>`;
            
            widget.querySelector('.widget-top-section').addEventListener('click', () => openDetailsModal(subject, etapeKey));
            widgetGrid.appendChild(widget);
            
            renderGauge(`gauge-${chartCanvasId}`, subject.average, mbsData.settings.objectives[subject.code]);
            const preferredView = mbsData.settings.chartViewPrefs[subject.code] || 'histogram';
            if (preferredView === 'line') renderLineGraph(chartCanvasId, subject.code);
            else renderHistogram(chartCanvasId, subject);
        });
        
        document.querySelectorAll('.chart-container').forEach(container => {
            container.addEventListener('click', () => {
                const subjectCode = container.dataset.subjectCode;
                const canvasId = container.dataset.canvasId;
                const subject = subjectsToRender.find(s => s.code === subjectCode);

                const currentView = mbsData.settings.chartViewPrefs[subjectCode] || 'histogram';
                const newView = currentView === 'histogram' ? 'line' : 'histogram';
                mbsData.settings.chartViewPrefs[subjectCode] = newView;
                needsDataSave = true;

                if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
                if (newView === 'line') renderLineGraph(canvasId, subject.code);
                else renderHistogram(canvasId, subject);
            });
        });

        document.querySelectorAll('.history-editor-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                openHistoryEditor(button.dataset.subjectCode);
            });
        });

        if (needsDataSave) localStorage.setItem('mbsData', JSON.stringify(mbsData));
        if (!widgetGrid.children.length) widgetGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align:center;">Aucune donnée pour cette période.</p>`;
    }
    
    // ... [Unchanged rendering functions: renderGauge, renderHistogram] ...

    function renderLineGraph(canvasId, subjectCode) {
        const allAssignments = getAllAssignmentsForSubject(subjectCode);
        const historyData = (mbsData.historique[subjectCode] || [])
            .map(selectionArray => calculateAverageFromSelection(new Set(selectionArray), allAssignments))
            .filter(avg => avg !== null);
            
        const labels = historyData.map((_, i) => `Point ${i + 1}`);
        const ctx = document.getElementById(canvasId).getContext('2d');
        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Moyenne', data: historyData, borderColor: '#3498db', pointBackgroundColor: '#3498db', pointRadius: 5, fill: false }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: 50, suggestedMax: 100 } }, plugins: { legend: { display: false }, title: { display: true, text: 'Historique des moyennes' } } }
        });
    }

    // --- HISTORY EDITOR MODAL (COMPLETELY REWRITTEN) ---

    function openHistoryEditor(subjectCode) {
        const allAssignments = getAllAssignmentsForSubject(subjectCode);
        const subjectName = allAssignments.length > 0 ? (mbsData.etape1.find(s=>s.code===subjectCode) || mbsData.etape2.find(s=>s.code===subjectCode) || mbsData.etape3.find(s=>s.code===subjectCode)).name : subjectCode;
        
        let historySelections = (mbsData.historique[subjectCode] || []).map(arr => new Set(arr));

        const modal = document.createElement('div');
        modal.id = 'history-editor-modal';
        modal.className = 'modal-overlay active';
        
        modal.innerHTML = `
            <div class="history-editor-content">
                <div class="history-editor-header">
                    <h3>Éditeur d'historique pour ${subjectName}</h3>
                    <p>Créez des points de données en sélectionnant les travaux à inclure. <br><small><i>Cliquer sur le graphique à l'extérieur pour le changer de type.</i></small></p>
                </div>
                <div class="history-points-controls">
                    <div id="points-tabs" class="points-tabs"></div>
                    <button id="add-point-btn" class="btn-add" title="Ajouter un nouveau point de données"><i class="fa-solid fa-plus"></i></button>
                </div>
                <div class="assignments-list"></div>
                <div class="history-editor-footer">
                    <div>
                        <button id="delete-point-btn" class="btn-danger">Supprimer ce point</button>
                        <button id="reset-history-btn" class="btn-secondary">Réinitialiser</button>
                    </div>
                    <div>
                        <button id="close-history-editor" class="btn-secondary">Annuler</button>
                        <button id="save-history-all" class="btn-primary">Sauvegarder</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const assignmentsContainer = modal.querySelector('.assignments-list');
        const pointsTabsContainer = modal.querySelector('#points-tabs');
        const deletePointBtn = modal.querySelector('#delete-point-btn');
        let activePointIndex = historySelections.length > 0 ? historySelections.length - 1 : -1;

        const renderPointTabs = () => {
            pointsTabsContainer.innerHTML = historySelections.map((_, i) => 
                `<button class="point-tab-btn ${i === activePointIndex ? 'active' : ''}" data-index="${i}">Point ${i + 1}</button>`
            ).join('');
            document.querySelectorAll('.point-tab-btn').forEach(btn => 
                btn.addEventListener('click', () => loadPointUI(parseInt(btn.dataset.index)))
            );
            deletePointBtn.style.display = historySelections.length > 0 ? 'inline-block' : 'none';
        };

        const loadPointUI = (pointIndex) => {
            activePointIndex = pointIndex;
            renderPointTabs();
            
            if (activePointIndex === -1) {
                assignmentsContainer.innerHTML = '<p style="text-align:center; padding: 2rem 0;">Aucun point de données. Cliquez sur le bouton \'+\' pour commencer.</p>';
                return;
            }

            const currentSelections = historySelections[activePointIndex];
            assignmentsContainer.innerHTML = allAssignments.map(assign => {
                const isChecked = currentSelections.has(assign.uniqueId);
                const isGraded = getNumericGrade(assign.result) !== null;
                return `
                <div class="assignment-item ${isGraded ? '' : 'ungraded'}">
                    <input type="checkbox" id="${assign.uniqueId}-${pointIndex}" data-id="${assign.uniqueId}" ${isChecked ? 'checked' : ''}>
                    <label for="${assign.uniqueId}-${pointIndex}">
                        ${assign.work.replace('<br>', ' ')}
                        <small>Note: ${assign.result || 'N/A'} | Pondération: ${assign.pond}%</small>
                    </label>
                </div>`;
            }).join('');

            assignmentsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    const id = checkbox.dataset.id;
                    if (checkbox.checked) historySelections[activePointIndex].add(id);
                    else historySelections[activePointIndex].delete(id);
                });
            });
        };
        
        modal.querySelector('#add-point-btn').addEventListener('click', () => {
            historySelections.push(new Set());
            loadPointUI(historySelections.length - 1);
        });

        deletePointBtn.addEventListener('click', () => {
            if (activePointIndex !== -1) {
                historySelections.splice(activePointIndex, 1);
                loadPointUI(historySelections.length > 0 ? historySelections.length - 1 : -1);
            }
        });

        modal.querySelector('#reset-history-btn').addEventListener('click', () => {
            if (confirm("Voulez-vous vraiment supprimer tout l'historique personnalisé pour cette matière et revenir au mode automatique ?")) {
                historySelections = [];
                // On save, this will trigger the mode switch back to auto_average.
                loadPointUI(-1);
            }
        });
        
        const closeModal = () => {
            modal.remove();
            renderWidgets(document.querySelector('.tab-btn.active').dataset.etape);
        };

        modal.querySelector('#save-history-all').addEventListener('click', () => {
            mbsData.historique[subjectCode] = historySelections.map(s => Array.from(s));

            if (historySelections.length > 0) {
                mbsData.settings.historyModes[subjectCode] = 'custom_assignment';
            } else {
                delete mbsData.settings.historyModes[subjectCode];
                delete mbsData.historique[subjectCode]; // Clear it completely
            }
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            closeModal();
        });

        modal.querySelector('#close-history-editor').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
        loadPointUI(activePointIndex);
    }

    // --- OTHER MODALS & CALCULATORS (Largely Unchanged) ---
    // ... Paste the existing, unchanged functions here:
    // renderGauge, renderHistogram, openDetailsModal, closeDetailsModal, createOrUpdateChart, 
    // setupGoalFramework, setupIntraSubjectCalculator, setupInterEtapeCalculator
    // NOTE: I am omitting them here for brevity as they are not part of the fix.
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
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false }, title: { display: true, text: 'Distribution des notes' } } }
        });
    }

});
