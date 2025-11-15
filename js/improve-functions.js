document.addEventListener('DOMContentLoaded', () => {
    let listenersAttached = false;
    
    window.addEventListener('pageshow', () => {
        init(); 
    });

    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    let mbsData = {};
    let activeGauges = {};
    const activeWidgetCharts = {};

    const widgetGrid = document.getElementById('widget-grid');
    const detailsModal = document.getElementById('details-modal');

    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};
        mbsData.settings = mbsData.settings || {};
        mbsData.settings.objectives = mbsData.settings.objectives || {};
        mbsData.settings.chartViewPrefs = mbsData.settings.chartViewPrefs || {};
        mbsData.settings.historyMode = mbsData.settings.historyMode || {};
        mbsData.settings.assignmentOrder = mbsData.settings.assignmentOrder || {};
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

    function updateAverageHistory(subjectCode, currentAverage) {
        const history = mbsData.historique[subjectCode] || [];
        if (history.length > 0 && history[history.length - 1]?.toFixed(2) === currentAverage.toFixed(2)) {
            return false;
        }
        history.push(currentAverage);
        while (history.length > 5) { history.shift(); }
        mbsData.historique[subjectCode] = history;
        return true;
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

    function calculateSubjectAverage(subject) {
        let totalWeightedCompetencyScore = 0;
        let totalCompetencyWeight = 0;
        if (subject && subject.competencies) {
            subject.competencies.forEach(comp => {
                const compWeightMatch = comp.name.match(/\((\d+)%\)/);
                if (!compWeightMatch) return;
                const competencyWeight = parseFloat(compWeightMatch[1]);
                const assignments = comp.assignments || [];
                const competencyResult = calculateAverage(assignments);
                if (competencyResult) {
                    totalWeightedCompetencyScore += competencyResult.average * competencyWeight;
                    totalCompetencyWeight += competencyWeight;
                }
            });
        }
        return totalCompetencyWeight > 0 ? totalWeightedCompetencyScore / totalCompetencyWeight : null;
    }
    
    function calculateAverage(assignments) {
        let totalWeightedGrade = 0;
        let totalWeight = 0;
        (assignments || []).forEach(assign => {
            const grade = getNumericGrade(assign.result);
            const weight = parseFloat(assign.pond);
            if (grade !== null && !isNaN(weight) && weight > 0) {
                totalWeightedGrade += grade * weight;
                totalWeight += weight;
            }
        });
        return totalWeight > 0 ? { average: totalWeightedGrade / totalWeight, weight: totalWeight } : null;
    }

    function renderWidgets(etapeKey) {
        widgetGrid.innerHTML = '';
        Object.values(activeGauges).forEach(chart => chart.destroy());
        Object.values(activeWidgetCharts).forEach(chart => chart.destroy());
        
        const allSubjectsAcrossEtapes = new Map();
        ['etape1', 'etape2', 'etape3'].forEach(etape => {
            (mbsData[etape] || []).forEach(subject => {
                if (!allSubjectsAcrossEtapes.has(subject.code)) {
                    allSubjectsAcrossEtapes.set(subject.code, { ...subject, competencies: [] });
                }
            });
        });

        ['etape1', 'etape2', 'etape3'].forEach(etape => {
            (mbsData[etape] || []).forEach(subject => {
                allSubjectsAcrossEtapes.get(subject.code)?.competencies.push(...subject.competencies);
            });
        });

        let subjectsToRender = (etapeKey === 'generale')
            ? Array.from(allSubjectsAcrossEtapes.values())
            : (mbsData[etapeKey] || []);

        subjectsToRender = subjectsToRender.map(subject => ({
            ...subject,
            average: calculateSubjectAverage(subject)
        }));

        let needsDataSave = false;
        subjectsToRender.forEach(subject => {
            if (subject.average === null) return;
            
            const overallSubject = allSubjectsAcrossEtapes.get(subject.code);
            const overallAverage = calculateSubjectAverage(overallSubject);

            if (overallAverage !== null) {
                if (updateAverageHistory(subject.code, overallAverage)) needsDataSave = true;
            }

            if (mbsData.settings.historyMode[subject.code] === 'assignment') {
                const allGradedAssignments = (overallSubject.competencies || [])
                    .flatMap((c, i) => (c.assignments || []).map((a, j) => ({ ...a, uniqueId: `${subject.code}-${i}-${j}` })))
                    .filter(a => getNumericGrade(a.result) !== null);

                const currentOrder = mbsData.settings.assignmentOrder[subject.code] || [];
                const currentOrderSet = new Set(currentOrder);
                const newAssignments = allGradedAssignments.filter(a => !currentOrderSet.has(a.uniqueId));

                if (newAssignments.length > 0) {
                    mbsData.settings.assignmentOrder[subject.code] = [...currentOrder, ...newAssignments.map(a => a.uniqueId)];
                    needsDataSave = true;
                }
            }

            const averageHistory = (mbsData.historique[subject.code] || []).filter(h => h !== null);
            let trend;
            if (averageHistory.length < 2) {
                trend = { direction: '—', change: '0.00%', class: 'neutral' };
            } else {
                const [previousAvg, currentAvg] = averageHistory.slice(-2);
                const change = currentAvg - previousAvg;
                trend = change < 0 
                    ? { direction: '▼', change: `${change.toFixed(2)}%`, class: 'down' }
                    : { direction: '▲', change: `+${change.toFixed(2)}%`, class: 'up' };
            }

            const widget = document.createElement('div');
            widget.className = 'subject-widget';
            const chartCanvasId = `dist-chart-${subject.code.replace(/\s+/g, '')}-${etapeKey}`;
            
            widget.innerHTML = `
                <div class="widget-top-section" data-subject-code="${subject.code}">
                    <div class="widget-info">
                        <h3 class="widget-title">${subject.name}</h3>
                        <p class="widget-average">${subject.average.toFixed(2)}%</p>
                        <div class="widget-trend ${trend.class}"><span>${trend.direction}</span><span>${trend.change}</span></div>
                    </div>
                    <div class="gauge-container"><canvas id="gauge-${chartCanvasId}"></canvas></div>
                </div>
                <div class="widget-chart-controls">
                    <button class="chart-toggle-btn" data-subject-code="${subject.code}"><i class="fa-solid fa-chart-simple"></i> Changer</button>
                </div>
                <div class="histogram-container" data-canvas-id="${chartCanvasId}"><canvas id="${chartCanvasId}"></canvas></div>`;
            
            widgetGrid.appendChild(widget);
            
            renderGauge(`gauge-${chartCanvasId}`, subject.average, mbsData.settings.objectives[subject.code]);
            
            const preferredView = mbsData.settings.chartViewPrefs[subject.code] || 'histogram';
            if (preferredView === 'line') {
                renderLineGraph(chartCanvasId, overallSubject);
            } else {
                renderHistogram(chartCanvasId, overallSubject);
            }
        });
        
        document.querySelectorAll('.widget-top-section').forEach(section => {
            section.addEventListener('click', () => {
                const subjectCode = section.dataset.subjectCode;
                const overallSubject = allSubjectsAcrossEtapes.get(subjectCode);
                openDetailsModal(overallSubject);
            });
        });

        document.querySelectorAll('.chart-toggle-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const subjectCode = button.dataset.subjectCode;
                const overallSubject = allSubjectsAcrossEtapes.get(subjectCode);
                openOrderEditor(overallSubject);
            });
        });

        document.querySelectorAll('.histogram-container').forEach(container => {
            container.addEventListener('click', (e) => {
                e.stopPropagation();
                const canvasId = container.dataset.canvasId;
                const subjectCode = canvasId.split('-')[2];
                const overallSubject = allSubjectsAcrossEtapes.get(subjectCode);
                
                const currentView = mbsData.settings.chartViewPrefs[subjectCode] || 'histogram';
                const newView = currentView === 'histogram' ? 'line' : 'histogram';
                mbsData.settings.chartViewPrefs[subjectCode] = newView;
                needsDataSave = true;

                if (activeWidgetCharts[canvasId]) activeWidgetCharts[canvasId].destroy();
                
                if (newView === 'line') {
                    renderLineGraph(canvasId, overallSubject);
                } else {
                    renderHistogram(canvasId, overallSubject);
                }
            });
        });

        if (needsDataSave) localStorage.setItem('mbsData', JSON.stringify(mbsData));
    }

    function renderLineGraph(canvasId, subject) {
        const mode = mbsData.settings.historyMode[subject.code] || 'average';
        const ctx = document.getElementById(canvasId).getContext('2d');
        const lineGraphColor = '#3498db';
        let chartData, chartTitle;

        if (mode === 'assignment') {
            const allAssignments = (subject.competencies || [])
                .flatMap((c, i) => (c.assignments || []).map((a, j) => ({ ...a, uniqueId: `${subject.code}-${i}-${j}` })));
            
            let gradedAssignments = allAssignments.filter(a => getNumericGrade(a.result) !== null);

            const order = mbsData.settings.assignmentOrder[subject.code] || [];
            if (order.length > 0) {
                const orderMap = new Map(order.map((id, index) => [id, index]));
                gradedAssignments.sort((a, b) => (orderMap.get(a.uniqueId) ?? Infinity) - (orderMap.get(b.uniqueId) ?? Infinity));
            }
            
            chartData = {
                labels: gradedAssignments.map(a => a.work.replace('<br>', ' ')),
                datasets: [{ 
                    label: 'Note', 
                    data: gradedAssignments.map(a => getNumericGrade(a.result)),
                    borderColor: lineGraphColor, pointBackgroundColor: lineGraphColor, pointRadius: 5 
                }]
            };
            chartTitle = 'Ordre des travaux';
        } else {
            const history = (mbsData.historique[subject.code] || []).filter(h => h !== null);
            chartData = {
                labels: history.map((_, i) => `Moyenne ${i + 1}`),
                datasets: [{ 
                    label: 'Moyenne', 
                    data: history, 
                    borderColor: lineGraphColor, pointBackgroundColor: lineGraphColor, pointRadius: 5 
                }]
            };
            chartTitle = 'Historique des moyennes';
        }

        activeWidgetCharts[canvasId] = new Chart(ctx, {
            type: 'line', data: chartData,
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    y: { suggestedMin: 50, suggestedMax: 100 },
                    // --- MODIFICATION: Hide X-axis labels ---
                    x: { ticks: { display: false }, grid: { display: false } }
                },
                plugins: { 
                    legend: { display: false }, 
                    title: { display: true, text: chartTitle }
                }
            }
        });
    }

    function openOrderEditor(subject) {
        const modal = document.createElement('div');
        modal.id = 'order-editor-modal';
        modal.className = 'modal-overlay active';

        const allAssignments = (subject.competencies || [])
            .flatMap((c, i) => (c.assignments || []).map((a, j) => ({ ...a, uniqueId: `${subject.code}-${i}-${j}` })))
            .filter(a => getNumericGrade(a.result) !== null);

        const currentOrder = mbsData.settings.assignmentOrder[subject.code] || [];
        if (currentOrder.length > 0) {
            const orderMap = new Map(currentOrder.map((id, index) => [id, index]));
            allAssignments.sort((a, b) => (orderMap.get(a.uniqueId) ?? Infinity) - (orderMap.get(b.uniqueId) ?? Infinity));
        }
        
        modal.innerHTML = `
            <div class="order-editor-content">
                <h3>Ordonner les Travaux pour le Graphique</h3>
                <p class="editor-instructions">Glissez-déposez pour réorganiser l'ordre des points sur le graphique.</p>
                <ul id="order-list">
                    ${allAssignments.map(assign => `
                        <li draggable="true" data-id="${assign.uniqueId}">
                            <i class="fa-solid fa-grip-vertical"></i>
                            ${assign.work.replace('<br>', ' ')} 
                            <span class="grade-pill">${assign.result}</span>
                        </li>
                    `).join('')}
                </ul>
                <div class="order-editor-footer">
                    <button id="reset-mode-btn" class="btn-secondary">Revenir au mode moyenne auto</button>
                    <div>
                        <button id="close-order-editor" class="btn-secondary">Annuler</button>
                        <button id="save-order" class="btn-primary">Sauvegarder</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const list = modal.querySelector('#order-list');
        list.addEventListener('dragstart', e => {
            setTimeout(() => e.target.classList.add('dragging'), 0);
        });
        list.addEventListener('dragend', e => e.target.classList.remove('dragging'));
        list.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = [...list.querySelectorAll('li:not(.dragging)')].reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = e.clientY - box.top - box.height / 2;
                return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
            const dragging = document.querySelector('.dragging');
            if (dragging) {
                if (afterElement == null) list.appendChild(dragging);
                else list.insertBefore(dragging, afterElement);
            }
        });

        const closeModal = () => {
            modal.remove();
            renderWidgets(document.querySelector('.tab-btn.active').dataset.etape);
        };

        modal.querySelector('#save-order').addEventListener('click', () => {
            const newOrder = [...list.querySelectorAll('li')].map(li => li.dataset.id);
            mbsData.settings.assignmentOrder[subject.code] = newOrder;
            mbsData.settings.historyMode[subject.code] = 'assignment';
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            closeModal();
        });

        modal.querySelector('#reset-mode-btn').addEventListener('click', () => {
            delete mbsData.settings.assignmentOrder[subject.code];
            delete mbsData.settings.historyMode[subject.code];
            localStorage.setItem('mbsData', JSON.stringify(mbsData));
            closeModal();
        });

        modal.querySelector('#close-order-editor').addEventListener('click', closeModal);
    }
    
    // --- Unchanged Functions (Histogram, Gauge, Details Modal, etc.) ---

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
                    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#e0e0e0' : '#2c3e50'; ctx.fill();
                    ctx.restore();
                    if (goal) {
                        const goalAngle = Math.PI + (goal / 100) * Math.PI;
                        const innerRadius = chart.getDatasetMeta(0).data[0].innerRadius;
                        ctx.save(); ctx.translate(cx, cy); ctx.rotate(goalAngle); ctx.beginPath();
                        ctx.moveTo(innerRadius, 0); ctx.lineTo(needleRadius, 0);
                        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.stroke();
                        ctx.restore();
                    }
                }
            }]
        });
    }

    function renderHistogram(canvasId, subject) {
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const colors = isDarkMode ? ['#ff5252', '#ff9800', '#cddc39', '#4caf50'] : ['#e74c3c', '#f39c12', '#a0c800', '#27ae60'];
        const grades = (subject.competencies || []).flatMap(comp => (comp.assignments || []).map(a => getNumericGrade(a.result)).filter(g => g !== null));
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

    function openDetailsModal(subject) {
        const modalContent = document.getElementById('modal-content');
        modalContent.innerHTML = `
            <div class="modal-header"><h2 class="modal-title">${subject.name} (${subject.code})</h2></div>
            <div class="modal-body">
                <div class="competency-widgets"></div>
                <!-- Other content like calculator can go here -->
            </div>`;
        const competencyContainer = modalContent.querySelector('.competency-widgets');
        const uniqueCompetencies = new Map();
        (subject.competencies || []).forEach(comp => {
            if (!uniqueCompetencies.has(comp.name)) uniqueCompetencies.set(comp.name, { name: comp.name, assignments: [] });
            uniqueCompetencies.get(comp.name).assignments.push(...(comp.assignments || []));
        });

        Array.from(uniqueCompetencies.values()).forEach(comp => {
            const compResult = calculateAverage(comp.assignments);
            if (!compResult) return;
            const compWidget = document.createElement('div');
            compWidget.className = 'comp-widget';
            compWidget.innerHTML = `<h4>${comp.name}</h4><div class="avg">${compResult.average.toFixed(1)}%</div>`;
            competencyContainer.appendChild(compWidget);
        });

        detailsModal.classList.add('active');
    }
    
    function closeDetailsModal() {
        detailsModal.classList.remove('active');
    }
});
