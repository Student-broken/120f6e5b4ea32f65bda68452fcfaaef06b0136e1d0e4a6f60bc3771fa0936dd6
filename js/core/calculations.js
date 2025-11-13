
// --- Grade Conversion & Constants ---
const GRADE_MAP = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
const DEFAULT_UNITS = { sec4: { 'ART': 2, 'MUS': 2, 'DRM': 2, 'FRA': 6, 'ELA': 4, 'EESL': 6, 'ESL': 4, 'MAT': 6, 'CST': 6, 'ST': 4, 'STE': 4, 'HQC': 4, 'CCQ': 2, 'EPS': 2, 'ENT': 2, 'INF': 2, 'PSY': 2, }, sec5: { 'ART': 2, 'MUS': 2, 'DRM': 2, 'CAT': 4, 'FRA': 6, 'ELA': 6, 'EESL': 6, 'ESL': 4, 'MAT': 6, 'CST': 4, 'MED': 4, 'PSY': 4, 'ENT': 4, 'FIN': 4, 'CHI': 4, 'PHY': 4, 'MON': 2, 'HQC': 4, 'CCQ': 2, 'EPS': 2, 'FIN': 2 } };
const ETAPE_WEIGHTS = { etape1: 0.20, etape2: 0.20, etape3: 0.60 };

/**
 * Converts various grade formats (letter, score, %) into a single numeric percentage.
 * @param {string} result - The grade string (e.g., "A-", "85,5 / 100", "92%").
 * @returns {number|null} The grade as a percentage, or null if invalid.
 */
export function getNumericGrade(result) {
    if (!result) return null;
    const trimmedResult = result.trim();
    if (GRADE_MAP[trimmedResult] !== undefined) {
        return GRADE_MAP[trimmedResult];
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
 * Calculates a single subject's average based on its competencies and assignments.
 * This version reads directly from the provided data object, NOT the DOM.
 * @param {object} subject - The subject object from mbsData.
 * @returns {number|null} The subject's average, or null if incalculable.
 */
export function calculateSubjectAverage(subject) {
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
 * Calculates all averages (per-subject, per-term, and global) from the source data.
 * @param {object} mbsData - The complete data object from storage.
 * @returns {object} An object containing all calculated averages.
 */
export function calculateAllAverages(mbsData) {
    const termAverages = { etape1: null, etape2: null, etape3: null };
    const subjectAverages = { etape1: {}, etape2: {}, etape3: {} };
    const { settings, etape1, etape2, etape3 } = mbsData;
    const etapes = { etape1, etape2, etape3 };
    const units = settings.niveau ? DEFAULT_UNITS[settings.niveau] : {};

    for (const etapeKey in etapes) {
        const subjects = etapes[etapeKey];
        if (!subjects || subjects.length === 0) continue;

        let termWeightedSum = 0;
        let termUnitSum = 0;

        subjects.forEach(subject => {
            const average = calculateSubjectAverage(subject);
            subjectAverages[etapeKey][subject.code] = average;
            
            if (average !== null && settings.niveau) {
                const codePrefix = subject.code.substring(0, 3);
                // In 'defaut' mode, use defined units, otherwise default to 2.
                // For this tool, we assume 'defaut' mode is always used for calculation.
                const unit = units[codePrefix] ?? 2;
                termWeightedSum += average * unit;
                termUnitSum += unit;
            }
        });
        
        termAverages[etapeKey] = termUnitSum > 0 ? termWeightedSum / termUnitSum : null;
    }

    // Global Average Calculation with hardcoded 20/20/60 weights
    let globalWeightedSum = 0;
    let totalWeightUsed = 0;

    for (const etapeKey in termAverages) {
        if (termAverages[etapeKey] !== null) {
            globalWeightedSum += termAverages[etapeKey] * ETAPE_WEIGHTS[etapeKey];
            totalWeightUsed += ETAPE_WEIGHTS[etapeKey];
        }
    }
    
    // Normalize the average in case a term is missing
    const globalAverage = totalWeightUsed > 0 ? globalWeightedSum / totalWeightUsed : null;

    return { subjectAverages, termAverages, globalAverage };
}
