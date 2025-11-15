// projection.js - UI, RENDERING, EVENTS, AND STATE

document.addEventListener('DOMContentLoaded', () => {

    // --- STATE ---
    let mbsData = {};
    let activeTab = 'etape1';
    let cachedAnalysis = null;
    
    // --- INITIALIZATION ---
    function init() {
        if (typeof CoreAnalysis === 'undefined') {
            console.error("CoreAnalysis is not defined. Ensure projected-averages.js is loaded first.");
            document.querySelector('.main-container').innerHTML = `<p style="text-align:center; width:100%; padding: 4rem;">Erreur de chargement des algorithmes.</p>`;
            return;
        }
        try {
            mbsData = JSON.parse(localStorage.getItem('mbsData')) || { 
                valid: false, nom: 'Étudiant', settings: { niveau: 'sec5', unitesMode: 'defaut', absenceRate: '5' } 
            };
        } catch (e) {
            console.error("Failed to parse mbsData from localStorage", e);
            mbsData = { valid: false };
        }
        if (!mbsData.valid || !mbsData.nom) {
            document.querySelector('.main-container').innerHTML = `<p style="text-align:center; width:100%; padding: 4rem;">Données non chargées. Veuillez vous assurer que les données sont enregistrées sous 'mbsData' dans le Local Storage.</p>`;
            return;
        }
        loadSettings();
        calculateAndCacheAnalysis();
        renderAll();
        setupEventListeners();
    }

    function calculateAndCacheAnalysis() {
        cachedAnalysis = CoreAnalysis.calculateAll(mbsData);
    }

    // --- DATA & SETTINGS MANAGEMENT ---
    function loadSettings() {
        const settings = mbsData.settings || {};
        document.getElementById('niveau-secondaire').value = settings.niveau || '';
        document.getElementById('unites-mode').value = settings.unitesMode || 'defaut';
        const absenceRate = settings.absenceRate !== undefined ? settings.absenceRate : '5';
        document.getElementById('absence-rate-slider').value = absenceRate;
        document.getElementById('absence-rate-value').textContent = `${parseFloat(absenceRate).toFixed(1)}%`;
    }
    function saveSettings() {
        mbsData.settings = mbsData.settings || {};
        mbsData.settings.niveau = document.getElementById('niveau-secondaire').value;
        mbsData.settings.unitesMode = document.getElementById('unites-mode').value;
        mbsData.settings.absenceRate = document.getElementById('absence-rate-slider').value;
        mbsData.settings.customUnites = mbsData.settings.customUnites || {};
        localStorage.setItem('mbsData', JSON.stringify(mbsData));
        calculateAndCacheAnalysis();
        renderAll();
    }
    function saveCustomUnits() {
        const unitesModeEl = document.getElementById('unites-mode');
        if (unitesModeEl.value !== 'perso') return;
        let customUnites = {};
        document.querySelectorAll('.unite-item input').forEach(input => {
            customUnites[input.dataset.code] = parseFloat(input.value) || 1;
        });
        mbsData.settings = mbsData.settings || {};
        mbsData.settings.customUnites = customUnites;
        saveSettings();
    }

    // --- RENDERING FUNCTIONS ---
    function renderAll() {
        renderTermTables();
        const analysis = cachedAnalysis;
        renderSidePanel(analysis);
        renderDeepAnalysis(analysis);
        generateAndRenderInsights(analysis); 
        renderPerformanceGauge(analysis); 
        renderMonteCarlo(analysis);
        renderMismatchAnalysis(analysis);
    }
    
    function renderTermTables() {
        ['etape1', 'etape2', 'etape3'].forEach(key => {
            const container = document.getElementById(key);
            if (container) renderTermData(mbsData[key], container, key, cachedAnalysis);
        });
    }

    function renderTermData(termData, container, etapeKey, analysis) {
        if (!container) return; 
        const allSubjectsInTerm = Object.keys(analysis.subjectStats).filter(code => analysis.subjectStats[code]?.[etapeKey]);
        if (allSubjectsInTerm.length === 0) {
            container.innerHTML = `<p class="no-data text-gray-500">Aucune matière avec données dans cette étape.</p>`;
            return;
        }
        container.innerHTML = '';
        const subjectListCore = CoreAnalysis.getSubjectList();
        allSubjectsInTerm.forEach(codePrefix => {
            const subject = mbsData[etapeKey].find(s => s.code.startsWith(codePrefix));
            const subjStats = analysis.subjectStats[codePrefix]?.[etapeKey];
            const subjPrediction = analysis.predictions.subjects[codePrefix];
            if (subject && subjStats) {
                container.appendChild(renderSubjectTable(subject, etapeKey, subjStats, analysis, subjectListCore));
                if (subjPrediction) {
                    container.appendChild(renderSubjectAnalysis(codePrefix, etapeKey, analysis, subjectListCore));
                }
            }
        });
    }

    function renderSubjectTable(subject, etapeKey, subjStats, analysis, subjectListCore) {
        const table = document.createElement('table');
        table.className = 'subject-table';
        const codePrefix = subject.code.substring(0, 3);
        const subjectName = subjectListCore[codePrefix] || subject.name;
        const numAssignments = subjStats.allGrades.length;
        table.innerHTML = `
            <thead>
                <tr><th colspan="3">${codePrefix} - ${subjectName}</th></tr>
                <tr>
                    <th>Compétence</th>
                    <th>Moyenne Actuelle</th>
                    <th>Pas d'Analyse (Notes Comptées)</th>
                </tr>
            </thead>
            <tbody></tbody>`;
        const tbody = table.querySelector('tbody');
        subjStats.competencyAverages.forEach((comp, compIndex) => {
            const compAvg = comp.avg;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${subject.competencies[compIndex].name}</td>
                <td>${compAvg !== null ? `<span class="grade-percentage">${compAvg.toFixed(2)}%</span>` : '<span class="no-data">N/D</span>'}</td>
                <td>${comp.numAssignments}</td>
            `;
            if (tbody) tbody.appendChild(row);
        });
        const summaryRow = document.createElement('tr');
        summaryRow.className = 'bg-gray-100 font-semibold';
        summaryRow.innerHTML = `
            <td>TOTAL/GLOBAL</td>
            <td>${analysis.subjectAverages[etapeKey]?.[codePrefix]?.average !== null ? `<span class"grade-percentage text-lg">${analysis.subjectAverages[etapeKey]?.[codePrefix]?.average.toFixed(2)}%</span>` : '<span class="no-data text-lg">N/D</span>'}</td>
            <td>${numAssignments}</td>
        `;
        if (tbody) tbody.appendChild(summaryRow);
        return table;
    }

    function renderSubjectAnalysis(subjectCode, etapeKey, analysis, subjectListCore) {
        const analysisDiv = document.createElement('div');
        analysisDiv.className = 'subject-analysis';
        const subjAvg = analysis.subjectAverages[etapeKey]?.[subjectCode]?.average;
        const subjOverallStats = analysis.subjectOverallStats[subjectCode];
        const trend = subjOverallStats?.trend;
        const prediction = analysis.predictions.subjects[subjectCode];
        if (subjAvg === null || subjAvg === undefined || !prediction) {
            analysisDiv.innerHTML = `<p class="text-sm text-gray-500">Aucune donnée pour l'analyse de ${subjectListCore[subjectCode]}.</p>`;
            return analysisDiv;
        }
        let overallConsistency = subjOverallStats?.overallConsistency || 0;
        let consistencyBadge = { label: 'Volatilité Max', class: 'badge-red', icon: '❌' };
        if (overallConsistency >= 90) consistencyBadge = { label: 'Très Stable', class: 'badge-green', icon: '✅' };
        else if (overallConsistency >= 70) consistencyBadge = { label: 'Stable', class: 'badge-yellow', icon: '⚠️' };
        const fsp = prediction.fsp;
        let volatilityBadge = { label: `StdDev: ${fsp.toFixed(1)}`, class: 'badge-violet', icon: '♼' };
        if (fsp > 10) volatilityBadge.class = 'badge-red';
        else if (fsp > 5) volatilityBadge.class = 'badge-yellow';
        else volatilityBadge.class = 'badge-green';
        let trendBadge = { label: 'N/A', class: 'badge-violet', icon: ' ' };
        if (trend) {
            const slope = trend.slope;
            if (slope > 1) trendBadge = { label: `Forte Hausse (+${slope.toFixed(1)}%)`, class: 'badge-green', icon: '⬆️' };
            else if (slope < -1) trendBadge = { label: `Baisse Importante (${slope.toFixed(1)}%)`, class: 'badge-red', icon: '⬇️' };
            else trendBadge = { label: 'Stable', class: 'badge-yellow', icon: '↔️' };
        }
        const mpp = prediction.mpp;
        let mppBadge = { label: `Ratio: x${mpp.toFixed(2)}`, class: 'badge-blue', icon: '⚙️' };
        if (mpp > 1.02) mppBadge.class = 'badge-green';
        else if (mpp < 0.98) mppBadge.class = 'badge-red';
        else mppBadge.class = 'badge-yellow';
        const nd = prediction.nd;
        let ndBadge = { label: `ND: ${nd.toFixed(0)}`, class: 'badge-red', icon: '⚡' };
        if (nd <= 30) ndBadge = { label: `ND: ${nd.toFixed(0)}% (Faible)`, class: 'badge-green', icon: '✨' };
        else if (nd <= 60) ndBadge = { label: `ND: ${nd.toFixed(0)}% (Modéré)`, class: 'badge-yellow', icon: '💪' };
        analysisDiv.innerHTML = `
            <div class="flex items-center mb-2 flex-wrap gap-2">
                <span class="text-lg font-semibold text-gray-800 mr-4">${subjectListCore[subjectCode]}</span>
                <span class="analysis-badge ${consistencyBadge.class}">${consistencyBadge.icon} Consistance E/C: ${overallConsistency.toFixed(0)}/100</span>
                <span class="analysis-badge ${volatilityBadge.class}">${volatilityBadge.icon} ${volatilityBadge.label}</span>
                ${trend ? `<span class="analysis-badge ${trendBadge.class}">${trendBadge.icon} Tendance: ${trendBadge.label}</span>` : ''}
                <span class="analysis-badge ${mppBadge.class}">${mppBadge.icon} ${mppBadge.label}</span>
                <span class="analysis-badge ${ndBadge.class}">${ndBadge.icon} ${ndBadge.label}</span>
                <span class="analysis-badge badge-orange">Moyenne: ${prediction.drsTrendAvg.toFixed(1)}%</span>
            </div>
            <p class="text-sm text-gray-700 mt-2">MPP = Ratio de Tendance (Prédiction / Moyenne Actuelle). ND = Niveau de Difficulté (distance à 100% ajustée par la volatilité).</p>
        `;
        return analysisDiv;
    }

    function renderMismatchAnalysis(analysis) {
        const container = document.getElementById('mismatch-analysis');
        if (!container) return;
        let mismatchHtml = '';
        const subjectListCore = CoreAnalysis.getSubjectList();
        const sortedSubjects = Object.entries(analysis.predictions.subjects).sort(([, a], [, b]) => b.mismatchScore - a.mismatchScore);
        sortedSubjects.forEach(([code, subjPred]) => {
            const subjName = subjectListCore[code] || code;
            const consistency = subjPred.consistency;
            const fsp = subjPred.fsp;
            const nd = subjPred.nd;
            const mismatch = subjPred.mismatchScore; 
            let color = 'border-blue-500';
            let summary = 'Équilibre correct. Faible StdDev et bonne consistance.';
            if (mismatch > 40) {
                color = 'border-red-500';
                summary = '❌ **Volatilité Critique**. La performance est très imprévisible.';
            } else if (mismatch > 20) {
                color = 'border-yellow-500';
                summary = '⚠️ **Volatilité Modérée**. Consistance sous surveillance. Matière à risque d\'imprévu.';
            } else if (mismatch < 5) {
                color = 'border-green-500';
                summary = '✅ **Excellent Alignement**. Faible volatilité et haute consistance. Stabilité assurée.';
            }
            mismatchHtml += `
                <div class="p-3 rounded-lg border-l-4 ${color} bg-white shadow-sm">
                    <div class="flex justify-between items-center text-gray-800">
                        <strong class="text-lg">${subjName}</strong>
                        <span class="text-sm font-semibold">Score Mismatch: ${mismatch.toFixed(1)}</span>
                    </div>
                    <p class="text-sm text-gray-600 mt-1">${summary}</p>
                    <p class="text-xs text-gray-500 mt-1">Consistance: ${consistency.toFixed(0)}/100 | StdDev: ${fsp.toFixed(1)} | ND: ${nd.toFixed(0)}%</p>
                </div>
            `;
        });
        container.innerHTML = mismatchHtml;
    }

    function renderSidePanel(analysis) {
        const formatAvg = (avg) => avg !== null ? `<span class="grade-percentage">${avg.toFixed(2)}%</span>` : '--';
        const mcTrend = analysis.predictions.global?.trend;
        document.getElementById('moyenne-prediction').innerHTML = formatAvg(mcTrend);
        document.getElementById('active-etape-name').textContent = activeTab.replace('etape', '');
        const subjectListEl = document.getElementById('subject-averages-list');
        subjectListEl.innerHTML = '';
        const activeTermSubjects = analysis.subjectAverages[activeTab];
        if (activeTermSubjects && Object.keys(activeTermSubjects).length > 0) {
            const listItems = Object.entries(activeTermSubjects)
                .filter(([, subj]) => subj.average !== null)
                .map(([, subj]) => {
                    return `<li class="flex justify-between"><span>${subj.name}</span><strong>${formatAvg(subj.average)}</strong></li>`;
                })
                .join('');
            subjectListEl.innerHTML = listItems || '<li class="no-data text-gray-500">Aucune moyenne calculée pour cette étape</li>';
        } else {
            subjectListEl.innerHTML = '<li class="no-data text-gray-500">Aucune matière pour cette étape</li>';
        }
    }

    function renderDeepAnalysis(analysis) {
        const { globalConsistencyScore, burnoutRiskScore, aiModels } = analysis;
        const consistencyEl = document.getElementById('consistency-score');
        if (consistencyEl) {
            consistencyEl.className = 'score-card';
            consistencyEl.querySelector('strong').textContent = globalConsistencyScore.toFixed(0) + ' / 100';
            if (globalConsistencyScore < 70) consistencyEl.classList.add('card-red');
            else if (globalConsistencyScore < 90) consistencyEl.classList.add('card-violet');
            else consistencyEl.classList.add('card-green');
        }
        const riskEl = document.getElementById('burnout-risk-score');
        if (riskEl) {
            riskEl.className = 'score-card';
            riskEl.querySelector('strong').textContent = burnoutRiskScore.toFixed(0) + ' / 100';
            if (burnoutRiskScore > 70) riskEl.classList.add('card-red');
            else if (burnoutRiskScore > 40) riskEl.classList.add('card-yellow');
            else riskEl.classList.add('card-green');
        }
        const dffEl = document.getElementById('dff-score');
        if (dffEl && aiModels) {
            const globalTrend = aiModels.find(m => m.name === 'Global (Tendance)');
            dffEl.className = 'score-card';
            const slope = globalTrend ? globalTrend.model.slope : 0;
            const score = (slope * 10).toFixed(1);
            dffEl.querySelector('strong').textContent = score + "%";
            dffEl.querySelector('strong').className = score < -1 ? 'text-xl text-red-600' : (score > 1 ? 'text-xl text-green-600' : 'text-xl text-yellow-600');
            dffEl.querySelector('p').textContent = `Facteur de Tendance Globale (Pente / 10 devoirs)`;
        }
    }

    function renderPerformanceGauge(analysis) {
        const { p5, p50, p95 } = analysis.predictions.global;
        if (p5 === null || p50 === null || p95 === null) return;
        const needle = document.getElementById('gauge-needle');
        const p5Label = document.getElementById('gauge-label-p5');
        const p50Label = document.getElementById('gauge-label-p50');
        const p95Label = document.getElementById('gauge-label-p95');
        p5Label.textContent = `P5: ${p5.toFixed(1)}%`;
        p50Label.textContent = `P50: ${p50.toFixed(1)}%`;
        p95Label.textContent = `P95: ${p95.toFixed(1)}%`;
        const range = p95 - p5;
        if (range <= 0) {
            needle.style.left = '50%';
            return;
        }
        const position = (p50 - p5) / range;
        const needlePosition = Math.max(0, Math.min(100, position * 100));
        needle.style.left = `${needlePosition}%`;
    }

    function renderMonteCarlo(analysis) {
        const { predictions, probabilityAnalysisE2, probabilityAnalysisE3 } = analysis;
        const globalPredEl = document.getElementById('global-predictions');
        if (!globalPredEl) return;
        const predictionScenarios = [
            { name: "1. Tendance Pessimiste (P5)", key: 'p5', desc: '95% de chance d\'obtenir au moins ce score. Marge de sécurité.', class: 'card-red', effort: 'Modéré/Ciblé' },
            { name: "2. Quartile Inférieur (P25)", key: 'p25', desc: 'Limite basse du 25% des simulations.', class: 'card-yellow', effort: 'Modéré/Soutenu' },
            { name: "3. Médian (P50) - Le Plus Probable", key: 'p50', desc: 'Score médian. 50% de chance d\'être au-dessus. TENDANCE ACTUELLE.', class: 'card-violet', effort: 'Maintenir l\'Équilibre' },
            { name: "4. Quartile Supérieur (P75)", key: 'p75', desc: 'Limite haute du 25% des simulations. Nécessite un effort SOUTENU.', class: 'card-violet', effort: 'Soutenu' },
            { name: "5. Tendance Optimiste (P95)", key: 'p95', desc: '5% de chance d\'être meilleur que ce score. Nécessite un effort INTÉGRAL/MAXIMAL.', class: 'card-green', effort: 'Maximal' },
        ];
        globalPredEl.innerHTML = predictionScenarios.map(scenario => {
            const value = predictions.global?.[scenario.key];
            const display = value !== null ? (value > 100 ? '>100%' : `${value.toFixed(2)}%`) : '--';
            const colorClass = scenario.class;
            return `
                <div class="prediction-card ${colorClass}">
                    <p class="font-bold text-gray-700">${scenario.name}</p>
                    <p class="text-sm text-gray-500">${scenario.desc}</p>
                    <div class="flex justify-between items-center mt-2">
                        <div class="card-score text-gray-900">${display}</div>
                        <span class="effort-needed text-sm text-gray-600">${scenario.effort}</span>
                    </div>
                </div>
            `;
        }).join('');

        const targets = [95, 92, 90, 88, 85, 80, 75, 70, 60];
        const probTableEl_E2 = document.getElementById('probability-table-body-e2');
        const probTableEl_E3 = document.getElementById('probability-table-body-e3');
        
        const renderProbTable = (analysisData) => {
            if (!analysisData) return '';
            return targets.map(target => {
                const data = analysisData[target];
                if (!data) return '';
                const { requiredAvg, prob } = data;
                
                let probClass = 'prob-low';
                let effort = 'Effort Extrême (Statistiquement Improbable)';
                if (prob >= 80) { probClass = 'prob-high'; effort = 'Maintenir Consistance (Très Faisable)'; }
                else if (prob >= 50) { probClass = 'prob-medium'; effort = 'Effort Modéré/Ciblé (Faisable)'; }
                else if (prob >= 20) { probClass = 'prob-low'; effort = 'Effort Intégral (Difficile)'; }
                else if (prob < 5) { probClass = 'prob-low'; effort = 'Statistiquement Très Improbable'; }
                let requiredAvgDisplay = requiredAvg !== null ? (requiredAvg > 100 ? 'IMPOSSIBLE (100+)' : `${requiredAvg.toFixed(2)}%`) : '--';
                if (requiredAvg !== null && requiredAvg < 60) requiredAvgDisplay = `<span class="text-green-600">FAIBLE (${requiredAvg.toFixed(2)}%)</span>`;
                else if (requiredAvg !== null && requiredAvg > 100) requiredAvgDisplay = `<span class="text-red-600">IMPOSSIBLE (100+%)</span>`;
                
                return `
                    <tr class="${probClass}">
                        <td>${target}%</td>
                        <td>${requiredAvgDisplay}</td>
                        <td>${prob.toFixed(1)}%</td>
                        <td>${effort}</td>
                    </tr>
                `;
            }).join('');
        };
        
        if (probTableEl_E2) { probTableEl_E2.innerHTML = renderProbTable(probabilityAnalysisE2); }
        if (probTableEl_E3) { probTableEl_E3.innerHTML = renderProbTable(probabilityAnalysisE3); }
        
        const subjPredEl = document.getElementById('subject-predictions-list');
        if (!subjPredEl) return;
        const subjectListCore = CoreAnalysis.getSubjectList();
        const sortedSubjects = Object.entries(predictions.subjects).sort(([codeA], [codeB]) => {
            return (subjectListCore[codeA] || codeA).localeCompare(subjectListCore[codeB] || codeB);
        });
        subjPredEl.innerHTML = sortedSubjects.map(([code, subjPred]) => {
            const prediction = subjPred.predictionFinal;
            const cardClass = prediction >= 90 ? 'card-green' : (prediction >= 80 ? 'card-violet' : 'card-red');
            return `
                <div class="prediction-card ${cardClass}">
                    <div class="flex justify-between items-center">
                        <p class="font-bold text-lg text-gray-800">${subjectListCore[code] || code}</p>
                        <div class="text-sm text-gray-500">
                            Ratio: x${subjPred.mpp.toFixed(2)} | StdDev: ${subjPred.fsp.toFixed(1)} | Moy: ${subjPred.drsTrendAvg.toFixed(1)}%
                        </div>
                    </div>
                    <p class="text-sm text-gray-500">Prédiction Stochastique Finale (E1+E2+E3) **Plafondé à ${subjPred.e3PredictionCap.toFixed(1)}%**</p>
                    <div class="card-score text-gray-900">${prediction !== null ? prediction.toFixed(2) + '%' : '--'}</div>
                </div>
            `;
        }).join('');
    }

    function generateAndRenderInsights(analysis) {
        const { burnoutRiskScore, aiModels, globalStdDev, AI_R2_THRESHOLD, subjectGroups, subjectList } = analysis;
        const container = document.getElementById('ai-insights-list');
        if (!container) return;

        let insights = [];
        let riskLabel = "faible";
        let riskClass = "insight-good";
        if (burnoutRiskScore > 70) { riskLabel = "Élevé"; riskClass = ""; }
        else if (burnoutRiskScore > 45) { riskLabel = "Modéré"; riskClass = "insight-info"; }
        insights.push({ text: `Mon diagnostic global est un **risque de burnout ${riskLabel} (${burnoutRiskScore.toFixed(0)}/100)**.`, type: riskClass });

        const goodModels = aiModels.filter(m => m.model.r2 > AI_R2_THRESHOLD).sort((a, b) => b.model.r2 - a.model.r2);

        if (goodModels.length > 0) {
            insights.push({ text: `J'ai scanné ${aiModels.length} combinaisons et **trouvé ${goodModels.length} schéma(s) fiable(s)** dans votre performance :`, type: 'insight-info' });

            goodModels.slice(0, 3).forEach(m => {
                let text = '';
                let riskClass = 'insight-good';
                const avg = m.data.grades.reduce((a, b) => a + b, 0) / m.data.grades.length;
                const [category, type] = m.name.split(' (');
                const modelType = type.replace(')', '');
                let name = '';

                if (category === 'Global') { name = `${modelType} Globale`; } 
                else if (subjectGroups[category]) { 
                    const subjectNames = m.data.codes.map(c => subjectList[c] || c).join(', ');
                    name = `${modelType} en ${category} (${subjectNames})`; 
                } else { 
                    name = `${modelType} en ${category}`; 
                }

                if (m.model.slope > 0.1) {
                    text = `**${name} (Moy: ${avg.toFixed(0)}%)**: Vous avez une **tendance positive claire**. (Confiance: ${(m.model.r2 * 100).toFixed(0)}%)`;
                } else if (m.model.slope < -0.1) {
                    text = `**${name} (Moy: ${avg.toFixed(0)}%)**: Tendance **négative**. Vos notes baissent, même si votre moyenne est élevée. (Confiance: ${(m.model.r2 * 100).toFixed(0)}%)`;
                    riskClass = ''; 
                } else {
                    text = `**${name} (Moy: ${avg.toFixed(0)}%)**: Votre performance est **stable et constante**. (Confiance: ${(m.model.r2 * 100).toFixed(0)}%)`;
                }
                insights.push({ text: text, type: `${m.type} ${riskClass}` });
            });
            
            const negativeTrends = goodModels.filter(m => m.model.slope < -0.1);
            if (negativeTrends.length > 0) {
                const worstTrend = negativeTrends.sort((a, b) => a.model.slope - b.model.slope)[0];
                const [category, ] = worstTrend.name.split(' (');
                insights.push({ 
                    text: `<b>Action Requise:</b> Votre tendance la plus négative est en <b>${category}</b>. C'est votre priorité #1. Même si la moyenne est haute, la tendance à la baisse est un signal de risque.`,
                    type: '' 
                });
            }
            
            const positiveTrends = goodModels.filter(m => m.model.slope > 0.1);
            if (positiveTrends.length > 0 && negativeTrends.length === 0) { 
                const bestTrend = positiveTrends.sort((a, b) => b.model.slope - a.model.slope)[0];
                const [category, ] = bestTrend.name.split(' (');
                insights.push({ 
                    text: `<b>Bon Travail:</b> Votre élan est excellent, surtout en <b>${category}</b>. Maintenez cette méthode de travail, elle fonctionne.`,
                    type: 'insight-good'
                });
            }
            
            if (positiveTrends.length === 0 && negativeTrends.length === 0) { 
                 insights.push({ 
                    text: `<b>Profil Stable:</b> Vos schémas sont très constants, sans hausse ni baisse majeure. C'est un profil mature. Le focus est de maintenir cette constance.`,
                    type: 'insight-info'
                });
            }

        } else {
            insights.push({ text: `Mon diagnostic principal est que votre performance est **erratique**. Je n'ai trouvé **aucun schéma fiable** (R² < ${(AI_R2_THRESHOLD * 100).toFixed(0)}%) sur les ${aiModels.length} combinaisons analysées.`, type: 'insight-erratic' });
            insights.push({ text: `Cette imprévisibilité est le principal facteur de votre B-Risk. Votre Volatilité (StdDev) est de **${globalStdDev.toFixed(1)}** (Idéal: < 10). La priorité #1 est la constance.`, type: '' });
            insights.push({ 
                text: "<b>Conseil:</b> Votre focus ne doit pas être sur une matière, mais sur la <b>stabilité</b>. Visez à ce que vos 5 prochains devoirs aient un écart max de 10-15 points (ex: 80% et 95%) au lieu de 40 points (ex: 60% et 100%).", 
                type: 'insight-focus' 
            });
        }

        container.innerHTML = insights.map(insight => {
            return `<li class="${insight.type || ''}">${insight.text}</li>`;
        }).join('');
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // Tab functionality
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelector('.tab-btn.active')?.classList.remove('active');
                tab.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                activeTab = tab.dataset.tab;
                document.getElementById(activeTab)?.classList.add('active');
                renderSidePanel(cachedAnalysis);
            });
        });
        // Settings listeners
        document.getElementById('niveau-secondaire')?.addEventListener('change', saveSettings);
        document.getElementById('unites-mode')?.addEventListener('change', () => {
            saveSettings();
            populateUnitesModal();
        });
        const absenceSlider = document.getElementById('absence-rate-slider');
        const absenceValue = document.getElementById('absence-rate-value');
        absenceSlider?.addEventListener('input', (e) => {
            absenceValue.textContent = `${parseFloat(e.target.value).toFixed(1)}%`;
        });
        absenceSlider?.addEventListener('change', () => { saveSettings(); });
        // Units modal listeners
        const unitesModal = document.getElementById('unites-modal');
        document.getElementById('unites-btn')?.addEventListener('click', () => {
            populateUnitesModal();
            unitesModal?.classList.add('active');
        });
        document.getElementById('close-unites-modal')?.addEventListener('click', () => {
            saveCustomUnits();
            unitesModal?.classList.remove('active');
        });
        // Help modal listeners
        const helpModal = document.getElementById('help-modal');
        const openHelpBtn = document.getElementById('open-help-btn');
        const closeHelpBtn = document.getElementById('close-help-modal');
        if (openHelpBtn && helpModal) {
            openHelpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                helpModal.classList.add('active');
            });
        }
        if (closeHelpBtn && helpModal) {
            closeHelpBtn.addEventListener('click', () => { helpModal.classList.remove('active'); });
        }
        if (helpModal) {
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) { helpModal.classList.remove('active'); }
            });
        }
    }
    
    function populateUnitesModal() {
        const unitesListEl = document.getElementById('unites-list');
        if (!unitesListEl) return;
        unitesListEl.innerHTML = '';
        const currentUnits = CoreAnalysis.getUnits(mbsData.settings);
        const subjectListCore = CoreAnalysis.getSubjectList();
        const KNOWN_ETAPE_KEYS = CoreAnalysis.getKnownEtapeKeys();
        const subjectCodes = new Set();
        KNOWN_ETAPE_KEYS.forEach(etapeKey => {
            mbsData[etapeKey]?.forEach(subject => {
                const codePrefix = subject.code.substring(0, 3);
                subjectCodes.add(codePrefix);
            });
        });
        Array.from(subjectCodes).sort().forEach(code => {
            const currentUnitValue = currentUnits[code] || 2; 
            const li = document.createElement('div');
            li.className = 'unite-item flex justify-between items-center border-b border-gray-200 py-2';
            // Note: The original code used a global function `saveCustomUnits()` on the inline onchange event.
            // Since we moved it, we need to ensure it's accessible or re-bind it. 
            // For simplicity and adherence to the original code's structure, we'll keep the direct call, 
            // relying on saveCustomUnits being globally available (it is defined in this scope but not globally).
            // A safer method would be to use an event listener, but for now, we'll make a helper global.
            window.saveCustomUnitsHelper = saveCustomUnits;

            li.innerHTML = `
                <span class="text-gray-700">${subjectListCore[code] || code} (${code})</span>
                <input type="number" class="w-20 text-right p-1 border rounded-md" value="${currentUnitValue}" min="0" max="10" data-code="${code}" onchange="window.saveCustomUnitsHelper()">
            `;
            unitesListEl.appendChild(li);
        });
    }

    // --- START THE APP ---
    init();
});
