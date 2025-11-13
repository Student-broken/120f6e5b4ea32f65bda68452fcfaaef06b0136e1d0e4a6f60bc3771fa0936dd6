document.addEventListener('DOMContentLoaded', () => {

    // --- STATE AND CONSTANTS ---
    let mbsData = {};
    let currentView = 'generale';
    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    const subjectList = { 'ART': "Arts Plastiques", 'MUS': "Musique", 'DRM': "Art Dramatique", 'CAT': "Conception et Application Technologique", 'FRA': "Français", 'ELA': "English Language Arts", 'EESL': "Enriched English", 'ESL': "English Second Language", 'SN': "Math SN", 'CST': "Math CST", 'ST': "Science et Technologie", 'STE': "Science et Tech. Env.", 'HQC': "Histoire", 'CCQ': "Culture et Citoyenneté", 'EPS': "Éducation Physique", 'CHI': "Chimie", 'PHY': "Physique", 'MON': "Monde Contemporain", 'MED': "Média", 'ENT': "Entrepreneuriat", 'INF': "Informatique", 'PSY': "Psychologie", 'FIN': "Éducation Financière" };

    // --- ELEMENTS ---
    const grid = document.getElementById('performance-grid');
    const filterBar = document.querySelector('.filter-bar');
    const goalModal = document.getElementById('goal-planner-modal');
    const goalSubjectSelect = document.getElementById('goal-subject-select');
    const plannerDetails = document.getElementById('planner-details');

    // --- INITIALIZATION ---
    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};
        if (!mbsData.valid) {
            grid.innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée disponible. Veuillez <a href="data.html">ajouter vos données</a>.</p>`;
            return;
        }
        setupEventListeners();
        renderPerformanceView();
    }

    // --- CORE RENDERING ---
    function renderPerformanceView() {
        grid.innerHTML = '';
        const subjectsToRender = getSubjectsForView(currentView);

        if (subjectsToRender.length === 0) {
            grid.innerHTML = `<p class="no-data">Aucune donnée de matière pour cette vue.</p>`;
            return;
        }

        subjectsToRender.forEach(subjectData => {
            const card = createSubjectCard(subjectData);
            grid.appendChild(card);
        });
    }

    function getSubjectsForView(view) {
        if (view === 'generale') {
            const allSubjects = new Map();
            ['etape1', 'etape2', 'etape3'].forEach(etapeKey => {
                if (mbsData[etapeKey]) {
                    mbsData[etapeKey].forEach(subject => {
                        if (!allSubjects.has(subject.code)) {
                            allSubjects.set(subject.code, { ...subject, etape: etapeKey });
                        }
                    });
                }
            });
            return Array.from(allSubjects.values());
        } else {
            return (mbsData[view] || []).map(s => ({ ...s, etape: view }));
        }
    }

    // --- CARD CREATION ---
    function createSubjectCard(subjectData) {
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.dataset.subjectCode = subjectData.code;
        card.dataset.etape = subjectData.etape;

        const average = calculateSubjectAverage(subjectData);
        const trend = getTrendForSubject(subjectData.etape, subjectData.code);
        
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3 class="card-title">${subjectData.name}</h3>
                    <small>${subjectData.code} - Étape ${subjectData.etape.slice(-1)}</small>
                </div>
                <div class="card-average">${average !== null ? average.toFixed(1) + '%' : '--'}</div>
            </div>
            <div class="card-footer">
                <div class="trend-indicator ${trend.class}">
                    ${trend.arrow} ${trend.text}
                </div>
                <button class="btn btn-primary open-planner-btn" style="padding: 5px 10px; font-size: 0.8em;">Planifier</button>
            </div>
            <div class="competency-details">
                ${subjectData.competencies.map(comp => createCompetencyRow(comp)).join('')}
            </div>
        `;
        return card;
    }

    function createCompetencyRow(competency) {
        const average = calculateCompetencyAverage(competency);
        return `
            <div class="competency-row">
                <span>${competency.name.replace('Compétence - ', '')}</span>
                <strong>${average !== null ? average.toFixed(1) + '%' : '--'}</strong>
            </div>
        `;
    }

    // --- CALCULATIONS ---
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

    function getTrendForSubject(etapeKey, subjectCode) {
        const history = mbsData.historique?.[etapeKey];
        if (!history || history.moyennes.length < 2) {
            return { class: 'trend-none', arrow: '—', text: 'Pas de données' };
        }

        const currentAvg = history.moyennes[history.moyennes.length - 1];
        const previousAvg = history.moyennes[history.moyennes.length - 2];
        const change = currentAvg - previousAvg;

        if (Math.abs(change) < 0.01) {
            return { class: 'trend-none', arrow: '—', text: 'Stable' };
        } else if (change > 0) {
            return { class: 'trend-up', arrow: '▲', text: `+${change.toFixed(1)}%` };
        } else {
            return { class: 'trend-down', arrow: '▼', text: `${change.toFixed(1)}%` };
        }
    }
    
    // --- GOAL PLANNER LOGIC ---
    function openGoalPlanner(subjectCode, etape) {
        goalSubjectSelect.innerHTML = '';
        const subjects = getSubjectsForView(currentView);
        subjects.forEach(s => {
            const option = document.createElement('option');
            option.value = `${s.code}|${s.etape}`;
            option.textContent = `${s.name} (${s.etape})`;
            if (s.code === subjectCode && s.etape === etape) {
                option.selected = true;
            }
            goalSubjectSelect.appendChild(option);
        });
        
        updatePlannerDetails();
        goalModal.classList.add('active');
    }

    function updatePlannerDetails() {
        const [subjectCode, etape] = goalSubjectSelect.value.split('|');
        const subjectData = mbsData[etape].find(s => s.code === subjectCode);

        if (!subjectData) {
            plannerDetails.classList.add('hidden');
            return;
        }

        const average = calculateSubjectAverage(subjectData);
        document.getElementById('current-subject-avg').textContent = average !== null ? average.toFixed(2) + '%' : 'N/A';
        document.getElementById('future-assignments-list').innerHTML = '';
        document.getElementById('target-grade-input').value = '85';
        plannerDetails.classList.remove('hidden');
        calculateProjection();
    }
    
    function addFutureAssignmentRow() {
        const list = document.getElementById('future-assignments-list');
        const row = document.createElement('div');
        row.className = 'future-assignment-row';
        row.innerHTML = `
            <input type="text" placeholder="Nom du travail (Ex: Examen Final)">
            <input type="number" class="future-weight" placeholder="Pond. %" min="0">
        `;
        list.appendChild(row);
        row.querySelector('.future-weight').addEventListener('input', calculateProjection);
    }
    
    function calculateProjection() {
        const [subjectCode, etape] = goalSubjectSelect.value.split('|');
        const subjectData = mbsData[etape].find(s => s.code === subjectCode);
        const currentAvg = calculateSubjectAverage(subjectData);

        let completedWeight = 0;
        subjectData.competencies.forEach(c => {
            const w = c.name.match(/\((\d+)%\)/);
            if(w) completedWeight += parseFloat(w[1]);
        });

        let futureWeight = 0;
        document.querySelectorAll('.future-weight').forEach(input => {
            const val = parseFloat(input.value);
            if (!isNaN(val) && val > 0) futureWeight += val;
        });

        const targetGrade = parseFloat(document.getElementById('target-grade-input').value) || 0;
        
        if (completedWeight + futureWeight === 0) {
            document.getElementById('projected-final-grade').textContent = '--%';
            return;
        }

        const projectedGrade = ((currentAvg * completedWeight) + (targetGrade * futureWeight)) / (completedWeight + futureWeight);
        document.getElementById('projected-final-grade').textContent = projectedGrade.toFixed(2) + '%';
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        filterBar.addEventListener('click', e => {
            if (e.target.classList.contains('filter-btn')) {
                filterBar.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                currentView = e.target.dataset.view;
                renderPerformanceView();
            }
        });

        grid.addEventListener('click', e => {
            const card = e.target.closest('.subject-card');
            if (!card) return;

            if (e.target.classList.contains('open-planner-btn')) {
                openGoalPlanner(card.dataset.subjectCode, card.dataset.etape);
            } else {
                card.classList.toggle('expanded');
            }
        });
        
        // Goal Planner Modal Listeners
        goalModal.querySelector('.modal-close').addEventListener('click', () => goalModal.classList.remove('active'));
        document.getElementById('add-assignment-btn').addEventListener('click', addFutureAssignmentRow);
        goalSubjectSelect.addEventListener('change', updatePlannerDetails);
        document.getElementById('target-grade-input').addEventListener('input', calculateProjection);
    }

    // --- START THE APP ---
    init();
});
