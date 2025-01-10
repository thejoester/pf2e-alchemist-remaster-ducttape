console.log("%cPF2e Alchemist Remaster Duct Tape | settings.js loaded","color: aqua; font-weight: bold;");

// Function for debugging
export function debugLog(intLogType, stringLogMsg, objObject = null) {
	// Handle the case where the first argument is a string
	if (typeof intLogType === "string") {
		objObject = stringLogMsg; // Shift arguments
		stringLogMsg = intLogType;
		intLogType = 1; // Default log type to 'all'
	}

	const debugLevel = game.settings.get("pf2e-alchemist-remaster-ducttape", "debugLevel");

	// Map debugLevel setting to numeric value for comparison
	const levelMap = {
		"none": 4,
		"error": 3,
		"warn": 2,
		"all": 1
	};

	const currentLevel = levelMap[debugLevel] || 4; // Default to 'none' if debugLevel is undefined

	// Check if the log type should be logged based on the current debug level
	if (intLogType < currentLevel) return;

	// Capture stack trace to get file and line number
	const stack = new Error().stack.split("\n");
	let fileInfo = "Unknown Source";
	for (let i = 2; i < stack.length; i++) {
		const line = stack[i].trim();
		const fileInfoMatch = line.match(/(\/[^)]+):(\d+):(\d+)/); // Match file path and line number
		if (fileInfoMatch) {
			const [, filePath, lineNumber] = fileInfoMatch;
			const fileName = filePath.split("/").pop(); // Extract just the file name
			// Ensure the file is one of the allowed files
			const allowedFiles = ["FormulaSearch.js", "LevelUp.js", "PowerfulAlchemy.js", "QuickAlchemy.js", "settings.js", "VialSearch.js"];
			if (allowedFiles.includes(fileName)) {
				fileInfo = `${fileName}:${lineNumber}`;
				break;
			}
		}
	}

	// Prepend the file and line info to the log message
	const formattedLogMsg = `[${fileInfo}] ${stringLogMsg}`;
	
	if (objObject) {
		switch (intLogType) {
			case 1: // Info/Log (all)
				console.log(`%cP2Fe Alchemist Duct Tape | ${formattedLogMsg}`, "color: aqua; font-weight: bold;", objObject);
				break;
			case 2: // Warning
				console.log(`%cP2Fe Alchemist Duct Tape | WARNING: ${formattedLogMsg}`, "color: orange; font-weight: bold;", objObject);
				break;
			case 3: // Critical/Error
				console.log(`%cP2Fe Alchemist Duct Tape | ERROR: ${formattedLogMsg}`, "color: red; font-weight: bold;", objObject);
				break;
			default:
				console.log(`%cP2Fe Alchemist Duct Tape | ${formattedLogMsg}`, "color: aqua; font-weight: bold;", objObject);
		}
	} else {
		switch (intLogType) {
			case 1: // Info/Log (all)
				console.log(`%cP2Fe Alchemist Duct Tape | ${formattedLogMsg}`, "color: aqua; font-weight: bold;");
				break;
			case 2: // Warning
				console.log(`%cP2Fe Alchemist Duct Tape | WARNING: ${formattedLogMsg}`, "color: orange; font-weight: bold;");
				break;
			case 3: // Critical/Error
				console.log(`%cP2Fe Alchemist Duct Tape | ERROR: ${formattedLogMsg}`, "color: red; font-weight: bold;");
				break;
			default:
				console.log(`%cP2Fe Alchemist Duct Tape | ${formattedLogMsg}`, "color: aqua; font-weight: bold;");
		}
	}
}

/*
	Check if actor has a feat by searching for the slug, example "powerful-alchemy"
*/
export function hasFeat(actor, slug) {
	return actor.itemTypes.feat.some((feat) => feat.slug === slug);
}

/*
	Checks if a character qualifies for Alchemist benefits.
*/
export function isAlchemist(actor) {
    if (!actor) return { qualifies: false, dc: 0, isArchetype: false };


    // Check if the actor's class matches the localized Alchemist class name
    const isAlchemistClass = actor?.class?.system?.slug === 'alchemist';
	
	debugLog(`isAlchemistClass: ${isAlchemistClass} | ${actor?.class?.system?.slug}`);

    // Check if the actor has the localized Alchemist Dedication feat
    const hasAlchemistDedication = hasFeat(actor, "alchemist-dedication");

    // If the actor qualifies, get the Alchemist Class DC
    if (isAlchemistClass || hasAlchemistDedication) {
        const alchemistClassDC = actor.system.proficiencies.classDCs.alchemist?.dc || 0;
        return {
            qualifies: true,
            dc: alchemistClassDC,
            isArchetype: hasAlchemistDedication && !isAlchemistClass
        };
    }

    // If the actor doesn't qualify
    return { qualifies: false, dc: 0, isArchetype: false };
}

/* 
	Function to dynamically manage collapseChatDesc setting based on Workbench's setting
*/
function adjustCollapseSettingBasedOnWorkbench() {
    const settingKey = "pf2e-alchemist-remaster-ducttape.collapseChatDesc";
    const workbenchSettingKey = "xdy-pf2e-workbench.autoCollapseItemChatCardContent";
    const isWorkbenchInstalled = game.modules.get("xdy-pf2e-workbench")?.active;

    if (!isWorkbenchInstalled) return; // Not installed - exit early
	
	if (!game.settings.settings.has(workbenchSettingKey)) {// settings key not found
        console.log(`Workbench setting '${workbenchSettingKey}' not found.`);
        return;
    }
    const currentWorkbenchSetting = game.settings.get("xdy-pf2e-workbench", "autoCollapseItemChatCardContent");

    // Check if the collapseChatDesc setting exists
    if (!game.settings.settings.has(settingKey)) return;

    // If Workbench is managing collapsibility, set collapseChatDesc to false
    if (currentWorkbenchSetting === "collapsedDefault" || currentWorkbenchSetting === "nonCollapsedDefault") {
        if (game.settings.get("pf2e-alchemist-remaster-ducttape", "collapseChatDesc") === true) {
            game.settings.set("pf2e-alchemist-remaster-ducttape", "collapseChatDesc", false);
            console.log(
                "PF2e Alchemist Remaster Duct Tape | xdy-pf2e-workbench is managing collapsibility."
            );
        }
    }
}


Hooks.once("init", () => {
	
	/*	
		Saved Data Settings
	*/
	game.settings.register('pf2e-alchemist-remaster-ducttape', 'explorationTime', {
        name: 'Last Processed Time',
        hint: 'Tracks the last processed time for exploration mode.',
        scope: 'world',
        config: false,
        type: Number,
        default: 0
    });
	game.settings.register('pf2e-alchemist-remaster-ducttape', 'previousTime', {
		name: 'Previous World Time',
		hint: 'Tracks the last recorded world time to calculate elapsed time.',
		scope: 'world',
		config: false,
		type: Number,
		default: 0
	});
	
	/*
		Show Quick Alchemy counts
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "removeTempItems", {
		name: "Quick Alchemy: remove temporary items at end of turn?",
		hint: "If enabled, will automatically remove items crafted with quick alchemy (per RAW).",
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});
	
	/*
		Show Quick Alchemy counts
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "showQACounts", {
		name: "Quick Alchemy: Show formula counts",
		hint: "If enabled, will show the number of available formulas.",
		scope: "world",
		config: true,    
		default: false,  
		type: Boolean,   
		requiresReload: true,
	});
	
	/* 
		Sized Based Alchemy Settings
	*/
	console.log("%cPF2E Alchemist Remaster Duct Tape | Initializing Tiny Alchemy settings...","color: aqua; font-weight: bold;");
	game.settings.register("pf2e-alchemist-remaster-ducttape", "enableSizeBasedAlchemy", {
		name: "Enable size-based alchemy for Quick Alchemy",
		hint: "Adjust the size of items created by Quick Alchemy to match the creature's size.",
		scope: "world",
		config: true,
		type: String,
		choices: {
			disabled: "Disabled",
			tinyOnly: "Tiny Only",
			allSizes: "All Sizes"
		},
		default: "tinyOnly",
		onChange: (value) => {
			console.log(`PF2E Alchemist Remaster Duct Tape | Size-based alchemy mode set to: ${value}`);
		},
		requiresReload: true
	});
	
	/* 
		Powerful Alchemy Settings
	*/
	console.log("%cPF2E Alchemist Remaster Duct Tape | Initializing Powerful Alchemy settings...","color: aqua; font-weight: bold;");
	game.settings.register("pf2e-alchemist-remaster-ducttape", "enablePowerfulAlchemy", {
		name: "Enable Powerful Alchemy",
		hint: "Enables the auto-update of created items using Class DC.",
		scope: "world",
		config: true,
		type: Boolean,
        default: true,
        onChange: (value) => {
            console.log(`PF2E Alchemist Remaster Duct Tape | Powerful Alchemy enabled: ${value}`);
        },
		requiresReload: true
	});
	
	/*
		LevelUp - auto add formulas
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "addFormulasOnLevelUp", {
		name: "Level Up: Add higher level version of known formulas upon level up.",
		hint: `If enabled, when leveled up will add higher level version of known formulas. 
		Ask for each = will prompt for each formula; 
		Ask for all = will prompt for all formulas at once; 
		Auto = will automatically add formulas.`,
		scope: "world",
		config: true,
		type: String,
		choices: {
			disabled: "Disabled",
			ask_all: "Ask for all",
			ask_each: "Ask for each",
			auto: "Auto"
		},
		default: "ask_all",
		requiresReload: true,
	});
	
	game.settings.register("pf2e-alchemist-remaster-ducttape", "handleLowerFormulasOnLevelUp", {
		name: "Level Up: Lower level formula handling:",
		hint: `Upon level up, will check for available lower level formulas, or remove them to keep your formula list small. 
		Add lower level versions = Will add lower level versions of known formulas; 
		Remove lower level versions (default) = Will Remove lower level formulas if a higher level is known.`,
		scope: "world",
		config: true,
		type: String,
		choices: {
			disabled: "Disabled.",
			add_lower: "Add lower level versions.",
			remove_lower: "Remove lower level versions."
		},
		default: "remove_lower",
		requiresReload: true,
	});
	
	game.settings.register("pf2e-alchemist-remaster-ducttape", "addFormulasPermission", {
		name: "Level Up: Permission level to add/remove formulas to actor:",
		hint: "(If actor owner is not logged in, GM will be prompted)",
		scope: "world",
		config: true,
		type: String,
		choices: {
			gm_only: "GM",
			actor_owner: "Owner"
		},
		default: "ask",
		requiresReload: true,
	});
	
	game.settings.register("pf2e-alchemist-remaster-ducttape", "addNewFormulasToChat", {
		name: "Level Up: Add the list of new/removed formulas upon level up to chat.",
		hint: "",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		requiresReload: true,
	});
	
	// Disable addNewFormulasToChat if addFormulasOnLevelUp is set to 'disabled'
	Hooks.on("renderSettingsConfig", (app, html, data) => {
		const controllerSetting = "pf2e-alchemist-remaster-ducttape.addFormulasOnLevelUp";
		const dependentSettings = [
			"pf2e-alchemist-remaster-ducttape.addNewFormulasToChat",
			"pf2e-alchemist-remaster-ducttape.addFormulasPermission",
            "pf2e-alchemist-remaster-ducttape.handleLowerFormulasOnLevelUp"
		];
		
		// Get the current value of the controller setting
		const enableAdvancedOptions = game.settings.get("pf2e-alchemist-remaster-ducttape", "addFormulasOnLevelUp");
		
		// Disable both dependent settings on initial render
		dependentSettings.forEach(setting => {
			const dependentInput = html.find(`input[name="${setting}"], select[name="${setting}"]`);
			if (dependentInput.length) {
				dependentInput.prop('disabled', enableAdvancedOptions === 'disabled');
			}
		});
		
		// Watch for changes to the controller setting
		html.find(`select[name="${controllerSetting}"]`).change((event) => {
			const selectedValue = event.target.value;
			
			// Update both dependent settings
			dependentSettings.forEach(setting => {
				const dependentInput = html.find(`input[name="${setting}"], select[name="${setting}"]`);
				if (dependentInput.length) {
					dependentInput.prop('disabled', selectedValue === 'disabled');
				}
			});
		});
	});

	
	/*
		Vial Search Reminders
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "vialSearchReminder", {
		name: "Vial search reminder",
		hint: "When at least 10 minutes in game time pass out of combat, prompt alchemist to add vials.",
		scope: "world", 
		config: true,    
		type: Boolean,   
		default: true,  
		requiresReload: true,
	});

	/* 
		Searchable Formulas
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "searchableFormulas", {
		name: "Enable Formula Search",
		hint: "Enables the search/filter for formulas on character sheet.",
		scope: "client", 
		config: true, 
		type: Boolean, 
        default: true, 
        onChange: (value) => {
            console.log(`PF2E Alchemist Remaster Duct Tape | FormulaSearch enabled: ${value}`);
        },
		requiresReload: true
	});
	
	/* 
		Collapse Item Description in chat
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "collapseChatDesc", {
		name: "Collapse item description in chat",
		hint: "Shortens chat messages with long item descriptions, click the Eye icon to expand.",
		scope: "world", 
		config: true, 
		type: Boolean,
        default: false,
        onChange: (value) => {
            console.log(`PF2E Alchemist Remaster Duct Tape | collapseChatDesc enabled: ${value}`);
        },
		requiresReload: false
	});
	
	Hooks.on("renderSettingsConfig", (app, html, data) => {
		const workbenchSettingKey = "xdy-pf2e-workbench.autoCollapseItemChatCardContent";
		const thisSettingKey = "pf2e-alchemist-remaster-ducttape.collapseChatDesc";

		// Check if Workbench is installed and active
		const isWorkbenchInstalled = game.modules.get("xdy-pf2e-workbench")?.active;

		//monitor for settings change of workbench collapse setting
		if (isWorkbenchInstalled) {
			// Get the current value of the Workbench setting
			const workbenchSettingValue = game.settings.get("xdy-pf2e-workbench", "autoCollapseItemChatCardContent");

			// Get this setting input field in the UI
			const thisSettingInput = html.find(`input[name="${thisSettingKey}"]`);

			// Disable or enable this setting based on the Workbench setting
			if (thisSettingInput.length) {
				if (workbenchSettingValue === "collapsedDefault" || workbenchSettingValue === "nonCollapsedDefault") {
					thisSettingInput.prop("disabled", true);
					thisSettingInput.parent().append(
						`<p class="notes" style="color: red;">This setting is disabled because xdy-pf2e-workbench is managing collapsible content.</p>`
					);
				} else if (workbenchSettingValue === "noCollapse") {
					thisSettingInput.prop("disabled", false);
				}
			}

			// Watch for changes to the Workbench setting in the UI
			html.find(`select[name="${workbenchSettingKey}"]`).change((event) => {
				const selectedValue = event.target.value;

				// Update this setting's state dynamically
				if (thisSettingInput.length) {
					if (selectedValue === "collapsedDefault" || selectedValue === "nonCollapsedDefault") {
						thisSettingInput.prop("disabled", true);
						thisSettingInput.parent().find(".notes").remove(); // Remove old notes
						thisSettingInput.parent().append(
							`<p class="notes" style="color: red;">This setting is disabled because xdy-pf2e-workbench is managing collapsible content.</p>`
						);
						game.settings.set("pf2e-alchemist-remaster-ducttape", "collapseChatDesc", false);
					} else if (selectedValue === "noCollapse") {
						thisSettingInput.prop("disabled", false);
						thisSettingInput.parent().find(".notes").remove(); // Remove old notes
					}
				}
			});
		}
	});

	/*
		Debugging
	*/
	// Register debugLevel setting
	game.settings.register("pf2e-alchemist-remaster-ducttape", "debugLevel", {
		name: "Debug Level",
		hint: "Set the debug level for logging. None disables all logging, All includes info, warnings, and errors.",
		scope: "world",
		config: true,
		type: String,
		choices: {
			"none": "None",
			"error": "Errors",
			"warn": "Warnings",
			"all": "All"
		},
		default: "none", // Default to no logging
		requiresReload: true
	});

	// Log debug status
	const debugLevel = game.settings.get("pf2e-alchemist-remaster-ducttape", "debugLevel");
	console.log(`%cPF2E Alchemist Remaster Duct Tape | Debugging Level: ${debugLevel}`,"color: aqua; font-weight: bold;");
});

Hooks.once("ready", () => {
    console.log("PF2e Alchemist Remaster Duct Tape | Ready hook triggered.");
    
    // Adjust collapseChatDesc based on the Workbench setting
    adjustCollapseSettingBasedOnWorkbench();
	
});