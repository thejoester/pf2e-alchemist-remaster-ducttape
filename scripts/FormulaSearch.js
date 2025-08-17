import { debugLog, getSetting, hasFeat, isAlchemist  } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";

console.log("%cPF2e Alchemist Remaster Duct Tape: FormulaSearch.js loaded","color: aqua; font-weight: bold;");

//	function to inject the search input into the Formulas tab.
function addFormulaSearch(html) {
    debugLog(`addFormulaSearch() called`);

    // Updated selector for the known formulas tab
    const formulasTab = html.find(".major.item-container.known-formulas[data-container-type='knownFormulas']");
    if (!formulasTab.length) {
        debugLog("Formulas tab not found. Ensure the selector matches.");
        return;
    }

    // Updated HTML for the search bar
    const searchBarHtml = `
        <div class="search-bar-container">
		<input type="text" id="formula-search" placeholder="${LOCALIZED_TEXT.FORMULA_SEARCH_SEARCH}" />
            <button id="clear-search" class="clear-btn">${LOCALIZED_TEXT.BTN_CLEAR}</button>
        </div>
    `;

    // Insert the search bar at the beginning of the known formulas section
    formulasTab.prepend(searchBarHtml);

    // Define the search input and clear button
    const searchInput = html.find("#formula-search");
    const clearButton = html.find("#clear-search");

    // Define formula items
    const formulas = formulasTab.find(".formula-item");

    // Add input event listener to filter formulas
    searchInput.on("input", (event) => {
        const query = event.target.value.toLowerCase();

        formulas.each((_, formula) => {
            const formulaName = $(formula).find(".item-name h4 a").text().toLowerCase();
            if (formulaName.includes(query)) {
                $(formula).show();
            } else {
                $(formula).hide();
            }
        });
    });

    // Add click event listener for the clear button
    clearButton.on("click", () => {
        searchInput.val(""); // Clear the input field
        formulas.show();     // Show all formulas
    });
}

Hooks.on("ready", () => {
    
	//check if Searchable Formulas is enabled
	const sfEnabled = getSetting("searchableFormulas");
	if (sfEnabled) {	
		Hooks.on("renderActorSheet", (app, html, data) => {
			const actor = app.actor;
            if (!actor) {
                debugLog(3,`${LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND}: `,app);
                return;
            }
		
			//if (actor.type === "character" && actor.crafting?.formulas?.length > 0) {
			if (actor.type === "character") {
				addFormulaSearch(html);
			}
		});
	}
});