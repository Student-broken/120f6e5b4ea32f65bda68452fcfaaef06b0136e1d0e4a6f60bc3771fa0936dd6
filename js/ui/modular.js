/**
 * Initializes modal functionality for a given modal ID.
 * @param {string} modalId The ID of the modal overlay element.
 * @param {string} openBtnId The ID of the button that opens the modal.
 * @param {string} closeBtnId The ID of the button that closes the modal.
 */
export function initializeModal(modalId, openBtnId, closeBtnId) {
    const modal = document.getElementById(modalId);
    const openBtn = document.getElementById(openBtnId);
    const closeBtn = document.getElementById(closeBtnId);

    if (!modal || !openBtn || !closeBtn) {
        console.error("Modal initialization failed: one or more elements not found.");
        return;
    }

    const open = () => modal.classList.add('active');
    const close = () => modal.classList.remove('active');

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            close();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            close();
        }
    });

    // Return the close function so it can be called from other scripts
    return { open, close };
}
