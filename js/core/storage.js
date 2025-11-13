const STORAGE_KEY = 'mbsData';

/**
 * Gets the entire data object from localStorage.
 * Initializes a default structure if none exists.
 * @returns {object} The user's data object.
 */
export function getData() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        return JSON.parse(data);
    }
    // Initialize with a default structure if no data exists
    return {
        valid: false,
        nom: null,
        user_random: `user-${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}`,
        etape1: [],
        etape2: [],
        etape3: [],
        historique: {
            etape1: { timestamps: [], moyennes: [] },
            etape2: { timestamps: [], moyennes: [] },
            etape3: { timestamps: [], moyennes: [] }
        },
        settings: {
            theme: "auto",
            niveau: "",
            unitesMode: "defaut",
            customUnites: {}
        }
    };
}

/**
 * Saves the entire data object to localStorage.
 * @param {object} data The data object to save.
 */
export function saveData(data) {
    localStorage.setItem(STORAGE-KEY, JSON.stringify(data));
}

/**
 * Saves a specific setting to the data object.
 * @param {string} key The setting key (e.g., 'niveau', 'unitesMode').
 * @param {any} value The value to save.
 */
export function saveSetting(key, value) {
    const data = getData();
    data.settings[key] = value;
    saveData(data);
}
