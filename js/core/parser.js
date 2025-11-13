/**
 * Parses the raw text pasted from the student portal into a structured object.
 * @param {string} text The raw text data.
 * @returns {object|null} The parsed data object or null if parsing fails.
 */
export function parsePortalData(text) {
    const nameMatch = text.match(/Photo\s*\n(.+)/);
    const semesterMatch = text.match(/Classe\s*\n\s*(\d)/);
    
    const nom = nameMatch ? nameMatch[1].trim() : null;
    const etapeNumber = semesterMatch ? semesterMatch[1].trim() : null;

    if (!nom || !etapeNumber) {
        console.error("Parsing failed: Name or Etape number not found.");
        return null;
    }

    const etapeKey = `etape${etapeNumber}`;

    const POND_REGEX = /^\d{1,3}$/;
    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;
    const RESULT_REGEX = /^(\d{1,3},\d\s\/\s\d{1,3}\s\(.+\)|[A-DF][+-]?)$/;

    const createNewAssignment = () => ({ textBuffer: [], category: '', work: '', pond: '', assignedDate: '', dueDate: '', result: '' });

    const parseAssignments = (lines) => {
        let assignments = [];
        if (lines.length === 0) return assignments;
        let currentAssignment = createNewAssignment();

        const finalizeAssignment = () => {
            if (currentAssignment.textBuffer.length === 0 && !currentAssignment.pond) return;
            const buffer = currentAssignment.textBuffer;
            if (buffer.length === 1) {
                currentAssignment.work = buffer[0];
            } else if (buffer.length > 1) {
                currentAssignment.category = buffer[0];
                currentAssignment.work = buffer.slice(1).join('<br>');
            }
            delete currentAssignment.textBuffer;
            assignments.push(currentAssignment);
        };

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.includes('Catégorie\tTravail\tPond.')) continue;

            if (RESULT_REGEX.test(trimmedLine)) {
                currentAssignment.result = trimmedLine;
                finalizeAssignment();
                currentAssignment = createNewAssignment();
            } else if (POND_REGEX.test(trimmedLine)) {
                currentAssignment.pond = trimmedLine;
            } else if (DATE_REGEX.test(trimmedLine)) {
                if (!currentAssignment.assignedDate) {
                    currentAssignment.assignedDate = trimmedLine.split('à')[0].trim();
                } else {
                    currentAssignment.dueDate = trimmedLine;
                }
            } else {
                if (currentAssignment.pond || currentAssignment.assignedDate) {
                    finalizeAssignment();
                    currentAssignment = createNewAssignment();
                }
                currentAssignment.textBuffer.push(trimmedLine);
            }
        }
        finalizeAssignment();
        return assignments;
    };

    const subjects = [];
    const subjectRegex = /([A-Z]{3}\d{3}[A-Z]?) - (.+)/g;
    const subjectsText = text.split(subjectRegex).slice(1);

    for (let i = 0; i < subjectsText.length; i += 3) {
        const subjectData = { code: subjectsText[i].trim(), name: subjectsText[i+1].trim(), competencies: [] };
        let subjectContent = subjectsText[i + 2] || '';
        const competencyBlocks = subjectContent.split('Compétence - ').slice(1);

        for (const block of competencyBlocks) {
            const blockLines = block.trim().split('\n');
            const compName = blockLines.shift();
            const cleanLines = blockLines.filter(line => line.trim() && !line.includes('Catégorie\tTravail\tPond.'));
            const competencyData = {
                name: `Compétence - ${compName.trim()}`,
                assignments: parseAssignments(cleanLines)
            };
            if (competencyData.assignments.length > 0) {
                subjectData.competencies.push(competencyData);
            }
        }
        if (subjectData.competencies.length > 0) {
            subjects.push(subjectData);
        }
    }
    
    return { nom, etapeKey, etapeData: subjects };
}
