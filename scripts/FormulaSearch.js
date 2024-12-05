console.log("%cPF2e Alchemist Remaster Duct Tape: FormulaSearch.js loaded","color: aqua; font-weight: bold;");

/*
	function to inject the search input into the Formulas tab.
*/
function addFormulaSearch(html) {
	console.log(`%cP2Fe Alchemist Duct Tape (PowerfulAlchemy.js)| addFormulaSearch() called`,"color: aqua; font-weight: bold;");
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

// Function for debugging
	function debugLog(logMsg, logType = "c", logLevel = "1") {
		const debugEnabled = game.settings.get("pf2e-alchemist-remaster-ducttape", "debugEnabled");
		if (!debugEnabled) return;
		
		switch (logType) {
			case "c": //console
				switch (logLevel) {
					case "1": // info/log
						console.log(`%cP2Fe Alchemist Duct Tape (PowerfulAlchemy.js)| ${logMsg}`,"color: aqua; font-weight: bold;");
						break;
					case "2": // warn
						console.warn(`P2Fe Alchemist Duct Tape (PowerfulAlchemy.js)| ${logMsg}`);
						break;
					case "3": // error
						console.error(`P2Fe Alchemist Duct Tape (PowerfulAlchemy.js)| ${logMsg}`);
						break;
					default:
						console.log(`%cP2Fe Alchemist Duct Tape (PowerfulAlchemy.js)| ${logMsg}`,"color: aqua; font-weight: bold;");
				}
				break;
			case "u": // ui
				switch (logLevel) {
					case "1": // info/log
						ui.notifications.info(`Alchemist Duct Tape (PowerfulAlchemy.js)| ${logMsg}`);
						break;
					case "2": // warn
						ui.notifications.warn(`Alchemist Duct Tape (PowerfulAlchemy.js)| ${logMsg}`);
						break;
					case "3": // error
						ui.notifications.error(`Alchemist Duct Tape (PowerfulAlchemy.js)| ${logMsg}`);
						break;
					default:
						ui.notifications.info(logMsg);
				}
				break;
			default:
				console.warn(`P2Fe Alchemist Duct Tape (PowerfulAlchemy.js): Invalid log event.`);
		}
	}

Hooks.on("ready", () => {
    
	//check if Searchable Formulas is enabled
	const sfEnabled = game.settings.get("pf2e-alchemist-remaster-ducttape", "searchableFormulas");
	if (sfEnabled) {	
		Hooks.on("renderActorSheet", (app, html, data) => {
			console.log(`%cP2Fe Alchemist Duct Tape (PowerfulAlchemy.js)| Actor Sheet Rendered`,"color: aqua; font-weight: bold;");
			const actor = app.actor;
            if (!actor) {
                console.log(`%cP2Fe Alchemist Duct Tape (PowerfulAlchemy.js)| No actor found: `,"color: aqua; font-weight: bold;", app);
                return;
            }
			
			
			//if (actor.type === "character" && actor.crafting?.formulas?.length > 0) {
			if (actor.type === "character") {
				console.log(`%cP2Fe Alchemist Duct Tape (PowerfulAlchemy.js)| actor.type = "character"`,"color: aqua; font-weight: bold;");
				addFormulaSearch(html);
			}
		});
	}
});

