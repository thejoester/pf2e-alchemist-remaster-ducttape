import { debugLog, hasFeat, isAlchemist  } from './settings.js';
console.log("%cPF2e Alchemist Remaster Duct Tape: FormulaSearch.js loaded","color: aqua; font-weight: bold;");

/*
	function to inject the search input into the Formulas tab.
*/
function addFormulaSearch(html) {
	debugLog(`addFormulaSearch() called`);
    const formulasTab = html.find(".known-formulas.item-container[data-container-type='knownFormulas']"); // Locate the Formulas tab by its data-tab attribute
    //if (!formulasTab.length) return;

    // Create the search bar HTML
    const searchBarHtml = `
        <div class="search-bar-container">
			<input type="text" id="formula-search" placeholder="Search Formulas..." />
			<button id="clear-search" class="clear-btn">Clear</button>
        </div>
    `;
	
	
    // Insert the search bar before the action header
    formulasTab.find(".action-header").before(searchBarHtml);

	// Add the event listener for the search bar
    const clearButton = html.find("#clear-search"); // Define the clear button here

    // Add the event listener for the search bar
    const searchInput = html.find("#formula-search");
    searchInput.on("input", (event) => {
        const query = event.target.value.toLowerCase();
        const formulas = formulasTab.find(".item");
        
        formulas.each((_, formula) => {
            const formulaName = $(formula).find(".item-name").text().toLowerCase();
            if (formulaName.includes(query)) {
                $(formula).show();
            } else {
                $(formula).hide();
            }
        });
		
		// Clear search functionality
		clearButton.on("click", () => {
			// Clear the input field
			searchInput.val("");
			// Show all formulas
			formulasTab.find(".item").show();
		});
    });
}

Hooks.on("ready", () => {
    
	//check if Searchable Formulas is enabled
	const sfEnabled = game.settings.get("pf2e-alchemist-remaster-ducttape", "searchableFormulas");
	if (sfEnabled) {	
		Hooks.on("renderActorSheet", (app, html, data) => {
			const actor = app.actor;
            if (!actor) {
                debugLog(3,`No actor found: `,app);
                return;
            }
		
			//if (actor.type === "character" && actor.crafting?.formulas?.length > 0) {
			if (actor.type === "character") {
				addFormulaSearch(html);
			}
		});
	}
});