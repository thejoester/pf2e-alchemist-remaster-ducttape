console.log("%cPF2e Alchemist Remaster Duct Tape: settings.js loaded","color: aqua; font-weight: bold;");
Hooks.once("init", () => {
	
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