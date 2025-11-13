document.addEventListener('DOMContentLoaded', () => {
    // --- STATE & CONSTANTS ---
    let mbsData = {};
    let activeFilter = 'generale';
    const chartInstances = new Map();
    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };

    // --- INITIALIZATION ---
    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};
        if (!mbsData.valid || !mbsData.nom) {
            document.querySelector('.main-container').innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée de performance disponible. Veuillez <a href="data.html">ajouter vos données</a>.</p>`;
            document.querySelector('.filter-bar').style.display = 'none';
            document.getElementById('goal-setter-btn').style.display = 'none';
            return;
        }
        renderContent();
        setupEventListeners();
    }

    // --- DATA PROCESSING ---
    function getNumericGrade(result) {
        if (!result) return null;
        const trimmed = result.trim();
        if (gradeMap[trimmed]) return gradeMap[trimmed];
        const scoreMatch = trimmed.match(/(\d+[,.]?\d*)\s*\/\s*(\d+[,.]?\d*)/);
        if (scoreMatch) {
            const score = parseFloat(scoreMatch[1].replace(',', '.'));
            const max = parseFloat(scoreMatch[2].replace(',', '.'));
            return (max > 0) ? (score / max) * 100 : null;
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
        return totalWeight > 0 ? totalWeightedGrade / totalWeight : null;
    }

    function getPerformanceData(filter) {
        const subjectsMap = new Map();
        const etapesToProcess = filter === 'generale' ? ['etape1', 'etape2', 'etape3'] : [filter];

        etapesToProcess.forEach(etapeKey => {
            if (!mbsData[etapeKey]) return;
            mbsData[etapeKey].forEach(subject => {
                const subjectCode = subject.code;
                if (!subjectsMap.has(subjectCode)) {
                    subjectsMap.set(subjectCode, {
                        name: subject.name,
                        code: subject.code,
                        competencies: new Map(),
                        allAssignments: []
                    });
                }
                const existingSubject = subjectsMap.get(subjectCode);
                existingSubject.allAssignments.push(...subject.competencies.flatMap(c => c.assignments));
                subject.competencies.forEach(comp => {
                    if (!existingSubject.competencies.has(comp.name)) {
                        existingSubject.competencies.set(comp.name, []);
                    }
                    existingSubject.competencies.get(comp.name).push(...comp.assignments);
                });
            });
        });

        const performanceData = [];
        subjectsMap.forEach(subject => {
            const currentAverage = calculateAverage(subject.allAssignments);
            if (currentAverage === null) return;

            // Trend calculation
            let trend = { type: 'up', change: null }; // Default to green up
            const history = mbsData.historique?.[etapesToProcess[0]]?.moyennes; // Simplified for single etape view
            if (filter !== 'generale' && history && history.length > 1) {
                const last = history[history.length - 1];
                const previous = history[history.length - 2];
                if (last < previous) {
                    trend.type = 'down';
                    trend.change = (last - previous).toFixed(1);
                } else if (last > previous) {
                    trend.type = 'up';
                    trend.change = `+${(last - previous).toFixed(1)}`;
                }
            }

            const competenciesData = [];
            subject.competencies.forEach((assignments, name) => {
                const avg = calculateAverage(assignments);
                if (avg !== null) {
                    competenciesData.push({
                        name: name.replace('Compétence - ', ''),
                        average: avg,
                        assignments: assignments.filter(a => getNumericGrade(a.result) !== null)
                    });
                }
            });

            performanceData.push({ ...subject, currentAverage, trend, competencies: competenciesData });
        });
        return performanceData;
    }

    // --- RENDERING ---
    function renderContent() {
        const grid = document.getElementById('performance-grid');
        grid.innerHTML = '';
        const data = getPerformanceData(activeFilter);

        if (data.length === 0) {
            grid.innerHTML = `<p style="text-align:center; width:100%; grid-column: 1 / -1;">Aucune donnée de performance pour cette sélection.</p>`;
            return;
        }

        data.forEach(subject => {
            grid.appendChild(createSubjectCard(subject));
        });
    }

    function createSubjectCard(subject) {
        const card = document.createElement('div');
        card.className = 'performance-card';
        card.dataset.subjectCode = subject.code;

        const trendArrow = subject.trend.type === 'up' ? '▲' : '▼';
        const trendClass = subject.trend.type === 'up' ? 'trend-up' : 'trend-down';
        const trendChange = subject.trend.change ? `(${subject.trend.change}%)` : '';

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3>${subject.name}</h3>
                    <div class="trend-indicator ${trendClass}">
                        <span class="arrow">${trendArrow}</span>
                        <span>Tendance ${trendChange}</span>
                    </div>
                </div>
                <div class="card-average">${subject.currentAverage.toFixed(1)}%</div>
            </div>
            <div class="card-expanded-content">
                <div class="competency-grid">
                    ${subject.competencies.map((comp, index) => `
                        <div class="competency-widget ${index === 0 ? 'active' : ''}" data-competency-index="${index}">
                            <h4>${comp.name}</h4>
                            <div class="avg">${comp.average.toFixed(1)}%</div>
                        </div>
                    `).join('')}
                </div>
                <div class="graph-container">
                    <canvas></canvas>
                </div>
            </div>
        `;
        return card;
    }

    // --- CHARTS ---
    function initChart(canvas, subjectData) {
        if (!subjectData.competencies || subjectData.competencies.length === 0) return;
        const initialCompetency = subjectData.competencies[0];
        const ctx = canvas.getContext('2d');
        
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: initialCompetency.assignments.map(a => a.work.replace('<br>', ' ')),
                datasets: [{
                    label: 'Note (%)',
                    data: initialCompetency.assignments.map(a => getNumericGrade(a.result)),
                    backgroundColor: 'rgba(41, 128, 185, 0.6)',
                    borderColor: 'rgba(41, 128, 185, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: { y: { beginAtZero: true, max: 100 } },
                plugins: { legend: { display: false } },
                responsive: true,
                maintainAspectRatio: true
            }
        });
        chartInstances.set(canvas, chart);
    }

    function updateChart(canvas, competencyData) {
        const chart = chartInstances.get(canvas);
        if (!chart) return;
        chart.data.labels = competencyData.assignments.map(a => a.work.replace('<br>', ' '));
        chart.data.datasets[0].data = competencyData.assignments.map(a => getNumericGrade(a.result));
        chart.update();
    }

    // --- GOAL SETTER ---
    function populateGoalSetter() {
        const select = document.getElementById('goal-subject-select');
        select.innerHTML = '';
        const data = getPerformanceData(activeFilter);
        data.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject.code;
            option.textContent = subject.name;
            select.appendChild(option);
        });
        calculateGoal();
    }
    
    function calculateGoal() {
        const subjectCode = document.getElementById('goal-subject-select').value;
        const targetAvg = parseFloat(document.getElementById('goal-target-input').value);
        const resultDiv = document.getElementById('goal-result');
        
        if (!subjectCode || isNaN(targetAvg)) {
            resultDiv.innerHTML = '';
            resultDiv.style.backgroundColor = 'transparent';
            return;
        }

        const subjectData = getPerformanceData(activeFilter).find(s => s.code === subjectCode);
        if (!subjectData) return;

        let completedWeight = 0;
        let currentWeightedScore = 0;
        subjectData.allAssignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            const weight = parseFloat(assign.pond);
            if (grade !== null && !isNaN(weight) && weight > 0) {
                completedWeight += weight;
                currentWeightedScore += grade * weight;
            }
        });

        const remainingWeight = 100 - completedWeight;
        if (remainingWeight <= 0) {
            resultDiv.textContent = 'Tous les travaux sont complétés. Votre moyenne finale est fixée.';
            resultDiv.style.backgroundColor = '#eaf2f8';
            return;
        }

        const requiredScore = ((targetAvg * 100) - currentWeightedScore) / remainingWeight;

        if (requiredScore > 100) {
            resultDiv.innerHTML = `Il est <strong>impossible</strong> d'atteindre ${targetAvg}%. Vous auriez besoin de <strong>${requiredScore.toFixed(1)}%</strong> sur les travaux restants.`;
            resultDiv.style.backgroundColor = '#fdf3f2';
        } else if (requiredScore < 50) {
            resultDiv.innerHTML = `Pour atteindre ${targetAvg}%, vous avez besoin d'une moyenne de <strong>${requiredScore.toFixed(1)}%</strong> sur les travaux restants. C'est tout à fait possible !`;
            resultDiv.style.backgroundColor = '#f2faf5';
        } else {
            resultDiv.innerHTML = `Pour atteindre ${targetAvg}%, vous devez obtenir une moyenne de <strong>${requiredScore.toFixed(1)}%</strong> sur les travaux restants.`;
            resultDiv.style.backgroundColor = '#fff9f0';
        }
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // Filter bar
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelector('.filter-btn.active').classList.remove('active');
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                chartInstances.forEach(chart => chart.destroy());
                chartInstances.clear();
                renderContent();
            });
        });

        // Performance grid (delegation)
        document.getElementById('performance-grid').addEventListener('click', e => {
            const card = e.target.closest('.performance-card');
            if (!card) return;

            const competencyWidget = e.target.closest('.competency-widget');
            if (competencyWidget) {
                // Update chart on competency click
                card.querySelectorAll('.competency-widget').forEach(w => w.classList.remove('active'));
                competencyWidget.classList.add('active');
                const subjectData = getPerformanceData(activeFilter).find(s => s.code === card.dataset.subjectCode);
                const compIndex = competencyWidget.dataset.competencyIndex;
                const canvas = card.querySelector('canvas');
                updateChart(canvas, subjectData.competencies[compIndex]);
            } else {
                // Expand/collapse card
                const wasExpanded = card.classList.contains('expanded');
                document.querySelectorAll('.performance-card.expanded').forEach(c => c.classList.remove('expanded'));
                if (!wasExpanded) {
                    card.classList.add('expanded');
                    const canvas = card.querySelector('canvas');
                    if (!chartInstances.has(canvas)) {
                         const subjectData = getPerformanceData(activeFilter).find(s => s.code === card.dataset.subjectCode);
                         initChart(canvas, subjectData);
                    }
                }
            }
        });

        // Goal Setter Modal
        const goalModal = document.getElementById('goal-modal');
        document.getElementById('goal-setter-btn').addEventListener('click', () => {
            populateGoalSetter();
            goalModal.classList.add('active');
        });
        document.getElementById('close-goal-modal').addEventListener('click', () => goalModal.classList.remove('active'));
        document.getElementById('goal-subject-select').addEventListener('change', calculateGoal);
        document.getElementById('goal-target-input').addEventListener('input', calculateGoal);
    }

    // --- START THE APP ---
    init();
});
