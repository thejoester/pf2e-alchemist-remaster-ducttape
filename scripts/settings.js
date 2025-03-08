import { LOCALIZED_TEXT } from "./localization.js";
console.log("%cPF2e Alchemist Remaster Duct Tape | settings.js loaded","color: aqua; font-weight: bold;");
/*
	Function for debugging
*/
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
	Function to check setting and return it
	will ONLY work for settings for this module!
*/
export function getSetting(settingName, returnIfError = false) {
    // Validate the setting name
    if (typeof settingName !== "string" || settingName.trim() === "") {
        debugLog(3, `Invalid setting name provided: ${settingName}`);
        return returnIfError; // Return undefined or a default value
    }

    // Check if the setting is registered
    if (!game.settings.settings.has(`pf2e-alchemist-remaster-ducttape.${settingName}`)) {
        debugLog(3, `Setting "${settingName}" is not registered.`);
        return returnIfError; // Return undefined or a default value
    }

    try {
        // Attempt to retrieve the setting value
        const value = game.settings.get("pf2e-alchemist-remaster-ducttape", settingName);
        //debugLog(1, `Successfully retrieved setting "${settingName}":`, value);
        return value;
    } catch (error) {
        // Log the error and return undefined or a default value
        debugLog(3, `Failed to get setting "${settingName}":`, error);
        return returnIfError;
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
	
    // Check if the actor has the localized Alchemist Dedication feat
    const hasAlchemistDedication = hasFeat(actor, "alchemist-dedication");

	debugLog(`${actor.name} is Alchemist: ${isAlchemistClass} | Alchemist Dedication: ${hasAlchemistDedication}`);

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
  Function to check if actor has any active logged in owners
*/
export function hasActiveOwners(actor) {
    // Get owners with ownership level 3 ('Owner')
    const owners = Object.keys(actor.ownership).filter(userId => actor.ownership[userId] === 3);

    // Filter for logged-in owners who are not GMs
    const loggedInOwners = game.users.contents.filter(user => owners.includes(user.id) && user.active && !user.isGM);

    // Debug output
    debugLog(`Owners: ${owners.join(', ')}, Logged-in owners (non-GM): ${loggedInOwners.map(u => u.name).join(', ')}`);

    // Return whether any non-GM logged-in owners exist
    return loggedInOwners.length > 0;
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
        console.log(game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_WORKBENCH_NOT_FOUND"));
        return;
    }
    const currentWorkbenchSetting = game.settings.get("xdy-pf2e-workbench", "autoCollapseItemChatCardContent");

    // Check if the collapseChatDesc setting exists
    if (!game.settings.settings.has(settingKey)) return;

    // If Workbench is managing collapsibility, set collapseChatDesc to false
    if (currentWorkbenchSetting === "collapsedDefault" || currentWorkbenchSetting === "nonCollapsedDefault") {
        if (game.settings.get("pf2e-alchemist-remaster-ducttape", "collapseChatDesc") === true) {
            game.settings.set("pf2e-alchemist-remaster-ducttape", "collapseChatDesc", false);
            console.log("PF2e Alchemist Remaster Duct Tape | xdy-pf2e-workbench is managing collapsibility.");
        }
    }
}

/*
	AddCompendiumsApp class object
*/
window.AddCompendiumsApp = class AddCompendiumsApp extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_MANAGE_HOMEBREW_COMPENDIUM"),
            template: 'modules/pf2e-alchemist-remaster-ducttape/templates/add-compendiums.html',
            width: 600,
            height: 'auto',
            closeOnSubmit: false
        });
    }

    getData() {
        const savedCompendiums = game.settings.get('pf2e-alchemist-remaster-ducttape', 'compendiums') || [];
        return {
            savedCompendiums,
            tempCompendiums: this.tempCompendiums || []
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Add a compendium to the temporary list
        html.find('#add-compendium-btn').click(() => {
            const input = html.find('#compendium-input').val().trim();
            if (!input) return;

            const pack = game.packs.get(input);
            if (this.tempCompendiums?.some(comp => comp.name === input)) {
                ui.notifications.warn(game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_COMPENDIUM_ALREADY_IN_LIST(input)"));
                return;
            }

            if (!pack || pack.documentName !== 'Item') {
                ui.notifications.error(game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_COMPENDIUM_INVALID(input)"));
                return;
            }
            this.tempCompendiums = [...(this.tempCompendiums || []), { name: input, valid: !!pack }];
            this.render();
        });

        // Remove a compendium from the temporary list
        html.find('.delete-compendium').click((event) => {
            const index = parseInt(event.currentTarget.dataset.index);
            this.tempCompendiums.splice(index, 1);
            this.render();
        });

        // Remove a saved compendium
        html.find('.delete-saved-compendium').click(async (event) => {
            const compendiumToDelete = event.currentTarget.dataset.name;
            const savedCompendiums = game.settings.get('pf2e-alchemist-remaster-ducttape', 'compendiums') || [];
            const updatedCompendiums = savedCompendiums.filter(c => c !== compendiumToDelete);

            await game.settings.set('pf2e-alchemist-remaster-ducttape', 'compendiums', updatedCompendiums);
            ui.notifications.info(game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_COMPENDIUM_REMOVED(compendiumToDelete)"));
            this.render();
        });

        // Save compendiums when the Save button is clicked
        html.find('#save-compendiums-btn').click(async () => {
            const savedCompendiums = game.settings.get('pf2e-alchemist-remaster-ducttape', 'compendiums') || [];
            const uniqueCompendiums = new Map(); // Use Map to avoid duplicates

            let invalidEntries = [];
            for (const { name, valid } of this.tempCompendiums || []) {
                if (valid) uniqueCompendiums.set(name, true);
                else invalidEntries.push(name);
            }

            if (invalidEntries.length > 0) {
                new Dialog({
                    title: 'Invalid or Duplicate Entries',
                    content: `${game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_COMPENDIUM_LIST_INVALID")}<br>${invalidEntries.join('<br>')}`,
                    buttons: {
                        ok: {
                            icon: '<i class="fas fa-check"></i>',
                            label: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.OK")
                        }
                    }
                }).render(true);
            }

            // Save valid entries
            await game.settings.set(
                'pf2e-alchemist-remaster-ducttape',
                'compendiums',
                [...new Set([...savedCompendiums, ...uniqueCompendiums.keys()])]
            );
            ui.notifications.info(game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_SAVED"));
            this.tempCompendiums = [];
            this.close();
        });
    }

    async _updateObject(event, formData) {
        // No action needed since save is handled manually
    }
};

Hooks.once("init", () => {
	
/*	
	Saved Data Settings
*/
	// Tracks the last processed time for exploration mode
	game.settings.register('pf2e-alchemist-remaster-ducttape', 'explorationTime', {
        name: 'Last Processed Time',
        scope: 'world',
        config: false,
        type: Number,
        default: 0
    });
	// Tracks the last recorded world time to calculate elapsed time
	game.settings.register('pf2e-alchemist-remaster-ducttape', 'previousTime', {
		name: 'Previous World Time',
		scope: 'world',
		config: false,
		type: Number,
		default: 0
	});
	
/*
	QUICK ALCHEMY SETTINGS
*/
	
	// Quick Alchemy: remove temporary items at end of turn
	game.settings.register("pf2e-alchemist-remaster-ducttape", "removeTempItemsAtTurnChange", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_REMOVE_TEMP_START_TURN"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: false,
	});
	
	// Quick Alchemy: remove temporary items at end of combat
	game.settings.register("pf2e-alchemist-remaster-ducttape", "removeTempItemsAtEndCombat", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_REMOVE_TEMP_END_COMBAT"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: false,
	});
	
	// Quick Alchemy: Send chat message when removing temp quick alchemy items
	game.settings.register("pf2e-alchemist-remaster-ducttape", "createRemovedTempItemsMsg", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_SEND_CHAT_REMOVE_TEMP"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: false,
	});
	
	// Send attack messages to chat
	game.settings.register("pf2e-alchemist-remaster-ducttape", "sendAtkToChat", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_SEND_CRAFTED_ITEM_TO_CHAT"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_SEND_CRAFTED_ITEM_TO_CHAT_HINT"),
		scope: "world",
		config: true,    
		default: false,  
		type: Boolean,   
		requiresReload: false,
	});
	
	// Sized Based Alchemy Settings
	game.settings.register("pf2e-alchemist-remaster-ducttape", "enableSizeBasedAlchemy", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_SIZEBASED_ALCHEMY"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_SIZEBASED_ALCHEMY_HINT"),
		scope: "world",
		config: true,
		type: String,
		choices: {
			disabled: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.DISABLED"),
			tinyOnly: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.TINY_ONLY"),
			allSizes: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.ALL_SIZES")
		},
		default: "tinyOnly",
		onChange: (value) => {
			console.log(`PF2E Alchemist Remaster Duct Tape | Size-based alchemy mode set to: ${value}`);
		},
		requiresReload: false
	});
	
/* 
	Powerful Alchemy Settings
*/
	console.log("%cPF2E Alchemist Remaster Duct Tape | Initializing Powerful Alchemy settings...","color: aqua; font-weight: bold;");
	game.settings.register("pf2e-alchemist-remaster-ducttape", "enablePowerfulAlchemy", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_ENABLE_POWERFUL_ALCHEMY"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_ENABLE_POWERFUL_ALCHEMY_HINT"),
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
	// Add higher level versions of known formulas on level up?
	game.settings.register("pf2e-alchemist-remaster-ducttape", "addFormulasOnLevelUp", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_ADD_HIGHER"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_ADD_HIGHER_HINT"),
		scope: "world",
		config: true,
		type: String,
		choices: {
			disabled: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.DISABLED"),
			ask_all: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.ASK_ALL"),
			ask_each: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.ASK_EACH"),
			auto: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.AUTO")
		},
		default: "ask_all",
		requiresReload: false,
	});
	
	// How to handle lower level formulas
	game.settings.register("pf2e-alchemist-remaster-ducttape", "handleLowerFormulasOnLevelUp", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_HANDLE_LOWER_LEVEL"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_HANDLE_LOWER_LEVEL_HINT"),
		scope: "world",
		config: true,
		type: String,
		choices: {
			disabled: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.DISABLED"),
			add_lower: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.ADD_LOWER"),
			remove_lower: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.REMOVE_LOWER")
		},
		default: "remove_lower",
		requiresReload: false,
	});
	
	// Prompt setting for handleLowerFormulasOnLevelUp
	game.settings.register("pf2e-alchemist-remaster-ducttape", "promptLowerFormulasOnLevelUp", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_PROMPT_REMOVE_LOWER_LEVEL"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_PROMPT_REMOVE_LOWER_LEVEL_HINT"),
		scope: "world",
		config: true,
		type: String,
		choices: {
			auto_lower: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.AUTO"),
			ask_all_lower: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.ASK_ALL"),
			ask_each_lower: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.ASK_EACH")
		},
		default: "ask_all_lower",
		requiresReload: false,
	});
	
	// Who is asked by default to add/remove formulas
	game.settings.register("pf2e-alchemist-remaster-ducttape", "addFormulasPermission", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_PERMISSION_LEVEL"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_PERMISSION_LEVEL_HINT"),
		scope: "world",
		config: true,
		type: String,
		choices: {
			gm_only: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.GM"),
			actor_owner: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.OWNER")
		},
		default: "actor_owner",
		requiresReload: false,
	});
	
	// add list of new formulas learned to chat
	game.settings.register("pf2e-alchemist-remaster-ducttape", "addNewFormulasToChat", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_LEVELUP_SEND_NEW_REMOVED_TO_CHAT"),
		hint: "",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		requiresReload: false,
	});
	
	game.settings.register('pf2e-alchemist-remaster-ducttape', 'compendiums', {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_COMPENDIUM_CHECK"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_COMPENDIUM_CHECK_HINT"),
		scope: 'world',
		config: false,
		type: Array,
		default: []
	});

	game.settings.registerMenu('pf2e-alchemist-remaster-ducttape', 'addCompendiumsMenu', {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_ADD_COMPENDIUM"),
		label: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_ADD_COMPENDIUM_LABEL"), // This will be the button text
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_ADD_COMPENDIUM_HINT"),
		icon: 'fas fa-plus-circle', // Icon for the button
		type: AddCompendiumsApp, // The FormApplication class to open
		restricted: true // Only accessible by GMs
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
	Vial Search 
*/
	// Enable Vial Search
	game.settings.register("pf2e-alchemist-remaster-ducttape", "vialSearchReminder", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_VIAL_SEARCH_REMINDER"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_VIAL_SEARCH_REMINDER_HINT"),
		scope: "world", 
		config: true,    
		type: Boolean,   
		default: true,  
		requiresReload: true,
	});
	
	// Suppress "Max Vials" Message
	game.settings.register("pf2e-alchemist-remaster-ducttape", "maxVialsMessage", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DISPLAY_MAX_VIAL"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DISPLAY_MAX_VIAL_HINT"),
		scope: "world", 
		config: true,    
		type: Boolean,   
		default: false,  
		requiresReload: false,
	});
	
/* 
	Searchable Formulas
*/
	game.settings.register("pf2e-alchemist-remaster-ducttape", "searchableFormulas", {
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_ENABLE_FORMULA_SEARCH"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_ENABLE_FORMULA_SEARCH_HINT"),
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
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_COLLAPSE_ITEM_DESC_CHAT"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_COLLAPSE_ITEM_DESC_CHAT_HINT"),
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
						`<p class="notes" style="color: red;">${game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DISABLED_WORKBENCH")}</p>`
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
							`<p class="notes" style="color: red;">${game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DISABLED_WORKBENCH")}</p>`
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
		name: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DEBUG_LEVEL"),
		hint: game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DEBUG_LEVEL_HINT"),
		scope: "world",
		config: true,
		type: String,
		choices: {
			"none": game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DEBUG_NONE"),
			"error": game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DEBUG_ERROR"),
			"warn": game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DEBUG_WARN"),
			"all": game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.SETTING_DEBUG_ALL")
		},
		default: "none", // Default to no logging
		requiresReload: false
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