// --- CONSTANTS ---
const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
const defaultUnits = {
    sec4: { 'ART': 2, 'MUS': 2, 'DRM': 2, 'FRA': 6, 'ELA': 4, 'EESL': 6, 'ESL': 4, 'MAT': 6, 'CST': 6, 'ST': 4, 'STE': 4, 'HQC': 4, 'CCQ': 2, 'EPS': 2, 'ENT': 2, 'INF': 2, 'PSY': 2 },
    sec5: { 'ART': 2, 'MUS': 2, 'DRM': 2, 'CAT': 4, 'FRA': 6, 'ELA': 6, 'EESL': 6, 'ESL': 4, 'MAT': 6, 'CST': 4, 'MED': 4, 'PSY': 4, 'ENT': 4, 'FIN': 4, 'CHI': 4, 'PHY': 4, 'MON': 2, 'HQC': 4, 'CCQ': 2, 'EPS': 2 }
};
const TERM_WEIGHTS = { etape1: 0.2, etape2: 0.2, etape3: 0.6 };

/**
 * Converts various grade formats into a numeric percentage.
 * @param {string} result The grade string (e.g., "A+", "85,5 / 100", "90%").
 * @returns {number|null} The numeric grade or null if not calculable.
 */
export function getNumericGrade(result) {
    if (!result) return null;
    const trimmedResult = result.trim();
    if (gradeMap[trimmedResult] !== undefined) {
        return gradeMap[trimmedResult];
    }
    const percentageMatch = trimmedResult.match(/(\d+[,.]?\d*)\s*%/);
    if (percentageMatch) {
        return parseFloat(percentageMatch[1].replace(',', '.'));
    }
    const scoreMatch = trimmedResult.match(/(\d+[,.]?\d*)\s*\/\s*(\d+[,.]?\d*)/);
    if (scoreMatch) {
        const score = parseFloat(scoreMatch[1].replace(',', '.'));
        const maxScore = parseFloat(scoreMatch[2].replace(',', '.'));
        if (!isNaN(score) && !isNaN(maxScore) && maxScore > 0) {
            return (score / maxScore) * 100;
        }
    }
    return null;
}

/**
 * Calculates the average for a single subject based on source data.
 * @param {object} subject The subject object from mbsData.
 * @returns {number|null} The subject's average or null.
 */
function calculateSubjectAverageFromSource(subject) {
    let totalWeightedGrade = 0;
    let totalCompetencyWeight = 0;

    subject.competencies.forEach(comp => {
        const compWeightMatch = comp.name.match(/\((\d+)%\)/);
        if (!compWeightMatch) return;
        const compWeight = parseFloat(compWeightMatch[1]);

        let totalAssignmentGrade = 0;
        let totalAssignmentWeight = 0;

        comp.assignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            const weight = parseFloat(assign.pond);

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

/**
 * Calculates all averages based on the provided data object (ignoring DOM).
 * This is used for recording history and can be used for the performance page.
 * @param {object} mbsData The main data object from storage.
 * @returns {object} An object containing all calculated averages.
 */
export function calculateAveragesFromSource(mbsData) {
    const { settings, etape1, etape2, etape3 } = mbsData;
    const { niveau, unitesMode, customUnites } = settings;
    const termData = { etape1, etape2, etape3 };
    let termAverages = { etape1: null, etape2: null, etape3: null };

    // Determine units based on settings
    let units = {};
    if (unitesMode === 'defaut' && niveau && defaultUnits[niveau]) {
        units = defaultUnits[niveau];
    } else if (unitesMode === 'perso') {
        units = customUnites;
    } else if (unitesMode === 'sans') {
        units = new Proxy({}, { get: () => 1 });
    }

    // Calculate term averages
    for (const etapeKey in termAverages) {
        if (termData[etapeKey] && termData[etapeKey].length > 0 && niveau) {
            let termWeightedSum = 0;
            let termUnitSum = 0;
            termData[etapeKey].forEach(subject => {
                const average = calculateSubjectAverageFromSource(subject);
                if (average !== null) {
                    const codePrefix = subject.code.substring(0, 3);
                    const unit = units[codePrefix] ?? 2; // Default to 2 units if not found
                    termWeightedSum += average * unit;
                    termUnitSum += unit;
                }
            });
            termAverages[etapeKey] = termUnitSum > 0 ? termWeightedSum / termUnitSum : null;
        }
    }

    // Calculate global average using hardcoded weights
    let globalWeightedSum = 0;
    let totalWeightUsed = 0;
    for (const etapeKey in termAverages) {
        if (termAverages[etapeKey] !== null) {
            globalWeightedSum += termAverages[etapeKey] * TERM_WEIGHTS[etapeKey];
            totalWeightUsed += TERM_WEIGHTS[etapeKey];
        }
    }
    
    const globalAverage = totalWeightUsed > 0 ? globalWeightedSum / totalWeightUsed : null;

    return { termAverages, globalAverage };
}
