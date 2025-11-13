document.addEventListener('DOMContentLoaded', () => {

    // --- CONSTANTS AND STATE ---
    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    let mbsData = {};
    let activeFilter = 'generale';
    let activeChart = null;

    // --- DOM ELEMENTS ---
    const performanceGrid = document.getElementById('performance-grid');
    const filterBar = document.querySelector('.filter-bar');
    const plannerModal = document.getElementById('planner-modal');
    const plannerContent = document.getElementById('planner-content');

    // --- INITIALIZATION ---
    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};

        if (!mbsData.valid || !mbsData.nom) {
            document.querySelector('.main-container').innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée de performance disponible. Veuillez <a href="data.html">ajouter vos données</a> pour commencer.</p>`;
            return;
        }

        renderPerformanceGrid(activeFilter);
        setupEventListeners();
    }

    // --- DATA HELPERS ---
    function getNumericGrade(result) {
        if (!result) return null;
        const trimmed = result.trim();
        if (gradeMap[trimmed]) return gradeMap[trimmed];
        const percentageMatch = trimmed.match(/(\d+[,.]?\d*)\s*%/);
        if (percentageMatch) return parseFloat(percentageMatch[1].replace(',', '.'));
        const scoreMatch = trimmed.match(/(\d+[,.]?\d*)\s*\/\s*(\d+[,.]?\d*)/);
        if (scoreMatch) {
            const score = parseFloat(scoreMatch[1].replace(',', '.'));
            const max = parseFloat(scoreMatch[2].replace(',', '.'));
            return max > 0 ? (score / max) * 100 : null;
        }
        return null;
    }

    function calculateCompetencyAverage(competency) {
        let totalGrade = 0;
        let totalWeight = 0;
        competency.assignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            const weight = parseFloat(assign.pond);
            if (grade !== null && !isNaN(weight) && weight > 0) {
                totalGrade += grade * weight;
                totalWeight += weight;
            }
        });
        return totalWeight > 0 ? totalGrade / totalWeight : null;
    }

    function calculateSubjectAverage(subject) {
        let totalWeightedGrade = 0;
        let totalCompetencyWeight = 0;
        subject.competencies.forEach(comp => {
            const compWeightMatch = comp.name.match(/\((\d+)%\)/);
            if (compWeightMatch) {
                const compWeight = parseFloat(compWeightMatch[1]);
                const compAvg = calculateCompetencyAverage(comp);
                if (compAvg !== null) {
                    totalWeightedGrade += compAvg * compWeight;
                    totalCompetencyWeight += compWeight;
                }
            }
        });
        return totalCompetencyWeight > 0 ? totalWeightedGrade / totalCompetencyWeight : null;
    }

    // --- RENDER FUNCTIONS ---
    function renderPerformanceGrid(filter) {
        performanceGrid.innerHTML = '';
        const subjectsToRender = getSubjectsByFilter(filter);

        subjectsToRender.forEach(subjectData => {
            const card = document.createElement('div');
            card.className = 'subject-card';
            card.dataset.subjectCode = subjectData.subject.code;
            card.dataset.etape = subjectData.etape;

            const average = calculateSubjectAverage(subjectData.subject);
            const trend = calculateTrend(subjectData.etape);

            card.innerHTML = `
                <div class="card-header">
                    <div>
                        <h3 class="card-title">${subjectData.subject.name}</h3>
                        <div class="card-main-avg">${average !== null ? average.toFixed(1) + '%' : 'N/A'}</div>
                    </div>
                    <div class="trend-indicator">
                        <div class="trend-arrow ${trend.direction}">${trend.direction === 'up' ? '▲' : '▼'}</div>
                        <div>
                            <div class="trend-change ${trend.direction}">${trend.change}</div>
                            <div style="font-size: 0.8em; color: #7f8c8d;">Tendance Étape</div>
                        </div>
                    </div>
                </div>
                <div class="expanded-content"></div>
            `;
            performanceGrid.appendChild(card);
        });
    }
    
    function renderExpandedCardContent(card) {
        const subjectCode = card.dataset.subjectCode;
        const etape = card.dataset.etape;
        const subject = mbsData[etape].find(s => s.code === subjectCode);
        const contentDiv = card.querySelector('.expanded-content');

        let competencyHTML = '<div class="competency-grid">';
        subject.competencies.forEach((comp, index) => {
            const avg = calculateCompetencyAverage(comp);
            competencyHTML += `
                <div class="competency-card" data-comp-index="${index}">
                    <h5>${comp.name.replace(/Compétence - /, '')}</h5>
                    <div class="avg-value">${avg !== null ? avg.toFixed(1) + '%' : 'N/A'}</div>
                </div>
            `;
        });
        competencyHTML += '</div>';

        const graphHTML = `
            <div class="graph-container">
                <canvas></canvas>
            </div>`;
        
        contentDiv.innerHTML = competencyHTML + graphHTML;
    }

    // --- TREND & FILTER LOGIC ---
    function getSubjectsByFilter(filter) {
        if (filter === 'generale') {
            const allSubjects = new Map();
            ['etape1', 'etape2', 'etape3'].forEach(etape => {
                if (mbsData[etape]) {
                    mbsData[etape].forEach(subject => {
                        // Prioritize later etapes for the 'generale' view
                        allSubjects.set(subject.code, { subject, etape });
                    });
                }
            });
            return Array.from(allSubjects.values());
        } else {
            return (mbsData[filter] || []).map(subject => ({ subject, etape: filter }));
        }
    }

    function calculateTrend(etapeKey) {
        const history = mbsData.historique?.[etapeKey]?.moyennes;
        if (!history || history.length < 2) {
            return { direction: 'up', change: '+0.0%' };
        }
        const current = history[history.length - 1];
        const previous = history[history.length - 2];
        const diff = current - previous;

        return {
            direction: diff >= 0 ? 'up' : 'down',
            change: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`
        };
    }

    // --- INTERACTIVITY & EVENTS ---
    function setupEventListeners() {
        filterBar.addEventListener('click', e => {
            if (e.target.classList.contains('filter-btn')) {
                filterBar.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                activeFilter = e.target.dataset.filter;
                renderPerformanceGrid(activeFilter);
            }
        });

        performanceGrid.addEventListener('click', e => {
            const card = e.target.closest('.subject-card');
            if (card && !card.classList.contains('expanded')) {
                // Collapse any other card that might be open
                const currentlyExpanded = performanceGrid.querySelector('.subject-card.expanded');
                if (currentlyExpanded) {
                    currentlyExpanded.classList.remove('expanded');
                    currentlyExpanded.querySelector('.expanded-content').innerHTML = '';
                }
                // Expand the clicked card
                card.classList.add('expanded');
                renderExpandedCardContent(card);
            }
        });

        performanceGrid.addEventListener('mouseover', e => {
            const compCard = e.target.closest('.competency-card');
            if (compCard) {
                const parentCard = compCard.closest('.subject-card.expanded');
                if (parentCard) {
                    updateGraph(parentCard, compCard.dataset.compIndex);
                }
            }
        });
        
        document.getElementById('open-planner-btn').addEventListener('click', openPlanner);
    }

    // --- GRAPH LOGIC ---
    function updateGraph(parentCard, compIndex) {
        const subjectCode = parentCard.dataset.subjectCode;
        const etape = parentCard.dataset.etape;
        const subject = mbsData[etape].find(s => s.code === subjectCode);
        const competency = subject.competencies[compIndex];
        const canvas = parentCard.querySelector('canvas');

        const labels = competency.assignments.map(a => a.work.replace(/<br>/g, ' ') || 'Travail');
        const data = competency.assignments.map(a => getNumericGrade(a.result));

        if (activeChart) {
            activeChart.destroy();
        }
        
        activeChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Note (%)',
                    data: data,
                    backgroundColor: 'rgba(41, 128, 185, 0.6)',
                    borderColor: 'rgba(41, 128, 185, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                },
                plugins: {
                    title: { display: true, text: `Notes pour: ${competency.name}` }
                }
            }
        });
    }

    // --- GOAL PLANNER LOGIC ---
    function openPlanner() {
        const subjects = getSubjectsByFilter('generale');
        if (subjects.length === 0) {
            plannerContent.innerHTML = `<p>Aucune matière disponible. Ajoutez d'abord vos données.</p>`;
        } else {
            let optionsHTML = subjects.map(s => `<option value="${s.etape}|${s.subject.code}">${s.subject.name} (${s.etape})</option>`).join('');
            plannerContent.innerHTML = `
                <div style="margin-bottom: 20px;">
                    <label for="planner-subject-select" style="display:block; margin-bottom: 5px; font-weight: 600;">Choisissez une matière :</label>
                    <select id="planner-subject-select" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ccc;">${optionsHTML}</select>
                </div>
                <div id="planner-details"></div>
            `;
            plannerModal.classList.add('active');
            document.getElementById('planner-subject-select').addEventListener('change', renderPlannerDetails);
            renderPlannerDetails({ target: document.getElementById('planner-subject-select') }); // Initial render
        }
        document.getElementById('close-planner-btn').addEventListener('click', () => plannerModal.classList.remove('active'));
    }

    function renderPlannerDetails(event) {
        const [etape, subjectCode] = event.target.value.split('|');
        const subject = mbsData[etape].find(s => s.code === subjectCode);
        const detailsDiv = document.getElementById('planner-details');
        
        const currentAvg = calculateSubjectAverage(subject);
        
        detailsDiv.innerHTML = `
            <p>Moyenne actuelle : <strong>${currentAvg !== null ? currentAvg.toFixed(2) + '%' : 'N/A'}</strong></p>
            <div id="future-assignments"></div>
            <button id="add-assignment-btn" class="btn btn-secondary" style="margin: 15px 0;">+ Ajouter un travail futur</button>
            <div style="margin-top: 20px;">
                <label for="target-grade-input" style="font-weight: 600;">Note moyenne visée pour ces travaux (%)</label>
                <input type="number" id="target-grade-input" value="85" style="width: 100px; text-align: center; padding: 8px; margin-left: 10px;">
            </div>
            <div id="projection-result">Moyenne finale projetée : --</div>
        `;
        document.getElementById('add-assignment-btn').addEventListener('click', addFutureAssignment);
        detailsDiv.addEventListener('input', recalculateProjection);
        recalculateProjection();
    }
    
    function addFutureAssignment() {
        const container = document.getElementById('future-assignments');
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.gap = '10px';
        div.style.marginBottom = '10px';
        div.innerHTML = `
            <input type="text" placeholder="Nom du travail (ex: Examen Final)" style="flex: 2; padding: 8px;">
            <input type="number" class="future-pond" placeholder="Pond. (%)" style="flex: 1; padding: 8px;">
        `;
        container.appendChild(div);
    }

    function recalculateProjection() {
        const select = document.getElementById('planner-subject-select');
        const [etape, subjectCode] = select.value.split('|');
        const subject = mbsData[etape].find(s => s.code === subjectCode);
        
        let currentTotalGrade = 0;
        let currentTotalWeight = 0;
        subject.competencies.forEach(comp => {
            const compWeightMatch = comp.name.match(/\((\d+)%\)/);
            if (compWeightMatch) {
                const compWeight = parseFloat(compWeightMatch[1]);
                const compAvg = calculateCompetencyAverage(comp);
                if (compAvg !== null) {
                    currentTotalGrade += compAvg * compWeight;
                    currentTotalWeight += compWeight;
                }
            }
        });

        let futureTotalWeight = 0;
        document.querySelectorAll('.future-pond').forEach(input => {
            const weight = parseFloat(input.value);
            if (!isNaN(weight)) futureTotalWeight += weight;
        });

        const targetGrade = parseFloat(document.getElementById('target-grade-input').value);
        const projectionResultEl = document.getElementById('projection-result');

        if (isNaN(targetGrade) || (currentTotalWeight + futureTotalWeight) === 0) {
            projectionResultEl.textContent = 'Moyenne finale projetée : --';
            return;
        }

        const futureTotalGrade = targetGrade * futureTotalWeight;
        const finalGrade = (currentTotalGrade + futureTotalGrade) / (currentTotalWeight + futureTotalWeight);
        
        projectionResultEl.textContent = `Moyenne finale projetée : ${finalGrade.toFixed(2)}%`;
    }

    // --- START THE APP ---
    init();
});
