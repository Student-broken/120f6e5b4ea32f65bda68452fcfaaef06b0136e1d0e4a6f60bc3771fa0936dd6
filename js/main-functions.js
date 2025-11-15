document.addEventListener('DOMContentLoaded', () => {

    // --- CONSTANTS AND STATE ---
    const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
    const defaultUnits = {
        sec4: { 'ART': 2, 'MUS': 2, 'DRM': 2, 'FRA': 6, 'ELA': 4, 'EESL': 6, 'ESL': 4, 'MAT': 6, 'CST': 6, 'ST': 4, 'STE': 4, 'HQC': 4, 'CCQ': 2, 'EPS': 2, 'ENT': 2, 'INF': 2, 'PSY': 2 },
        sec5: { 'ART': 2, 'MUS': 2, 'DRM': 2, 'CAT': 4, 'FRA': 6, 'ELA': 6, 'EESL': 6, 'ESL': 4, 'MAT': 6, 'CST': 4, 'MED': 4, 'PSY': 4, 'ENT': 4, 'FIN': 4, 'CHI': 4, 'PHY': 4, 'MON': 2, 'HQC': 4, 'CCQ': 2, 'EPS': 2, 'FIN': 2 }
    };
    const subjectList = { 'ART': "Arts Plastiques", 'MUS': "Musique", 'DRM': "Art Dramatique", 'CAT': "Conception et Application Technologique", 'FRA': "Français", 'ELA': "English Language Arts", 'EESL': "Enriched English", 'ESL': "English Second Language", 'SN': "Math SN", 'CST': "Math CST", 'ST': "Science et Technologie", 'STE': "Science et Tech. Env.", 'HQC': "Histoire", 'CCQ': "Culture et Citoyenneté", 'EPS': "Éducation Physique", 'CHI': "Chimie", 'PHY': "Physique", 'MON': "Monde Contemporain", 'MED': "Média", 'ENT': "Entrepreneuriat", 'INF': "Informatique", 'PSY': "Psychologie", 'FIN': "Éducation Financière" };
    
    let mbsData = {};
    let activeTab = 'etape1';

    // --- INITIALIZATION ---
    function init() {
        mbsData = JSON.parse(localStorage.getItem('mbsData')) || {};

        if (!mbsData.valid || !mbsData.nom) {
            document.querySelector('.main-container').innerHTML = `<p style="text-align:center; width:100%;">Aucune donnée disponible. Veuillez <a href="data.html">ajouter vos données</a> pour commencer.</p>`;
            return;
        }

        loadSettings();
        renderAll();
        setupEventListeners();
    }

    // --- DATA & SETTINGS MANAGEMENT ---
    function loadSettings() {
        const settings = mbsData.settings || {};
        document.getElementById('niveau-secondaire').value = settings.niveau || '';
        document.getElementById('unites-mode').value = settings.unitesMode || 'defaut';
    }

    function saveSettings() {
        mbsData.settings = {
            niveau: document.getElementById('niveau-secondaire').value,
            unitesMode: document.getElementById('unites-mode').value,
            customUnites: mbsData.settings?.customUnites || {}
        };
        localStorage.setItem('mbsData', JSON.stringify(mbsData));
        renderAll();
    }
    
    function saveCustomUnits() {
        if (document.getElementById('unites-mode').value !== 'perso') return;
        let customUnites = {};
        document.querySelectorAll('.unite-item input').forEach(input => {
            customUnites[input.dataset.code] = parseFloat(input.value) || 1;
        });
        mbsData.settings.customUnites = customUnites;
        saveSettings();
    }

    function savePonderations() {
        document.querySelectorAll('.pond-input-field.modified-input').forEach(input => {
            const [etapeKey, subjectIndex, compIndex, assignIndex] = input.dataset.path.split('-');
            mbsData[etapeKey][subjectIndex].competencies[compIndex].assignments[assignIndex].pond = input.value;
        });
        localStorage.setItem('mbsData', JSON.stringify(mbsData));
        renderAll(); // Re-render to remove highlights
    }

    // --- RENDERING FUNCTIONS ---
    function renderAll() {
        renderTermTables();
        renderSidePanel();
        document.getElementById('ponderation-controls').classList.add('hidden');
    }

    function renderTermTables() {
        renderTermData(mbsData.etape1, document.getElementById('etape1'));
        renderTermData(mbsData.etape2, document.getElementById('etape2'));
        renderTermData(mbsData.etape3, document.getElementById('etape3'));
    }

    function renderTermData(termData, container) {
        if (!termData || termData.length === 0) {
            container.innerHTML = '<p class="no-data">Aucune donnée pour cette étape.</p>';
            return;
        }
        container.innerHTML = '';
        termData.forEach((subject, subjectIndex) => {
            container.appendChild(renderSubjectTable(subject, container.id, subjectIndex));
        });
    }

    function renderSubjectTable(subject, etapeKey, subjectIndex) {
        const table = document.createElement('table');
        table.className = 'subject-table';
        table.innerHTML = `
            <thead>
                <tr><th colspan="7">${subject.code} - ${subject.name}</th></tr>
                <tr><th>Catégorie</th><th>Travail</th><th>Pond.</th><th>Date assignée</th><th>Date due</th><th>Résultat</th></tr>
            </thead>
            <tbody></tbody>`;
        const tbody = table.querySelector('tbody');

        subject.competencies.forEach((comp, compIndex) => {
            const compRow = document.createElement('tr');
            compRow.className = 'competency-row';
            compRow.innerHTML = `<td colspan="7">${comp.name}</td>`;
            tbody.appendChild(compRow);

            comp.assignments.forEach((assign, assignIndex) => {
                const assignRow = document.createElement('tr');
                const dataPath = `${etapeKey}-${subjectIndex}-${compIndex}-${assignIndex}`;
                
                assignRow.innerHTML = `
                    <td>${assign.category || '<span class="no-data">-</span>'}</td>
                    <td>${assign.work || '<span class="no-data">-</span>'}</td>
                    <td><input type="number" class="pond-input-field" value="${assign.pond || ''}" data-path="${dataPath}" placeholder="--"></td>
                    <td>${assign.assignedDate || '<span class="no-data">-</span>'}</td>
                    <td>${(assign.dueDate || '').replace('à','')}</td>
                    <td>
                        <div class="grade-container" data-original-result="${assign.result || ''}">
                            <span class="grade-display">${formatGrade(assign.result)}</span>
                            <input type="number" class="grade-input-field hidden" min="0" max="100">
                        </div>
                    </td>
                `;
                tbody.appendChild(assignRow);
            });
        });
        return table;
    }

    function renderSidePanel() {
        const averages = calculateAllAverages();
        const niveau = mbsData.settings?.niveau;
        
        const formatAvg = (avg) => avg !== null ? `<span class="grade-percentage">${avg.toFixed(2)}%</span>` : '--';

        const globalAvgEl = document.getElementById('moyenne-generale');
        globalAvgEl.innerHTML = formatAvg(averages.globalAverage);
        globalAvgEl.classList.toggle('invalid', averages.globalAverage === null && !!mbsData.etape1);

        const termAvgEl = document.getElementById('moyenne-etape');
        termAvgEl.innerHTML = formatAvg(averages.termAverages[activeTab]);

        const subjectListEl = document.getElementById('subject-averages-list');
        subjectListEl.innerHTML = '';
        const activeTermSubjects = averages.subjectAverages[activeTab];
        if (activeTermSubjects && Object.keys(activeTermSubjects).length > 0) {
            Object.entries(activeTermSubjects).forEach(([code, subj]) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${subj.name}</span><strong>${formatAvg(subj.average)}</strong>`;
                subjectListEl.appendChild(li);
            });
        } else {
            subjectListEl.innerHTML = '<li class="no-data">Aucune matière pour cette étape</li>';
        }
    }

    function populateUnitesModal() {
        const listContainer = document.getElementById('unites-list');
        const mode = document.getElementById('unites-mode').value;
        listContainer.innerHTML = '';

        const allSubjects = new Map();
        ['etape1', 'etape2', 'etape3'].forEach(etape => {
            if (mbsData[etape]) {
                mbsData[etape].forEach(subject => {
                    const codePrefix = subject.code.substring(0, 3);
                    if (!allSubjects.has(codePrefix)) {
                        allSubjects.set(codePrefix, subjectList[codePrefix] || subject.name);
                    }
                });
            }
        });

        const units = getUnits();
        allSubjects.forEach((name, code) => {
            const item = document.createElement('div');
            item.className = 'unite-item';
            let valueDisplay = '';
            if (mode === 'perso') {
                const currentValue = (mbsData.settings.customUnites || {})[code] || 1;
                valueDisplay = `<input type="number" data-code="${code}" value="${currentValue}" min="0" step="1">`;
            } else {
                valueDisplay = `<span>${units[code] || (mode === 'sans' ? 1 : 2)}</span>`;
            }
            item.innerHTML = `<label>${name} (${code})</label>${valueDisplay}`;
            listContainer.appendChild(item);
        });
    }

    // --- CALCULATION LOGIC ---
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
            return (max > 0) ? (score / max) * 100 : null;
        }
        return null;
    }
    
    function calculateAllAverages() {
        const units = getUnits();
        const niveau = mbsData.settings?.niveau;
        let allTermAverages = { etape1: null, etape2: null, etape3: null };
        let allSubjectAverages = {};

        ['etape1', 'etape2', 'etape3'].forEach(etape => {
            if (!mbsData[etape]) return;
            let termWeightedSum = 0;
            let termUnitSum = 0;
            allSubjectAverages[etape] = {};

            mbsData[etape].forEach((subject, subjectIndex) => {
                const average = calculateSubjectAverage(subject, etape, subjectIndex);
                const codePrefix = subject.code.substring(0, 3);
                allSubjectAverages[etape][codePrefix] = { name: subjectList[codePrefix] || subject.name, average };

                if (average !== null && niveau) {
                    const unit = units[codePrefix] || 2;
                    termWeightedSum += average * unit;
                    termUnitSum += unit;
                }
            });
            allTermAverages[etape] = termUnitSum > 0 ? termWeightedSum / termUnitSum : null;
        });

        let globalWeightedSum = 0;
        let totalWeight = 0;
        const termWeights = { etape1: 0.20, etape2: 0.20, etape3: 0.60 };
        Object.entries(allTermAverages).forEach(([etape, avg]) => {
            if (avg !== null) {
                globalWeightedSum += avg * termWeights[etape];
                totalWeight += termWeights[etape];
            }
        });

        const globalAverage = totalWeight > 0 ? globalWeightedSum / totalWeight : null;
        return { subjectAverages: allSubjectAverages, termAverages: allTermAverages, globalAverage };
    }

    function calculateSubjectAverage(subject, etapeKey, subjectIndex) {
        let totalWeightedGrade = 0;
        let totalCompetencyWeight = 0;

        subject.competencies.forEach((comp, compIndex) => {
            const compWeightMatch = comp.name.match(/\((\d+)%\)/);
            if (!compWeightMatch) return;
            const compWeight = parseFloat(compWeightMatch[1]);

            let totalAssignmentGrade = 0;
            let totalAssignmentWeight = 0;

            comp.assignments.forEach((assign, assignIndex) => {
                const dataPath = `${etapeKey}-${subjectIndex}-${compIndex}-${assignIndex}`;
                const pondInput = document.querySelector(`.pond-input-field[data-path="${dataPath}"]`);
                const gradeContainer = pondInput.closest('tr').querySelector('.grade-container');
                const gradeInput = gradeContainer.querySelector('.grade-input-field');

                let grade = null;
                if (!gradeInput.classList.contains('hidden') && gradeInput.value.trim() !== '') {
                    grade = parseFloat(gradeInput.value);
                } else {
                    grade = getNumericGrade(assign.result);
                }

                let weight = parseFloat(pondInput.value);

                if (grade !== null && !isNaN(grade) && !isNaN(weight) && weight > 0) {
                    totalAssignmentGrade += grade * weight;
                    totalAssignmentWeight += weight;
                }
            });

            if (totalAssignmentWeight > 0) {
                const competencyAverage = totalAssignmentGrade / totalAssignmentWeight;
                totalWeightedGrade += competencyAverage * compWeight;
                totalCompetencyWeight += compWeight;
            }
        });

        return totalCompetencyWeight > 0 ? totalWeightedGrade / totalCompetencyWeight : null;
    }

    function getUnits() {
        const { niveau, unitesMode, customUnites } = mbsData.settings || {};
        if (unitesMode === 'sans') return new Proxy({}, { get: () => 1 });
        if (unitesMode === 'perso') return customUnites || {};
        return (niveau && defaultUnits[niveau]) ? defaultUnits[niveau] : {};
    }

    // --- UTILITY & FORMATTING ---
    function formatGrade(result) {
        if (!result) return '<span class="no-data">-</span>';
        const numGrade = getNumericGrade(result);
        if (numGrade === null) return result;

        const trimmedResult = result.trim();
        const isLetterGrade = !!gradeMap[trimmedResult];
        const scoreMatch = trimmedResult.match(/(\d+[,.]?\d*)\s*\/\s*(\d+[,.]?\d*)/);

        if (isLetterGrade) {
            return `${trimmedResult} <i>(~<span class="grade-percentage">${numGrade.toFixed(1)}%</span>)</i>`;
        }
        if (scoreMatch) {
            return `<span>${scoreMatch[0]}</span> <span class="grade-percentage">${numGrade.toFixed(1)}%</span>`;
        }
        return `<span class="grade-percentage">${trimmedResult}</span>`;
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelector('.tab-btn.active').classList.remove('active');
                tab.classList.add('active');
                document.querySelector('.tab-content.active').classList.remove('active');
                activeTab = tab.dataset.tab;
                document.getElementById(activeTab).classList.add('active');
                renderSidePanel();
            });
        });

        // Settings
        document.getElementById('niveau-secondaire').addEventListener('change', saveSettings);
        document.getElementById('unites-mode').addEventListener('change', () => {
            saveSettings();
            populateUnitesModal();
        });

        // Modals
        const unitesModal = document.getElementById('unites-modal');
        document.getElementById('unites-btn').addEventListener('click', () => {
            populateUnitesModal();
            unitesModal.classList.add('active');
        });
        document.getElementById('close-unites-modal').addEventListener('click', () => {
            saveCustomUnits();
            unitesModal.classList.remove('active');
        });

        // Ponderation controls
        document.getElementById('save-ponds-btn').addEventListener('click', savePonderations);
        document.getElementById('revert-ponds-btn').addEventListener('click', renderAll);

        // Dynamic content listeners (Event Delegation)
        const tabContents = document.getElementById('tab-contents');
        
        tabContents.addEventListener('input', e => {
            const target = e.target;
            if (target.classList.contains('pond-input-field')) {
                const [etapeKey, subjectIndex, compIndex, assignIndex] = target.dataset.path.split('-');
                const originalPond = mbsData[etapeKey][subjectIndex].competencies[compIndex].assignments[assignIndex].pond;
                target.classList.toggle('modified-input', target.value != originalPond);
                document.getElementById('ponderation-controls').classList.remove('hidden');
                renderSidePanel();
            }
            if (target.classList.contains('grade-input-field')) {
                renderSidePanel();
            }
        });

        tabContents.addEventListener('click', e => {
            const gradeDisplay = e.target.closest('.grade-display');
            if (gradeDisplay) {
                const container = gradeDisplay.closest('.grade-container');
                const inputField = container.querySelector('.grade-input-field');
                const originalResult = container.dataset.originalResult;
                const numericGrade = getNumericGrade(originalResult);
                
                gradeDisplay.classList.add('hidden');
                inputField.classList.remove('hidden');
                inputField.value = numericGrade !== null ? numericGrade.toFixed(2) : '';
                inputField.focus();
                inputField.select();
            }
        });

        tabContents.addEventListener('focusout', e => {
            if (e.target.classList.contains('grade-input-field') && e.target.value.trim() === '') {
                e.target.classList.add('hidden');
                e.target.previousElementSibling.classList.remove('hidden');
                renderSidePanel();
            }
        });

        tabContents.addEventListener('keydown', e => {
            if (e.target.classList.contains('grade-input-field') && (e.key === 'Enter' || e.key === 'Escape')) {
                if (e.key === 'Escape') e.target.value = '';
                e.target.blur();
            }
        });
    }

    // --- START THE APP ---
    init();
});
