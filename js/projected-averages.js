// projected-averages.js - CORE ALGORITHMS AND DATA

// Constants/Data
const gradeMap = { 'A+': 100, 'A': 95, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D+': 55, 'D': 50, 'E': 45 };
const defaultUnits = { sec4: { 'ART': 2, 'MUS': 2, 'DRM': 2, 'FRA': 6, 'ELA': 4, 'EESL': 6, 'ESL': 4, 'MAT': 6, 'CST': 6, 'ST': 4, 'STE': 4, 'HQC': 4, 'CCQ': 2, 'EPS': 2, 'ENT': 2, 'INF': 2, 'PSY': 2, 'SN': 6 }, sec5: { 'ART': 2, 'MUS': 2, 'DRM': 2, 'CAT': 4, 'FRA': 6, 'ELA': 6, 'EESL': 6, 'ESL': 4, 'MAT': 6, 'CST': 4, 'MED': 4, 'PSY': 4, 'ENT': 4, 'FIN': 4, 'CHI': 4, 'PHY': 4, 'MON': 2, 'HQC': 4, 'CCQ': 2, 'EPS': 2, 'SN': 6 } };
const subjectList = { 'ART': "Arts Plastiques", 'MUS': "Musique", 'DRM': "Art Dramatique", 'CAT': "Conception et Application Technologique", 'FRA': "Français", 'ELA': "English Language Arts", 'EESL': "Anglais enrichi", 'ESL': "Anglais langue seconde", 'SN': "Math SN", 'CST': "Math CST", 'ST': "Science et Technologie", 'STE': "Science et Tech. Env.", 'HQC': "Histoire", 'CCQ': "Culture et Citoyenneté", 'EPS': "Éducation Physique", 'CHI': "Chimie", 'PHY': "Physique", 'MON': "Monde Contemporain", 'MED': "Média", 'ENT': "Entrepreneuriat", 'INF': "Informatique", 'PSY': "Psychologie", 'FIN': "Éducation Financière" };
const subjectGroups = { 'STEM': ['MAT', 'CST', 'SN', 'ST', 'STE', 'CHI', 'PHY', 'CAT', 'INF', 'FIN'], 'Langues': ['FRA', 'ELA', 'EESL', 'ESL'], 'Sciences Humaines': ['HQC', 'CCQ', 'MON', 'PSY', 'ENT', 'MED'], 'Arts & Autre': ['ART', 'MUS', 'DRM', 'EPS'] };
const TERM_WEIGHTS = { etape1: 0.20, etape2: 0.20, etape3: 0.60 };
const KNOWN_ETAPE_KEYS = ['etape1', 'etape2']; 
const NUM_MONTE_CARLO_RUNS = 100000; 
const AI_R2_THRESHOLD = 0.25; 

// --- CORE MATH & STATS ---

function linearRegression(x_values, y_values) {
    let x_sum = 0; let y_sum = 0; let xy_sum = 0; let x2_sum = 0;
    let n = x_values.length;
    if (n < 2 || n !== y_values.length) return { slope: 0, r2: 0, intercept: y_values[0] || 0 };
    for (let i = 0; i < n; i++) {
        const x = x_values[i]; const y = y_values[i];
        x_sum += x; y_sum += y; xy_sum += x * y; x2_sum += x * x;
    }
    const m_numerator = (n * xy_sum - x_sum * y_sum);
    const m_denominator = (n * x2_sum - x_sum * x_sum);
    const m = (m_denominator === 0) ? 0 : m_numerator / m_denominator;
    const b = (y_sum - m * x_sum) / n;
    let ss_total = 0; let ss_res = 0;
    const y_mean = y_sum / n;
    for (let i = 0; i < n; i++) {
        const y_pred = m * x_values[i] + b;
        ss_res += Math.pow(y_values[i] - y_pred, 2);
        ss_total += Math.pow(y_values[i] - y_mean, 2);
    }
    const r2 = (ss_total === 0) ? 1 : 1 - (ss_res / ss_total);
    return { slope: m, intercept: b, r2: r2 };
}

function standardNormalCDF(z) {
    function erf(x) {
        const p = 0.3275911; const a1 = 0.254829592; const a2 = -0.284496736;
        const a3 = 1.421413741; const a4 = -1.453152027; const a5 = 1.061405429;
        const sign = (x >= 0) ? 1 : -1;
        const t = 1 / (1 + p * Math.abs(x));
        const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return sign * y;
    }
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function calculateStdDev(grades) {
    if (grades.length < 2) return 0;
    const mean = grades.reduce((a, b) => a + b) / grades.length;
    const variance = grades.reduce((sum, grade) => sum + Math.pow(grade - mean, 2), 0) / (grades.length - 1); 
    return Math.sqrt(variance); 
}

function calculateConsistencyScore(grades) {
    const stdDev = calculateStdDev(grades);
    return Math.max(0, 100 - (stdDev * 2));
}

// --- DATA PROCESSING HELPERS ---

function getNumericGrade(result) {
    if (!result) return null;
    const trimmed = result.trim().toLowerCase();
    if (trimmed === 'absent' || trimmed === 'abs' || trimmed === '0' || trimmed === '0%') return 0;
    if (trimmed === 'exempt' || trimmed === 'n/a' || trimmed === 'retard' || trimmed === 'remis' || trimmed === '') return null;
    const originalTrimmed = result.trim();
    if (gradeMap[originalTrimmed]) return gradeMap[originalTrimmed];
    const percentageMatch = trimmed.match(/(\d+[,.]?\d*)\s*%/);
    if (percentageMatch) return parseFloat(percentageMatch[1].replace(',', '.'));
    const scoreMatch = trimmed.match(/(\d+[,.]?\d*)\s*\/\s*(\d+[,.]?\d*)/);
    if (scoreMatch) {
        const score = parseFloat(scoreMatch[1].replace(',', '.'));
        const max = parseFloat(scoreMatch[2].replace(',', '.'));
        return (max > 0) ? (score / max) * 100 : null;
    }
    const plainNumber = parseFloat(trimmed);
    if (!isNaN(plainNumber) && plainNumber >= 0 && plainNumber <= 110) return plainNumber;
    return null; 
}

function getUnits(settings) {
    const { niveau, unitesMode, customUnites } = settings || {};
    if (unitesMode === 'sans') return new Proxy({}, { get: () => 1 });
    if (unitesMode === 'perso') return customUnites || {};
    return (niveau && defaultUnits[niveau]) ? defaultUnits[niveau] : {};
}

function extractAssignmentData(subject) {
    let allGrades = []; let allPondérations = []; let allCompWeights = []; 
    subject.competencies.forEach((comp) => {
        const compWeightMatch = comp.name.match(/\((\d+)%\)/);
        const compWeight = compWeightMatch ? parseFloat(compWeightMatch[1]) : 0;
        comp.assignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            const pondération = parseFloat(assign.pond || 0);
            if (grade !== null && !isNaN(grade) && pondération > 0 && compWeight > 0) {
                allGrades.push(grade); allPondérations.push(pondération); allCompWeights.push(compWeight); 
            }
        });
    });
    return { allGrades, allPondérations, allCompWeights }; 
}

function calculateSubjectAverageAndStats(subject) {
    let totalWeightedGrade = 0; let totalCompetencyWeight = 0; let competencyAverages = [];
    const { allGrades, allPondérations, allCompWeights } = extractAssignmentData(subject);

    subject.competencies.forEach((comp, compIndex) => {
        const compWeightMatch = comp.name.match(/\((\d+)%\)/);
        const compWeight = compWeightMatch ? parseFloat(compWeightMatch[1]) : 0;
        if (compWeight === 0) return;
        let totalAssignmentGrade = 0; let totalAssignmentWeight = 0; let numAssignments = 0;
        comp.assignments.forEach(assign => {
            const grade = getNumericGrade(assign.result);
            let weight = parseFloat(assign.pond || 0);
            if (grade !== null && !isNaN(grade) && !isNaN(weight) && weight > 0) {
                totalAssignmentGrade += grade * weight;
                totalAssignmentWeight += weight;
                numAssignments++;
            }
        });
        let compAvg = null;
        if (totalAssignmentWeight > 0) {
            compAvg = totalAssignmentGrade / totalAssignmentWeight;
            totalWeightedGrade += compAvg * (compWeight / 100);
            totalCompetencyWeight += (compWeight / 100);
        }
        competencyAverages.push({ avg: compAvg, numAssignments });
    });

    const subjectAverage = totalCompetencyWeight > 0 ? (totalWeightedGrade / totalCompetencyWeight) : null;
    const overallConsistency = allGrades.length >= 2 ? calculateConsistencyScore(allGrades) : 100;
    const stdDev = allGrades.length >= 2 ? calculateStdDev(allGrades) : 0;
    
    return { subjectAverage, allGrades, allPondérations, allCompWeights, overallConsistency, stdDev, competencyAverages };
}

function calculateWeightedFinalAvg(etape1Avg, etape2Avg, etape3Avg) {
    let weightedSum = 0; let totalWeight = 0;
    if (etape1Avg !== null) { weightedSum += etape1Avg * TERM_WEIGHTS.etape1; totalWeight += TERM_WEIGHTS.etape1; }
    if (etape2Avg !== null) { weightedSum += etape2Avg * TERM_WEIGHTS.etape2; totalWeight += TERM_WEIGHTS.etape2; }
    if (etape3Avg !== null) { weightedSum += etape3Avg * TERM_WEIGHTS.etape3; totalWeight += TERM_WEIGHTS.etape3; }
    return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function calculateProbability(mean, stdDev, requiredTarget) {
    if (mean === null) return 0;
    if (requiredTarget > 100) return 0;
    if (stdDev <= 0.1) return mean >= requiredTarget ? 100 : 0;
    const z = (requiredTarget - mean) / stdDev;
    const prob = 1 - standardNormalCDF(z); 
    return prob * 100;
}

function calculateBurnoutRisk(niveau, globalStdDev, units, globalTrend, absenceRate) {
    if (!niveau) return 0;
    let totalUnits = Object.values(units).reduce((sum, u) => sum + (u || 0), 0);
    let workloadScore = Math.min(100, (totalUnits / 32) * 100);
    let volatilityScore = Math.min(100, (globalStdDev / 15) * 100);
    let trendScore = Math.min(100, Math.max(0, (globalTrend.slope / -2) * 100));
    let absenceScore = Math.min(100, (absenceRate / 0.15) * 100);
    const finalScore = (workloadScore * 0.20) + (volatilityScore * 0.35) + (trendScore * 0.35) + (absenceScore * 0.10);     
    return Math.min(100, Math.max(0, finalScore));
}

function runMonteCarloSimulation(globalAverageKnown, termAverages, subjectAverages, subjectTrends, subjectOverallStats, units, globalStdDev) {
    const globalPred = { p5: null, p25: null, p50: null, p75: null, p95: null, trend: null };
    const subjectPreds = {};
    const avg1 = termAverages.etape1;
    const avg2 = termAverages.etape2;
    let currentKnownGlobalSum = 0;
    let totalKnownWeight = 0;
    if (avg1 !== null) { currentKnownGlobalSum += avg1 * TERM_WEIGHTS.etape1; totalKnownWeight += TERM_WEIGHTS.etape1; }
    if (avg2 !== null) { currentKnownGlobalSum += avg2 * TERM_WEIGHTS.etape2; totalKnownWeight += TERM_WEIGHTS.etape2; }
    const totalWeight = TERM_WEIGHTS.etape1 + TERM_WEIGHTS.etape2 + TERM_WEIGHTS.etape3;
    const remainingWeight = totalWeight - totalKnownWeight;
    let predictedE3SMean = globalAverageKnown || 75;
    let predictedE3SSigma = globalStdDev || 5;
    if (remainingWeight <= 0) {
         globalPred.p5 = globalPred.p25 = globalPred.p50 = globalPred.p75 = globalPred.p95 = globalAverageKnown;
         globalPred.trend = globalAverageKnown;
         return { predictions: { global: globalPred, subjects: subjectPreds }, predictedE3SMean, predictedE3SSigma };
    }
    const relevantSubjects = Object.keys(subjectOverallStats).filter(code => units[code] && subjectOverallStats[code].numGrades > 0);
    if (relevantSubjects.length === 0) {
         return { predictions: { global: globalPred, subjects: subjectPreds }, predictedE3SMean, predictedE3SSigma };
    }
    let sMeanWeightedSum = 0; let sMeanUnitSum = 0; let sSigmaSquaredWeightedSum = 0; let sSigmaUnitSum = 0; 
    relevantSubjects.forEach(code => {
        const subjStats = subjectOverallStats[code];
        const unit = units[code] || 2;
        let fsp = subjStats.stdDev;
        if (subjStats.numGrades < 3) fsp = Math.max(fsp, 3.0); 
        fsp = Math.min(20, Math.max(0.5, fsp)); 
        const trend = subjStats.trend;
        const n = subjStats.allGrades.length;
        let projectedGrade = trend.intercept + trend.slope * (n + 1);
        const currentMean = n > 0 ? subjStats.allGrades.reduce((a, b) => a + b, 0) / n : (subjectAverages.etape2?.[code]?.average || subjectAverages.etape1?.[code]?.average || 75);
        const confidence = (trend.r2 > 0.1) ? trend.r2 : 0;
        let adjustedMean = (projectedGrade * confidence) + (currentMean * (1 - confidence));
        if (n === 0) {
             adjustedMean = subjectAverages.etape2?.[code]?.average !== undefined ? subjectAverages.etape2?.[code]?.average : (subjectAverages.etape1?.[code]?.average !== undefined ? subjectAverages.etape1?.[code]?.average : 75);
        }
        const historicalMax = subjStats.allGrades.length > 0 ? Math.max(...subjStats.allGrades) : 100;
        const e3PredictionCap = Math.min(100, Math.max(80, historicalMax * 1.05)); 
        const finalAdjustedMeanE3 = Math.min(e3PredictionCap, Math.max(40, adjustedMean)); 
        let nd = (100 - currentMean) * (1 + fsp / 10);
        nd = Math.min(100, Math.max(0, nd));
        subjectPreds[code] = { 
            mpp: (currentMean > 0) ? (finalAdjustedMeanE3 / currentMean) : 1, 
            fsp: fsp, consistency: subjStats.overallConsistency,
            drsTrendAvg: currentMean, adjustedMean: finalAdjustedMeanE3, 
            e3PredictionCap: e3PredictionCap, nd: nd,
            mismatchScore: fsp * (100 - subjStats.overallConsistency) / 10, 
            predictionFinal: null 
        };
        sMeanWeightedSum += finalAdjustedMeanE3 * unit; 
        sMeanUnitSum += unit;
        sSigmaSquaredWeightedSum += Math.pow(fsp, 2) * unit; 
        sSigmaUnitSum += unit;
    });
    predictedE3SMean = sMeanUnitSum > 0 ? sMeanWeightedSum / sMeanUnitSum : globalAverageKnown || 75;
    const predictedE3SVariance = sSigmaUnitSum > 0 ? sSigmaSquaredWeightedSum / sSigmaUnitSum : Math.pow(globalStdDev, 2) || 25;
    predictedE3SSigma = Math.sqrt(predictedE3SVariance);
    let finalGlobalGrades = [];
    for (let i = 0; i < NUM_MONTE_CARLO_RUNS; i++) {
        const u1 = Math.random(); const u2 = Math.random();
        let z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        let predictedE3AvgGlobal = Math.min(100, Math.max(0, predictedE3SMean + z * predictedE3SSigma));
        const finalGlobalGrade = (currentKnownGlobalSum + predictedE3AvgGlobal * remainingWeight) / totalWeight;
        finalGlobalGrades.push(finalGlobalGrade);
        
        if (i === 0) {
             relevantSubjects.forEach(code => {
                const subjPred = subjectPreds[code];
                const subjAvg1 = subjectAverages.etape1?.[code]?.average || null;
                const subjAvg2 = subjectAverages.etape2?.[code]?.average || null;
                let predictedE3Avg = subjPred.adjustedMean; 
                const finalGrade = calculateWeightedFinalAvg(subjAvg1, subjAvg2, predictedE3Avg);
                subjPred.predictionFinal = finalGrade;
             });
        }
    }
    finalGlobalGrades.sort((a, b) => a - b);
    globalPred.p5 = finalGlobalGrades[Math.floor(NUM_MONTE_CARLO_RUNS * 0.05)] || 0;
    globalPred.p25 = finalGlobalGrades[Math.floor(NUM_MONTE_CARLO_RUNS * 0.25)] || 0;
    globalPred.p50 = finalGlobalGrades[Math.floor(NUM_MONTE_CARLO_RUNS * 0.50)] || 0;
    globalPred.p75 = finalGlobalGrades[Math.floor(NUM_MONTE_CARLO_RUNS * 0.75)] || 0;
    globalPred.p95 = finalGlobalGrades[Math.floor(NUM_MONTE_CARLO_RUNS * 0.95)] || 0;
    globalPred.trend = finalGlobalGrades.reduce((a, b) => a + b) / NUM_MONTE_CARLO_RUNS;
     Object.keys(subjectPreds).forEach(code => {
        if (subjectPreds[code].predictionFinal === null) {
            const subjAvg1 = subjectAverages.etape1?.[code]?.average || null;
            const subjAvg2 = subjectAverages.etape2?.[code]?.average || null;
            let trendAvg = subjAvg2 !== null ? subjAvg2 : (subjAvg1 !== null ? subjAvg1 : 75); 
            subjectPreds[code].predictionFinal = trendAvg;
        }
    });
    return { predictions: { global: globalPred, subjects: subjectPreds }, predictedE3SMean, predictedE3SSigma };
}

function calculatePathAnalysis(targetEtapeKey, allTermAverages, predictedMean, predictedStdDev) {
    const probabilityAnalysis = {};
    const targets = [95, 92, 90, 88, 85, 80, 75, 70, 60];
    let currentKnownGlobalSum = 0;
    let knownWeight = 0;
    let remainingWeight = 0;
    const totalWeight = TERM_WEIGHTS.etape1 + TERM_WEIGHTS.etape2 + TERM_WEIGHTS.etape3; 
    if (targetEtapeKey === 'etape2') {
        if (allTermAverages.etape1 !== null) {
            currentKnownGlobalSum = allTermAverages.etape1 * TERM_WEIGHTS.etape1;
            knownWeight = TERM_WEIGHTS.etape1;
        }
        currentKnownGlobalSum += predictedMean * TERM_WEIGHTS.etape3;
        remainingWeight = TERM_WEIGHTS.etape2;
    } else { 
        if (allTermAverages.etape1 !== null) {
            currentKnownGlobalSum += allTermAverages.etape1 * TERM_WEIGHTS.etape1;
            knownWeight += TERM_WEIGHTS.etape1;
        }
        if (allTermAverages.etape2 !== null) {
            currentKnownGlobalSum += allTermAverages.etape2 * TERM_WEIGHTS.etape2;
            knownWeight += TERM_WEIGHTS.etape2;
        }
        remainingWeight = TERM_WEIGHTS.etape3;
    }
    if (remainingWeight <= 0) {
         targets.forEach(t => { probabilityAnalysis[t] = { requiredAvg: null, prob: 0 }; });
         return probabilityAnalysis;
    }
    targets.forEach(target => {
        const requiredAvg = (target * totalWeight - currentKnownGlobalSum) / remainingWeight;
        const prob = calculateProbability(predictedMean, predictedStdDev, requiredAvg);
        probabilityAnalysis[target] = { requiredAvg: requiredAvg, prob: prob };
    });
    return probabilityAnalysis;
}

// --- MAIN ANALYSIS FUNCTION ---

function calculateAllAnalysis(mbsData) {
    const settings = mbsData.settings || {};
    const units = getUnits(settings);
    const niveau = settings.niveau;
    let allTermAverages = { etape1: null, etape2: null, etape3: null };
    let allSubjectAverages = {};
    let allSubjectStats = {}; 
    let allSubjectOverallStats = {}; 
    let aiDataStore = { 'Global': { grades: [], pondérations: [], compWeights: [], codes: new Set() } };
    Object.keys(subjectGroups).forEach(groupName => { aiDataStore[groupName] = { grades: [], pondérations: [], compWeights: [], codes: new Set() }; });

    // 1. Calculate Averages and Stats per Subject/Etape
    KNOWN_ETAPE_KEYS.forEach(etape => {
        if (!mbsData[etape]) return;
        allSubjectAverages[etape] = {};
        mbsData[etape].forEach((subject) => {
            const codePrefix = subject.code.substring(0, 3);
            const { subjectAverage, allGrades, allPondérations, allCompWeights, overallConsistency, stdDev, competencyAverages } = calculateSubjectAverageAndStats(subject);
            aiDataStore['Global'].codes.add(codePrefix); aiDataStore['Global'].grades.push(...allGrades);
            aiDataStore['Global'].pondérations.push(...allPondérations); aiDataStore['Global'].compWeights.push(...allCompWeights);

            for (const groupName in subjectGroups) {
                if (subjectGroups[groupName].includes(codePrefix)) {
                    aiDataStore[groupName].grades.push(...allGrades);
                    aiDataStore[groupName].pondérations.push(...allPondérations); 
                    aiDataStore[groupName].compWeights.push(...allCompWeights);
                    aiDataStore[groupName].codes.add(codePrefix); 
                    break; 
                }
            }
            allSubjectAverages[etape][codePrefix] = { name: subjectList[codePrefix] || subject.name, average: subjectAverage };
            allSubjectStats[codePrefix] = allSubjectStats[codePrefix] || {};
            allSubjectStats[codePrefix][etape] = { overallConsistency, stdDev, competencyAverages, allGrades, allPondérations, allCompWeights, numGrades: allGrades.length };
        });
    });

    // 1.5 Calculate Overall Subject Stats (across all known terms)
    Object.keys(allSubjectStats).forEach(code => {
        let grades = []; let pondérations = []; let compWeights = []; let allConsistencies = []; let totalNumGrades = 0;
        KNOWN_ETAPE_KEYS.forEach(etape => {
            if (allSubjectStats[code][etape]) {
                grades.push(...allSubjectStats[code][etape].allGrades);
                pondérations.push(...allSubjectStats[code][etape].allPondérations);
                compWeights.push(...allSubjectStats[code][etape].allCompWeights);
                allConsistencies.push(allSubjectStats[code][etape].overallConsistency);
                totalNumGrades += allSubjectStats[code][etape].numGrades;
            }
        });
        if (totalNumGrades > 0) { aiDataStore[subjectList[code] || code] = { grades: grades, pondérations: pondérations, compWeights: compWeights, codes: new Set([code]) }; }
        const overallStdDev = calculateStdDev(grades);
        const overallConsistency = allConsistencies.length > 0 ? allConsistencies.reduce((a, b) => a + b) / allConsistencies.length : 100;
        const trend = linearRegression(grades.map((g, i) => i), grades); 
        allSubjectOverallStats[code] = { allGrades: grades, allPondérations: pondérations, allCompWeights: compWeights, stdDev: overallStdDev, overallConsistency, numGrades: totalNumGrades, trend: trend };
    });
    
    // 2. Global Averages
    let globalWeightedSum = 0;
    let totalKnownWeight = 0;
    KNOWN_ETAPE_KEYS.forEach(etape => {
        let termWeightedSum = 0;
        let termUnitSum = 0;
        Object.keys(allSubjectAverages[etape] || {}).forEach(codePrefix => {
            const avg = allSubjectAverages[etape][codePrefix].average;
            if (avg !== null && niveau) {
                const unit = units[codePrefix] || 2;
                termWeightedSum += avg * unit;
                termUnitSum += unit;
            }
        });
        allTermAverages[etape] = termUnitSum > 0 ? termWeightedSum / termUnitSum : null;
        if (allTermAverages[etape] !== null) {
            globalWeightedSum += allTermAverages[etape] * TERM_WEIGHTS[etape];
            totalKnownWeight += TERM_WEIGHTS[etape];
        }
    });
    const globalAverageKnown = totalKnownWeight > 0 ? globalWeightedSum / totalKnownWeight : null;

    // 3. Global Statistics & AI DISCOVERY ENGINE
    const globalStdDev = calculateStdDev(aiDataStore['Global'].grades);
    const globalConsistencyScore = calculateConsistencyScore(aiDataStore['Global'].grades);
    
    let aiModels = [];
    for (const categoryName in aiDataStore) {
        const data = aiDataStore[categoryName];
        if (data.grades.length < 5) continue; 
        const codesArray = Array.from(data.codes);
        aiModels.push({ name: `${categoryName} (Tendance)`, type: 'insight-trend', model: linearRegression(data.grades.map((g, i) => i), data.grades), data: { ...data, codes: codesArray } });
        aiModels.push({ name: `${categoryName} (Focus)`, type: 'insight-focus', model: linearRegression(data.pondérations, data.grades), data: { ...data, codes: codesArray } });
        aiModels.push({ name: `${categoryName} (Priorité)`, type: 'insight-priority', model: linearRegression(data.compWeights, data.grades), data: { ...data, codes: codesArray } });
    }
    
    // 4. Subject Trends
    let subjectTrends = {}; 
    Object.keys(allSubjectOverallStats).forEach(code => { subjectTrends[code] = allSubjectOverallStats[code].trend; });
    
    // 5. Burnout Risk
    const globalTrendModel = aiModels.find(m => m.name === 'Global (Tendance)');
    const globalTrend = globalTrendModel ? globalTrendModel.model : { slope: 0, r2: 0 };
    const absenceRate = parseFloat(settings.absenceRate || 5) / 100;
    let burnoutRiskScore = calculateBurnoutRisk(niveau, globalStdDev, units, globalTrend, absenceRate);

    // 6. Monte Carlo Predictions
    const { predictions, predictedE3SMean, predictedE3SSigma } = runMonteCarloSimulation(globalAverageKnown, allTermAverages, allSubjectAverages, subjectTrends, allSubjectOverallStats, units, globalStdDev);

    // 7. Path Analysis
    const probabilityAnalysisE2 = calculatePathAnalysis('etape2', allTermAverages, predictedE3SMean, predictedE3SSigma);
    const probabilityAnalysisE3 = calculatePathAnalysis('etape3', allTermAverages, predictedE3SMean, predictedE3SSigma);

    return { 
        subjectAverages: allSubjectAverages, termAverages: allTermAverages, 
        globalAverage: globalAverageKnown, globalStdDev, 
        globalConsistencyScore, aiModels: aiModels, 
        subjectStats: allSubjectStats, subjectOverallStats: allSubjectOverallStats,
        subjectTrends, burnoutRiskScore, predictions,
        probabilityAnalysisE2, probabilityAnalysisE3,
        AI_R2_THRESHOLD, subjectGroups, subjectList
    };
}

// Expose the core functionality globally
window.CoreAnalysis = {
    calculateAll: calculateAllAnalysis,
    getUnits: getUnits,
    getSubjectList: () => subjectList,
    getKnownEtapeKeys: () => KNOWN_ETAPE_KEYS
};
