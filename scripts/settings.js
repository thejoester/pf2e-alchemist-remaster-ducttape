console.log("%cPF2e Alchemist Remaster Duct Tape: settings.js loaded","color: aqua; font-weight: bold;");
// Function for debugging
export function debugLog(logMsg, logType = "c", logLevel = "1") {
	const debugEnabled = game.settings.get("pf2e-alchemist-remaster-ducttape", "debugEnabled");
	if (!debugEnabled && logLevel != 3) return;
		
		// Capture stack trace to get file and line number
		const stack = new Error().stack.split("\n")[2].trim(); // Get the 2nd line where this function is called
		const fileInfoMatch = stack.match(/(\/[^)]+):(\d+):(\d+)/); // Match file path and line number
		let fileInfo = "Unknown Source";
		if (fileInfoMatch) {
			const [, filePath, lineNumber] = fileInfoMatch;
			const fileName = filePath.split("/").pop(); // Extract just the file name
			fileInfo = `${fileName}:${lineNumber}`;
		}

		// Prepend the file and line info to the log message
		const formattedLogMsg = `[${fileInfo}] ${logMsg}`;

		switch (logType) {
			case "c": //console
				switch (logLevel) {
					case "1": // info/log
						console.log(`%cP2Fe Alchemist Duct Tape | ${formattedLogMsg}`,"color: aqua; font-weight: bold;");
						break;
					case "2": // warn
						console.warn(`P2Fe Alchemist Duct Tape | ${formattedLogMsg}`);
						break;
					case "3": // error
						console.error(`P2Fe Alchemist Duct Tape | ${formattedLogMsg}`);
						break;
					default:
						console.log(`%cP2Fe Alchemist Duct Tape | ${formattedLogMsg}`,"color: aqua; font-weight: bold;");
				}
				break;
			case "u": // ui
				switch (logLevel) {
					case "1": // info/log
						ui.notifications.info(`Alchemist Duct Tape | ${logMsg}`);
						break;
					case "2": // warn
						ui.notifications.warn(`Alchemist Duct Tape | ${logMsg}`);
						break;
					case "3": // error
						ui.notifications.error(`Alchemist Duct Tape | ${logMsg}`);
						break;
					default:
						ui.notifications.info(logMsg);
				}
				break;
			default:
				console.warn(`P2Fe Alchemist Duct Tape | ${fileInfo} Invalid log event.`);
		}
}

// Dummy form for settings headers
class DummyForm extends FormApplication {
    /** @override */
    render() {
        return;
    }
}


Hooks.once("init", () => {
	
	
	/*
	
		Saved Data Settings
	
	*/
	game.settings.register('pf2e-alchemist-remaster-ducttape', 'lastProcessedTime', {
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
	game.settings.register("pf2e-alchemist-remaster-ducttape", "showQACounts", {
		name: "Quick Alchemy: Show forumla counts",
		hint: "If enabled, will show the number of available formulas.",
		scope: "world", // "client" or "world" depending on your use case
		config: true,    // Whether to show this in the module settings UI
		default: false,  // The default value of the setting
		type: Boolean,   // The type of setting (true/false)
		requiresReload: true,
	});
	
	/* 
		Sized Based Alchemy Settings
	*/
	console.log("%cPF2E Alchemist Remaster Duct Tape | Initializing Tiny Alchemy settings...","color: aqua; font-weight: bold;");
	game.settings.register("pf2e-alchemist-remaster-ducttape", "enableSizeBasedAlchemy", {
		name: "Enable size-based alchemy for Quick Alchemy",
		hint: "Adjust the size of items created by Quick Alchemy to match the creature's size.",
		scope: "world", // "world" makes it available to all players; use "client" for a single user
		config: true, // Show this setting in the configuration UI
		type: String, // Dropdown uses a string type
		choices: {
			disabled: "Disabled",
			tinyOnly: "Tiny Only",
			allSizes: "All Sizes"
		},
		default: "tinyOnly", // Default value
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
		scope: "world", // "world" makes it available to all players; use "client" for a single user
		config: true, // Show this setting in the configuration UI
		type: Boolean, // Checkbox input type
        default: true, // Default value is unchecked
        onChange: (value) => {
            console.log(`PF2E Alchemist Remaster Duct Tape | Powerful Alchemy enabled: ${value}`);
        },
		requiresReload: true
	});
	
	/*
		LevelUp - auto add formulas
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "addFormulasOnLevelUp", {
		name: "Add higher level version of known formulas upon levelup.",
		hint: "If enabled, when leveled up will add higher level version of known formulas. Ask = will prompt for each formula; Auto = will automatically add formula.",
		scope: "world", // "client" or "world" depending on your use case
		config: true,    // Whether to show this in the module settings UI
		type: String, // Dropdown uses a string type
		choices: {
			disabled: "Disabled",
			ask: "Ask",
			auto: "Auto"
		},
		default: "ask",  // The default value of the setting
		requiresReload: true,
	});
	
	/*
		Vial Search Reminders
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "vialSearchReminder", {
		name: "Vial search reminder",
		hint: "When 10 minutes in game time pass out of combat, prompt alchemist to add vials.",
		scope: "world", // "client" or "world" depending on your use case
		config: true,    // Whether to show this in the module settings UI
		type: Boolean,   // The type of setting (true/false)
		default: true,  // The default value of the setting
		requiresReload: true,
	});
	

	/* 
		Searchable Formulas
	*/
	console.log("%cPF2E Alchemist Remaster Duct Tape | Initializing Formula Search settings...","color: aqua; font-weight: bold;");
	game.settings.register("pf2e-alchemist-remaster-ducttape", "searchableFormulas", {
		name: "Enable Formula Search",
		hint: "Enables the search/filter for formulas on character sheet.",
		scope: "client", // "world" makes it available to all players; use "client" for a single user
		config: true, // Show this setting in the configuration UI
		type: Boolean, // Checkbox input type
        default: true, // Default value is unchecked
        onChange: (value) => {
            console.log(`PF2E Alchemist Remaster Duct Tape | FormulaSearch enabled: ${value}`);
        },
		requiresReload: true
	});
	
	/*
		Debugging
	*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "debugEnabled", {
		name: "Enable Debugging",
		hint: "If enabled, debugging logs will be output.",
		scope: "world", // "client" or "world" depending on your use case
		config: true,    // Whether to show this in the module settings UI
		default: false,  // The default value of the setting
		type: Boolean,   // The type of setting (true/false)
		requiresReload: true,
	});
	const debugEnabled = game.settings.get("pf2e-alchemist-remaster-ducttape", "debugEnabled");
	if (debugEnabled){
		console.log("%cPF2E Alchemist Remaster Duct Tape | Debugging Enabled","color: aqua; font-weight: bold;");
	} else {
		console.log("%cPF2E Alchemist Remaster Duct Tape | Debugging Disabled","color: aqua; font-weight: bold;");
	}

});