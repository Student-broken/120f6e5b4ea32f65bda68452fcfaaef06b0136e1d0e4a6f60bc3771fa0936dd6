import { getNumericGrade } from '../core/calculations.js';

const subjectList = { 'ART': "Arts Plastiques", 'MUS': "Musique", 'DRM': "Art Dramatique", 'CAT': "Conception et Application Technologique", 'FRA': "Français", 'ELA': "English Language Arts", 'EESL': "Enriched English", 'ESL': "English Second Language", 'SN': "Math SN", 'CST': "Math CST", 'ST': "Science et Technologie", 'STE': "Science et Tech. Env.", 'HQC': "Histoire", 'CCQ': "Culture et Citoyenneté", 'EPS': "Éducation Physique", 'CHI': "Chimie", 'PHY': "Physique", 'MON': "Monde Contemporain", 'MED': "Média", 'ENT': "Entrepreneuriat", 'INF': "Informatique", 'PSY': "Psychologie", 'FIN': "Éducation Financière" };

/**
 * Renders a complete subject table DOM element.
 * @param {object} subject The subject data object.
 * @returns {HTMLElement} The generated table element.
 */
export function renderSubjectTable(subject) {
    const table = document.createElement('table');
    table.className = 'subject-table';
    table.innerHTML = `
        <thead>
            <tr><th colspan="7">${subject.code} - ${subject.name}</th></tr>
            <tr>
                <th>Catégorie</th><th>Travail</th><th>Pond.</th>
                <th>Assigné le</th><th>Dû le</th><th>Résultat</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    if (subject.competencies.length === 0) {
        const noCompRow = document.createElement('tr');
        noCompRow.innerHTML = `<td colspan="7" class="no-data">Aucune compétence ou travail trouvé pour cette matière.</td>`;
        tbody.appendChild(noCompRow);
        return table;
    }

    subject.competencies.forEach((comp, compIndex) => {
        const compRow = document.createElement('tr');
        compRow.className = 'competency-row';
        compRow.innerHTML = `<td colspan="7">${comp.name}</td>`;
        tbody.appendChild(compRow);

        if (comp.assignments.length === 0) {
            const noAssignRow = document.createElement('tr');
            noAssignRow.innerHTML = `<td colspan="7" class="no-data" style="padding-left: 40px;">Aucun travail pour cette compétence.</td>`;
            tbody.appendChild(noAssignRow);
        } else {
            comp.assignments.forEach((assign, assignIndex) => {
                const assignRow = document.createElement('tr');
                const uniqueId = `${subject.code}-${compIndex}-${assignIndex}`;
                
                const numGrade = getNumericGrade(assign.result);
                let formattedResult = '<span class="no-data">-</span>';
                if (assign.result) {
                    const trimmedResult = assign.result.trim();
                    if (trimmedResult.includes('/')) {
                        const scoreMatch = trimmedResult.match(/(\d+[,.]?\d*)\s*\/\s*(\d+[,.]?\d*)/);
                        if (scoreMatch && numGrade !== null) {
                            formattedResult = `(${scoreMatch[0]}) <span class="grade-percentage">${numGrade.toFixed(1)}%</span>`;
                        } else {
                            formattedResult = trimmedResult;
                        }
                    } else if (numGrade !== null) {
                        formattedResult = `<span class="grade-percentage">${numGrade.toFixed(1)}%</span>`;
                    } else {
                        formattedResult = trimmedResult;
                    }
                }

                assignRow.innerHTML = `
                    <td>${assign.category || '<span class="no-data">-</span>'}</td>
                    <td>${assign.work || '<span class="no-data">-</span>'}</td>
                    <td><input type="number" class="pond-input-field" value="${assign.pond || ''}" data-row-id="${uniqueId}" min="0" max="100" placeholder="--"></td>
                    <td>${assign.assignedDate || '<span class="no-data">-</span>'}</td>
                    <td>${assign.dueDate ? assign.dueDate.replace('à', '') : '<span class="no-data">-</span>'}</td>
                    <td>
                        <div class="grade-container" data-row-id="${uniqueId}" data-original-result="${assign.result || ''}">
                            <span class="grade-display">${formattedResult}</span>
                            <input type="number" class="grade-input-field hidden" data-row-id="${uniqueId}" min="0" max="100">
                        </div>
                    </td>
                `;
                tbody.appendChild(assignRow);
            });
        }
    });
    return table;
}

/**
 * Populates the units configuration modal with all subjects found in the data.
 * @param {object} mbsData The main data object.
 */
export function populateUnitesModal(mbsData) {
    const listContainer = document.getElementById('unites-list');
    const { settings, etape1, etape2, etape3 } = mbsData;
    const mode = settings.unitesMode || 'defaut';
    listContainer.innerHTML = '';
    
    const allSubjects = new Map();
    [etape1, etape2, etape3].forEach(etape => {
        if (etape) {
            etape.forEach(subject => {
                const codePrefix = subject.code.substring(0, 3);
                if (!allSubjects.has(codePrefix)) {
                    allSubjects.set(codePrefix, subjectList[codePrefix] || subject.name);
                }
            });
        }
    });

    if (allSubjects.size === 0) {
        listContainer.innerHTML = '<div class="no-data">Aucune matière trouvée.</div>';
        return;
    }

    // Sort subjects alphabetically by name
    const sortedSubjects = [...allSubjects.entries()].sort((a, b) => a[1].localeCompare(b[1]));

    sortedSubjects.forEach(([code, name]) => {
        const item = document.createElement('div');
        item.className = 'unite-item';
        let valueDisplay = '';

        if (mode === 'perso') {
            const currentValue = (settings.customUnites || {})[code] || 2;
            valueDisplay = `<input type="number" data-code="${code}" value="${currentValue}" min="0" step="1">`;
        } else {
            let unitValue = 2; // Default
            if (mode === 'sans') {
                unitValue = 1;
            } else if (mode === 'defaut' && settings.niveau && defaultUnits[settings.niveau]) {
                unitValue = defaultUnits[settings.niveau][code] ?? 2;
            }
            valueDisplay = `<span>${unitValue}</span>`;
        }
        item.innerHTML = `<label>${name} (${code})</label>${valueDisplay}`;
        listContainer.appendChild(item);
    });
}
