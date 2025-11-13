/**
 * The default structure for the application's data.
 * Used to initialize storage for a new user.
 */
const getDefaultData = () => ({
  valid: false,
  nom: null,
  user_random: `user-${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}`,
  etape1: [],
  etape2: [],
  etape3: [],
  historique: {
    etape1: { timestamps: [], moyennes: [] },
    etape2: { timestamps: [], moyennes: [] },
    etape3: { timestamps: [], moyennes: [] },
  },
  settings: {
    theme: 'auto',
    niveau: '', // 'sec4' or 'sec5'
    unitesMode: 'defaut', // 'defaut', 'sans', 'perso'
    customUnites: {},
  },
});

/**
 * Retrieves the entire MBS data object from localStorage.
 * If no data exists, it initializes and saves a default structure.
 * @returns {object} The MBS data object.
 */
export function getData() {
  let data = localStorage.getItem('mbsData');
  if (!data) {
    const defaultData = getDefaultData();
    saveData(defaultData);
    return defaultData;
  }
  return JSON.parse(data);
}

/**
 * Saves the entire MBS data object to localStorage.
 * @param {object} data The complete MBS data object to save.
 */
export function saveData(data) {
  try {
    localStorage.setItem('mbsData', JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save data to localStorage:", error);
    // Optionally, alert the user that their data could not be saved.
  }
}

/**
 * Initializes the data for a new user after the first data paste.
 * Sets the 'valid' flag to true and saves the parsed data.
 * @param {string} nom - The student's name.
 * @param {string} etapeKey - The key for the semester (e.g., 'etape1').
 * @param {Array} etapeData - The array of subjects for that semester.
 */
export function initializeUserData(nom, etapeKey, etapeData) {
    const data = getDefaultData();
    data.valid = true;
    data.nom = nom;
    data[etapeKey] = etapeData;
    saveData(data);
}

/**
 * Updates an existing user's data with new information for a specific semester.
 * Implements the "overwrite" strategy.
 * @param {string} etapeKey - The key for the semester to update.
 * @param {Array} etapeData - The new array of subjects.
 */
export function updateEtapeData(etapeKey, etapeData) {
    const data = getData();
    data[etapeKey] = etapeData; // Overwrite strategy
    saveData(data);
}

/**
 * Adds a new entry to the history for a given semester to track trends.
 * @param {string} etapeKey - The semester key (e.g., 'etape1').
 * @param {number} moyenne - The new average to record.
 */
export function recordHistorique(etapeKey, moyenne) {
    if (moyenne === null || isNaN(moyenne)) return;
    const data = getData();
    if (data.historique[etapeKey]) {
        data.historique[etapeKey].timestamps.push(Date.now());
        data.historique[etapeKey].moyennes.push(moyenne);
        saveData(data);
    }
}
