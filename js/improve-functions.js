document.addEventListener('DOMContentLoaded', () => {

    // --- GLOBAL STATE & CONSTANTS ---
    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    let mbsData = {};
    let gradeChart = null;
    let currentEtape = 'etape1';

    // --- DOM ELEMENTS ---
    const etapeSelector = document.getElementById('etape-selector');
    const widgetsGrid = document.getElementById('widgets-grid');
    const expandedViewContainer = document.getElementById('expanded-view-container');
    const backToGridBtn = document.getElementById('back-to-grid-btn');
    const categoryWidgetsContainer = document.getElementById('category-widgets-container');
    
    const goalSubjectSelector = document.getElementById('goal-subject-selector');
    const goalGradeInput = document.getElementById('goal-grade-input');
    const calculateGoalBtn = document.getElementById('calculate-goal-btn');
    const goalResultDiv = document.getElementById('goal-result');

    // --- INITIALIZATION ---
    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};
        if (!mbsData.valid || !mbsData.nom) {
            document.querySelector('.main-container').innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée disponible. Veuillez <a href="data.html">ajouter vos données</a> pour commencer.</p>`;
            return;
        }

        initializeChart();
        setupEventListeners();
        renderPageForEtape(currentEtape);
    }

    // --- RENDERING LOGIC ---
    function renderPageForEtape(etapeKey) {
        currentEtape = etapeKey;
        const subjects = mbsData[etapeKey] || [];
        widgetsGrid.innerHTML = ''; // Clear previous widgets

        subjects.forEach((subject, index) => {
            const average = calculateSubjectAverage(subject);
            const trend = getTrend(etapeKey, subject.code);

            const widget = document.createElement('div');
            widget.className = 'subject-widget';
            widget.dataset.subjectIndex = index;
            widget.innerHTML = `
                <div class="widget-header">
                    <div>
                        <h3 class="widget-title">${subject.name}</h3>
                        <div class="widget-average">${average !== null ? average.toFixed(2) + '%' : 'N/A'}</div>
                    </div>
                    <div class="widget-trend ${trend.direction === 'up' ? 'trend-up' : 'trend-down'}">
                        <span>${trend.arrow}</span>
                        <span>${trend.change}</span>
                    </div>
                </div>
            `;
            widgetsGrid.appendChild(widget);
        });

        populateGoalPlanner(subjects);
        hideExpandedView();
    }

    function showExpandedView(subjectIndex) {
        widgetsGrid.style.display = 'none';
        expandedViewContainer.style.display = 'block';

        const subject = mbsData[currentEtape][subjectIndex];
        document.getElementById('expanded-subject-title').innerText = subject.name;
        categoryWidgetsContainer.innerHTML = '';

        subject.competencies.forEach((comp, index) => {
            const compAvg = calculateCompetencyAverage(comp);
            const catWidget = document.createElement('div');
            catWidget.className = 'category-widget';
            catWidget.dataset.compIndex = index;
            catWidget.innerHTML = `
                <h4>${comp.name.replace('Compétence - ', '')}</h4>
                <div class="average">${compAvg !== null ? compAvg.toFixed(1) + '%' : 'N/A'}</div>
            `;
            categoryWidgetsContainer.appendChild(catWidget);
        });

        // Activate first category and render its chart by default
        if (categoryWidgetsContainer.firstChild) {
            categoryWidgetsContainer.firstChild.classList.add('active');
            updateChart(subject, 0);
        }
    }
    
    function hideExpandedView() {
        widgetsGrid.style.display = 'grid';
        expandedViewContainer.style.display = 'none';
    }

    function populateGoalPlanner(subjects) {
        goalSubjectSelector.innerHTML = '';
        subjects.forEach((subject, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = subject.name;
            goalSubjectSelector.appendChild(option);
        });
    }

    // --- CHART LOGIC ---
    function initializeChart() {
        const ctx = document.getElementById('grades-chart').getContext('2d');
        gradeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Note Obtenue (%)',
                    data: [],
                    backgroundColor: 'rgba(41, 128, 185, 0.6)',
                    borderColor: 'rgba(41, 128, 185, 1)',
                    borderWidth: 1,
                    borderRadius: 5,
                }]
            },
            options: {
                scales: {
                    y: { beginAtZero: true, max: 100 }
                },
                responsive: true,
                plugins: { legend: { display: false } }
            }
        });
    }

    function updateChart(subject, compIndex) {
        const competency = subject.competencies[compIndex];
        const gradedAssignments = competency.assignments.map(assign => ({
            name: assign.work.replace(/<br>/g, ' '),
            grade: getNumericGrade(assign.result)
        })).filter(a => a.grade !== null);

        gradeChart.data.labels = gradedAssignments.map(a => a.name);
        gradeChart.data.datasets[0].data = gradedAssignments.map(a => a.grade);
        gradeChart.update();
    }
    
    // --- CALCULATION LOGIC ---
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

    function calculateCompetencyAverage(competency) {
        let totalGradeWeight = 0;
        let totalWeight = 0;
        competency.assignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            const weight = parseFloat(assign.pond);
            if (grade !== null && !isNaN(weight) && weight > 0) {
                totalGradeWeight += grade * weight;
                totalWeight += weight;
            }
        });
        return totalWeight > 0 ? totalGradeWeight / totalWeight : null;
    }

    function calculateSubjectAverage(subject) {
        let totalCompGradeWeight = 0;
        let totalCompWeight = 0;
        subject.competencies.forEach(comp => {
            const compWeightMatch = comp.name.match(/\((\d+)%\)/);
            if (compWeightMatch) {
                const compWeight = parseFloat(compWeightMatch[1]);
                const compAvg = calculateCompetencyAverage(comp);
                if (compAvg !== null) {
                    totalCompGradeWeight += compAvg * compWeight;
                    totalCompWeight += compWeight;
                }
            }
        });
        return totalCompWeight > 0 ? totalCompGradeWeight / totalCompWeight : null;
    }

    function getTrend(etapeKey) {
        const history = mbsData.historique?.[etapeKey]?.moyennes;
        if (!history || history.length < 2) {
            return { direction: 'up', arrow: '▲', change: 'Nouveau' };
        }
        const last = history[history.length - 1];
        const previous = history[history.length - 2];
        const change = last - previous;

        if (change < 0) {
            return { direction: 'down', arrow: '▼', change: `${change.toFixed(1)}%` };
        } else {
            return { direction: 'up', arrow: '▲', change: `+${change.toFixed(1)}%` };
        }
    }

    function calculateGoal() {
        const subjectIndex = goalSubjectSelector.value;
        const targetGrade = parseFloat(goalGradeInput.value);
        if (isNaN(targetGrade) || subjectIndex === '') {
            alert("Veuillez sélectionner une matière et entrer une note valide.");
            return;
        }

        const subject = mbsData[currentEtape][subjectIndex];
        let completedWeight = 0, futureWeight = 0, currentWeightedSum = 0;

        subject.competencies.forEach(comp => {
            comp.assignments.forEach(assign => {
                const weight = parseFloat(assign.pond);
                if (isNaN(weight) || weight <= 0) return;
                
                const grade = getNumericGrade(assign.result);
                if (grade !== null) {
                    completedWeight += weight;
                    currentWeightedSum += grade * weight;
                } else {
                    futureWeight += weight;
                }
            });
        });

        goalResultDiv.style.display = 'block';
        goalResultDiv.className = ''; // Reset classes

        if (futureWeight === 0) {
            goalResultDiv.textContent = "Aucun travail futur n'est disponible dans cette matière pour influencer la moyenne.";
            goalResultDiv.classList.add('result-warning');
            return;
        }

        const totalWeight = completedWeight + futureWeight;
        const requiredAvg = ((targetGrade * totalWeight) - currentWeightedSum) / futureWeight;

        if (requiredAvg > 100) {
            goalResultDiv.innerHTML = `Pour atteindre <strong>${targetGrade}%</strong>, vous auriez besoin d'une moyenne de <strong style="color:var(--danger-color)">${requiredAvg.toFixed(1)}%</strong> sur les travaux restants. Cet objectif est probablement irréalisable.`;
            goalResultDiv.classList.add('result-error');
        } else if (requiredAvg < 0) {
            goalResultDiv.innerHTML = `Pour atteindre <strong>${targetGrade}%</strong>, vous avez seulement besoin de <strong style="color:var(--success-color)">${requiredAvg.toFixed(1)}%</strong> sur les travaux restants. Vous êtes en excellente position !`;
            goalResultDiv.classList.add('result-success');
        } else {
            goalResultDiv.innerHTML = `Pour atteindre une moyenne finale de <strong>${targetGrade}%</strong>, vous devez obtenir une moyenne de <strong>${requiredAvg.toFixed(1)}%</strong> sur tous les travaux restants.`;
            goalResultDiv.classList.add('result-success');
        }
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        etapeSelector.addEventListener('change', (e) => renderPageForEtape(e.target.value));
        widgetsGrid.addEventListener('click', (e) => {
            const widget = e.target.closest('.subject-widget');
            if (widget) {
                showExpandedView(widget.dataset.subjectIndex);
            }
        });
        backToGridBtn.addEventListener('click', hideExpandedView);
        categoryWidgetsContainer.addEventListener('click', (e) => {
            const catWidget = e.target.closest('.category-widget');
            if (catWidget) {
                // Update active state
                categoryWidgetsContainer.querySelector('.active')?.classList.remove('active');
                catWidget.classList.add('active');
                
                // Update chart
                const subjectIndex = document.querySelector('#goal-subject-selector option:checked').value; // A bit of a hack to get current subject
                const subject = mbsData[currentEtape][subjectIndex];
                updateChart(subject, catWidget.dataset.compIndex);
            }
        });
        calculateGoalBtn.addEventListener('click', calculateGoal);
    }

    // --- START THE APP ---
    init();
});
