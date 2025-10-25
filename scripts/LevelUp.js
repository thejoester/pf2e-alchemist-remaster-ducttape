import { debugLog, getSetting, hasFeat, isAlchemist, hasActiveOwners  } from './settings.js';
import { qaGetIndexEntry, qaGetSlugFromUuid, getAlchIndex } from "./AlchIndex.js";
import { LOCALIZED_TEXT } from "./localization.js";
console.log("%cPF2e Alchemist Remaster Duct Tape | LevelUp.js loaded","color: aqua; font-weight: bold;");

// Settings placeholders
let addFormulasSetting = "disabled";
let addNewFormulasToChat = false;
let addFormulasPermission = "gm_only"; 
let handleLowerFormulasOnLevelUp = "disabled";
let promptLowerFormulasOnLevelUp = "ask_each_lower";
let pauseFlags = false;

Hooks.once('ready', async () => {
	
	// Clear any stuck flags
	pauseFlags = true;
	await clearFlags();
	pauseFlags = false;
	
	window.promptTokenFormulaAdd = promptTokenFormulaAdd;
	window.promptTokenFormulaRemove = promptTokenFormulaRemove;

	getAlchemistLevels();
	
});	

Hooks.once('init', () => {
	
	// Get Settings
    addFormulasSetting = getSetting("addFormulasOnLevelUp","disabled");
	handleLowerFormulasOnLevelUp = getSetting("handleLowerFormulasOnLevelUp","disabled");
	addNewFormulasToChat = getSetting("addNewFormulasToChat");
	addFormulasPermission = getSetting("addFormulasPermission","actor_owner");
	promptLowerFormulasOnLevelUp = getSetting('promptLowerFormulasOnLevelUp');
	
    if (addFormulasSetting !== "disabled") {
        // Hook into updateActor to detect level-ups and grant Alchemist formulas
        Hooks.on('updateActor', async (actor, updateData, options, userId) => {
			if (pauseFlags) return;
			// Prevent recursion and unnecessary execution of code when cleaning formulas or processing update
			if (actor.getFlag('pf2e-alchemist-remaster-ducttape', 'cleaningDuplicates') || 
				actor.getFlag('pf2e-alchemist-remaster-ducttape', 'processingUpdate')) {
				debugLog(`Skipping to prevent recursion or duplicate processing for ${actor.name}`);
				return;
			}
				
			// Make sure selected token is an alchemist or has archetype
			const alchemistCheck = isAlchemist(actor);
			if (!alchemistCheck.qualifies) {
				debugLog(`Selected Character (${actor.name}) is not an Alchemist - Ignoring`);
				return;
			}
			
			// Check permissions
            if (!canManageFormulas(actor)) return;
			
            // Check if the level was updated
            const newLevel = updateData?.system?.details?.level?.value;
            if (newLevel === undefined) {
                debugLog(`No level change detected for ${actor.name}.`);
                return;
            }
			debugLog(`Actor Level change detected for ${actor.name}! New Level = ${newLevel} 
				= Settings =
				addFormulasSetting: ${addFormulasSetting} | 
				handleLowerFormulasOnLevelUp: ${handleLowerFormulasOnLevelUp} | 
				addNewFormulasToChat: ${addNewFormulasToChat} | 
				addFormulasPermission: ${addFormulasPermission}`); 
				
            
			// Set Flag to prevent duplicate processing
			await actor.setFlag('pf2e-alchemist-remaster-ducttape', 'processingUpdate', true);
			debugLog("Set Flag: processingUpdate");
            // Update formulas
            await grantAlchemistFormulas(actor, newLevel);
			if (handleLowerFormulasOnLevelUp === "remove_lower" ) {
				await removeLowerLevelFormulas(actor);
			}
			await actor.setFlag('pf2e-alchemist-remaster-ducttape', 'previousLevel', actor.system.details.level.value);	
			debugLog(`Previous level flag set for ${actor.name} = ${actor.system.details.level.value}`);
			
			// Clear flag for future processing
			await actor.unsetFlag('pf2e-alchemist-remaster-ducttape', 'processingUpdate');
			debugLog("Cleared Flag: processingUpdate");
        });
    }
});

//	Grant new formulas to Alchemists as they level up.
async function grantAlchemistFormulas(actor, newLevel, mode = addFormulasSetting, previousLevel) {
	
	const loadingDialog = new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.MACRO_WAIT_TITLE },
		content: `
			<p>${LOCALIZED_TEXT.MACRO_CHECKING_NEW_FORMULAS}</p>
			<div class="progress-bar-container" style="width: 100%; height: 20px; background: #444; border-radius: 5px; overflow: hidden;">
				<div id="progress-fill" style="width: 0%; height: 100%; background: #0c8; transition: width 0.2s;"></div>
			</div>
			<p id="progress-text" style="text-align: center; font-size: 0.9em; margin-top: 5px;">0%</p>
			`,
		buttons: [
			{
			  action: "hidden",
			  label: LOCALIZED_TEXT.OK,
			  icon: "",
			  callback: () => {}
			}
		],
		render: (html) => {
			// Hide the button row with CSS
			const footer = html[0].querySelector(".window-content-footer");
			if (footer) footer.style.display = "none";
		}
	});
	loadingDialog.render(true);
	updateLoadingProgress(10);
	
	debugLog(`grantAlchemistFormulas() | mode: ${mode}`);
    debugLog(`Checking for new formulas for ${actor.name} for level ${newLevel}.`);
	debugLog(`Previous Level for ${actor.name}: ${previousLevel}.`);
	updateLoadingProgress(15);
	
    
    // Extract the UUIDs from the actor's known formulas
    const knownFormulaUUIDs = actor.system.crafting.formulas.map(f => (typeof f.uuid === 'string' ? f.uuid : null)).filter(Boolean);
    debugLog(`Known formula UUIDs for ${actor.name}:\n ${knownFormulaUUIDs.join('\n')}`);
	updateLoadingProgress(30);
	
    // Extract base slugs from the known UUIDs
	debugLog(`Starting Task: Extract base slugs from the known UUIDs`);
    const knownBaseSlugs = await Promise.all(
        knownFormulaUUIDs.map(async (uuid) => {
            try {
                const slug = await qaGetSlugFromUuid(uuid);
				return slug ? extractBaseSlug(slug) : null;
            } catch (error) {
                debugLog(3, `Error extracting item for UUID: ${uuid} | Error: ${error.message}`, error);
                return null;
            }
        })
    );
	debugLog(`Finished Task: Extract base slugs from the known UUIDs\n`, knownBaseSlugs);
	updateLoadingProgress(40);

    // Filter out duplicates and null values
	debugLog(`Starting Task: Filter out duplicates and null values`);
    const deduplicatedBaseSlugs = [...new Set(knownBaseSlugs.filter(Boolean))];
    debugLog("Deduplicated base slugs:", deduplicatedBaseSlugs);
	debugLog(`Finished Task: Filter out duplicates and null values`);
    
	if (deduplicatedBaseSlugs.length === 0) {
        debugLog(2, `No base formulas found for ${actor.name} \n`, deduplicatedBaseSlugs );
		loadingDialog.close();
        return;
    }
	updateLoadingProgress(50);
	// Collect Index items that match base slug of deduplicatedBaseSlugs
    const itemsToCheck = processIndex(deduplicatedBaseSlugs); 
	debugLog(`Finished Task: Collect Index items that match base slug of deduplicatedBaseSlugs \n`, itemsToCheck );
	updateLoadingProgress(80);
	
    // 3. Filter items by level, traits, and rarity
	debugLog(`Starting Task: Filter items by level, traits, and rarity`);
    previousLevel ??= actor.getFlag('pf2e-alchemist-remaster-ducttape', 'previousLevel') || 1;
	debugLog(`Previous level for ${actor.name}: ${previousLevel} | New Level: ${newLevel}`);

    const filteredItems = itemsToCheck.filter(item => {
		const isAlchemical = item.traits?.includes('alchemical');
        const isCommon = item.rarity === 'common';
        const levelCheck = item.level <= newLevel && item.level > previousLevel;
        // return isAlchemical && isCommon && levelCheck;
		return isAlchemical && levelCheck;
    });
	
	debugLog(`Finished Task: Filter items by level, traits, and rarity: \n`, filteredItems);
    debugLog(`Filtered items for ${actor.name}:`, filteredItems);
	updateLoadingProgress(90);
	loadingDialog.close();
	
	debugLog(`Starting Task: let newFormulaUUIDs = filteredItems.map(item => item.uuid)`);
    let newFormulaUUIDs = filteredItems.map(item => item.uuid);
    debugLog(`New formula UUIDs:\n${newFormulaUUIDs.join('\n')}`);
	
	
    if (newFormulaUUIDs.length === 0) {
        debugLog(`No new formulas to add for ${actor.name}.`);
        return;
    }
	
	// Filter out already known fomrulas by UUID
	let skippedFormulas = [];
    const newFilteredFormulaUUIDs = [];
	for (const uuid of newFormulaUUIDs) {
	  if (!knownFormulaUUIDs.includes(uuid)) {
		newFilteredFormulaUUIDs.push(uuid);
	  } else {
		skippedFormulas.push(uuid);
	  }
	}
	debugLog(`Skipping already known formulas:\n${skippedFormulas.join('\n')}`);
	newFormulaUUIDs = newFilteredFormulaUUIDs;
    debugLog(`Adding the following new formulas to ${actor.name}:\n${newFormulaUUIDs.join('\n')}`);
	
	const overlap = newFormulaUUIDs.filter(f => knownFormulaUUIDs.includes(f));
	debugLog(`Found ${overlap.length} overlapping UUIDs:\n${overlap.join("\n")}`);

    // Collect added formulas for the chat message
    let addedFormulas = [];
	
	updateLoadingProgress(100);
	
    // Check setting to see if we are asking for each formula
    if (mode === "ask_each") {
		loadingDialog.close();
        for (const uuid of newFormulaUUIDs) {
            const item = await qaGetIndexEntry(uuid);
            if (!item) continue;

            const confirmed = await showFormulaDialog(actor, item, item.level.value);
            if (confirmed) {
                const newFormulaObject = { uuid };
                const updatedFormulaObjects = [...actor.system.crafting.formulas, newFormulaObject];
                try {
                    await actor.update({ 'system.crafting.formulas': updatedFormulaObjects });
                } catch (error) {
                    debugLog(`Error updating formulas for ${actor.name}: ${error.message}`);
                }
                debugLog(`${actor.name} has learned the formula for ${item.name}.`);
                addedFormulas.push(item.name);
            } else {
                debugLog(`User declined to add formula ${item.name} to ${actor.name}.`);
            }
        }
        // Send new formula list to chat
        newFormulasChatMsg(actor.name, addedFormulas.join('<br>'), addedFormulas.length);
    } else if (mode === "ask_all") { // If we are asking for all at once
		loadingDialog.close();
        const formulasToPrompt = [];
        for (const uuid of newFormulaUUIDs) {
            const item = await qaGetIndexEntry(uuid);
            if (!item) continue;
            formulasToPrompt.push({ uuid, name: item.name, level: item.level });
        }
        if (formulasToPrompt.length > 0) { // Make sure list is not empty
            const formulaNames = formulasToPrompt.map(f => f.name);
            // Add the formula names to the list
            addedFormulas.push(...formulaNames);

            // Show dialog with all formulas to add
            const confirmed = await showFormulaListDialog(actor, formulasToPrompt);
            if (confirmed) { // If player clicked "yes"
                const newFormulaObjects = formulasToPrompt.map(f => ({ uuid: f.uuid }));
                const existingUUIDs = new Set(actor.system.crafting.formulas.map(f => f.uuid));
				const updatedFormulaObjects = [
					...actor.system.crafting.formulas,
					...newFormulaUUIDs.filter(uuid => !existingUUIDs.has(uuid)).map(uuid => ({ uuid }))
				];
                await actor.update({ 'system.crafting.formulas': updatedFormulaObjects });
                debugLog(`${actor.name} has learned ${formulasToPrompt.length} new formulas.`);
                // Send new formula list to chat
                newFormulasChatMsg(actor.name, addedFormulas.join('<br>'), addedFormulas.length);
            } else {
                debugLog(`User declined to add formulas to ${actor.name}.`);
            }
        }
    } else if (mode === "auto") {
        const newFormulaObjects = newFormulaUUIDs.map(uuid => ({ uuid }));
        const updatedFormulaObjects = [...actor.system.crafting.formulas, ...newFormulaObjects];
        const validUUIDs = updatedFormulaObjects.filter(obj => obj && obj.uuid && typeof obj.uuid === 'string' && obj.uuid.startsWith('Compendium.'));
        try {
            await actor.update({ 'system.crafting.formulas': validUUIDs });
            debugLog(`${actor.name} has learned ${newFormulaUUIDs.length} new formulas.`);
            // Get the names of the added formulas
            const formulaNames = await Promise.all(newFormulaUUIDs.map(async (uuid) => {
                const item = await qaGetIndexEntry(uuid);
                return item?.name ?? 'Unknown Formula';
            }));
            // Add the formula names to the list
            addedFormulas.push(...formulaNames);
            // Send new formula list to chat
            newFormulasChatMsg(actor.name, addedFormulas.join('<br>'), addedFormulas.length);
        } catch (error) {
            debugLog(3, `Error updating formulas for ${actor.name}: ${error.message}`);
        }
    }
}

//	Removes lower-level versions of formulas from the actor's known formulas if higher-level versions are present.
async function removeLowerLevelFormulas(actor, mode = promptLowerFormulasOnLevelUp) {
	
	debugLog(`removeLowerLevelFormulas() | mode: ${mode}`);
    debugLog(`Checking for lower level formulas for ${actor.name}`);
	
	// Display dialog
	const loadingDialog = new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.MACRO_WAIT_TITLE },
		content: `
			<p>${LOCALIZED_TEXT.MACRO_CHECKING_LOWER_FORMULAS}</p>
			<div class="progress-bar-container" style="width: 100%; height: 20px; background: #444; border-radius: 5px; overflow: hidden;">
				<div id="progress-fill" style="width: 0%; height: 100%; background: #0c8; transition: width 0.2s;"></div>
			</div>
			<p id="progress-text" style="text-align: center; font-size: 0.9em; margin-top: 5px;">0%</p>
		`,
		buttons: [
			{
			  action: "hidden",
			  label: LOCALIZED_TEXT.OK,
			  icon: "",
			  callback: () => {}
			}
		],
		render: (html) => {
			// Hide the button row with CSS
			const footer = html[0].querySelector(".window-content-footer");
			if (footer) footer.style.display = "none";
		}
	});
	loadingDialog.render(true);
	
    const knownFormulas = actor.system.crafting.formulas;
    const formulaMap = new Map(); // Map to store the highest-level version of each base formula
    let removedFormulas = []; // Track removed formulas
	

    const total = knownFormulas.length;
	for (let i = 0; i < total; i++) {
		const formula = knownFormulas[i];

		const item = await fromUuidSync(formula.uuid);
		if (!item) {
			debugLog(`Unable to retrieve item for formula UUID: ${formula.uuid}`);
			continue;
		}

		const baseSlug = extractBaseSlug(item.system.slug);
		if (!baseSlug) {
			debugLog(`Skipping formula with invalid slug: ${item.name}`);
			continue;
		}
		
		// Skip if this is non-standard alchemical item
		if (isNonStandardVariant(baseSlug)){
			debugLog(`Skipping formula ${item.name}: non-standard slug naming`);
			continue;
		}

		const level = Number(item.system.level.value);
		const currentLevel = formulaMap.has(baseSlug) ? formulaMap.get(baseSlug).level : null;

		if (!formulaMap.has(baseSlug) || currentLevel < level) {
			if (formulaMap.has(baseSlug)) {
				const lowerLevelFormula = formulaMap.get(baseSlug);
				removedFormulas.push(lowerLevelFormula);
				debugLog(`Replacing ${lowerLevelFormula.name} (Level ${lowerLevelFormula.level}) with ${item.name} (Level ${level}) as the highest-level version of ${baseSlug}.`);
			}
			formulaMap.set(baseSlug, { uuid: formula.uuid, level, name: item.name });
			debugLog(`Setting ${item.name} (Level ${level}) as the highest-level version of ${baseSlug}.`);
		} else {
			removedFormulas.push({ uuid: formula.uuid, name: item.name, level, baseSlug });
			debugLog(`Marking ${item.name} (Level ${level}) for removal.`);
		}

		// ✅ Progress update
		const progress = Math.round(((i + 1) / total) * 100);
		updateLoadingProgress(progress);
	}

    // If no formulas to remove, exit early
    if (removedFormulas.length === 0) {
        debugLog(`No lower-level formulas to remove for ${actor.name}.`);
		loadingDialog.close();
		return;
    }
	
	// Close Dialog if open
	loadingDialog.close();
	
    // Handle ask_all_lower: Compile and prompt for all at once
    if (mode === "ask_all_lower") {
        const confirmed = await showFormulaListDialog(actor, removedFormulas.map(f => ({
            uuid: f.uuid,
            name: f.name,
            level: f.level
        })), true);

        if (!confirmed) {
            debugLog(`User declined to remove lower-level formulas for ${actor.name}.`);
			return; // Exit if user cancels
        }
    } else if (mode === "ask_each_lower") {
		// Handle ask_each_lower: Prompt for each formula individually
		const keptFormulas = [];
		for (const formula of removedFormulas) {
			const confirmed = await showFormulaDialog(actor, { name: formula.name, level: formula.level }, formula.level, true);
			if (!confirmed) {
				debugLog(`Chose to keep ${formula.uuid} ${formula.name} (${formula.level})`);
				keptFormulas.push(formula); // Keep formulas user declined to remove
			}
		}
		debugLog(`Kept formulas:\n${keptFormulas.map(f => f.name).join('\n')}`);

		// Filter out formulas to remove
		removedFormulas = removedFormulas.filter(f => {
			if (keptFormulas.some(kf => kf.uuid === f.uuid)) {
				debugLog(`Keeping formula: ${f.name} (Level ${f.level})`);
				formulaMap.set(f.uuid, { uuid: f.uuid, level: f.level, name: f.name });
				return false; // Exclude from removal
			} else {
				debugLog(`Removing formula: ${f.name} (Level ${f.level})`);
				return true; // Include in removal
			}
		});
	}

    // Filter out formulas to keep
    const uuidsToKeep = Array.from(formulaMap.values()).map(entry => entry.uuid);
    const updatedFormulas = knownFormulas.filter(f => uuidsToKeep.includes(f.uuid));

    // Update the actor's formulas if changes were made
    if (updatedFormulas.length !== knownFormulas.length) {
        await actor.update({ 'system.crafting.formulas': updatedFormulas });
        debugLog(`Updated formulas for ${actor.name}: Removed lower-level versions:\n${updatedFormulas.map(f => f.name).join('\n')}`);
    }

    // Output to chat if enabled
    if (addNewFormulasToChat && removedFormulas.length > 0) {
        const removedFormulaNames = removedFormulas.map(f => f.name).join('<br>');
        ChatMessage.create({
            content: `<strong>${actor.name}</strong> ${LOCALIZED_TEXT.LEVELUP_REMOVEDLOWER_CHAT_MSG}:<br><br>${removedFormulaNames}`
        });
    }
}

// Old function for macro (for now 
async function grantFormulasFull(actor, newLevel, mode = addFormulasSetting, previousLevel) {
	
	const loadingDialog = new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.MACRO_WAIT_TITLE },
		content: `
			<p>${LOCALIZED_TEXT.MACRO_CHECKING_NEW_FORMULAS}</p>
			<div class="progress-bar-container" style="width: 100%; height: 20px; background: #444; border-radius: 5px; overflow: hidden;">
				<div id="progress-fill" style="width: 0%; height: 100%; background: #0c8; transition: width 0.2s;"></div>
			</div>
			<p id="progress-text" style="text-align: center; font-size: 0.9em; margin-top: 5px;">0%</p>
			`,
		buttons: [
			{
			  action: "hidden",
			  label: LOCALIZED_TEXT.OK,
			  icon: "",
			  callback: () => {}
			}
		],
		render: (html) => {
			// Hide the button row with CSS
			const footer = html[0].querySelector(".window-content-footer");
			if (footer) footer.style.display = "none";
		}
	});
	loadingDialog.render(true);
	updateLoadingProgress(10);
	
	debugLog(`grantAlchemistFormulas() | mode: ${mode}`);
    debugLog(`Checking for new formulas for ${actor.name} for level ${newLevel}.`);
	debugLog(`Previous Level for ${actor.name}: ${previousLevel}.`);
	updateLoadingProgress(15);
	
    const systemCompendium = 'pf2e.equipment-srd';
    const userDefinedCompendiums = game.settings.get('pf2e-alchemist-remaster-ducttape', 'compendiums') || [];
	updateLoadingProgress(20);
	
    // Extract the UUIDs from the actor's known formulas
    const knownFormulaUUIDs = actor.system.crafting.formulas.map(f => (typeof f.uuid === 'string' ? f.uuid : null)).filter(Boolean);
    debugLog(`Known formula UUIDs for ${actor.name}:${knownFormulaUUIDs.join('\n')}`);
	updateLoadingProgress(30);
	
    // Extract base slugs from the known UUIDs
	debugLog(`Starting Task: Extract base slugs from the known UUIDs`);
    const knownBaseSlugs = await Promise.all(
        knownFormulaUUIDs.map(async (uuid) => {
            try {
                const item = await qaGetIndexEntry(uuid);
				//debugLog(`processing uuid: ${uuid}...`);
                return item ? extractBaseSlug(item.slug) : null;
            } catch (error) {
                debugLog(3, `Error extracting item for UUID: ${uuid} | Error: ${error.message}`, error);
                return null;
            }
        })
    );
	debugLog(`Finished Task: Extract base slugs from the known UUIDs`);
	updateLoadingProgress(40);

    // Filter out duplicates and null values
	debugLog(`Starting Task: Filter out duplicates and null values`);
    const deduplicatedBaseSlugs = [...new Set(knownBaseSlugs.filter(Boolean))];
    debugLog("Deduplicated base slugs:", deduplicatedBaseSlugs);
	debugLog(`Finished Task: Filter out duplicates and null values`);
    
	if (deduplicatedBaseSlugs.length === 0) {
        debugLog(2, `No base formulas found for ${actor.name}.`);
        return;
    }
	updateLoadingProgress(50);
    const itemsToCheck = []; // Collect items from all compendiums

    // 1. Process system compendium
	debugLog(`Starting Task: Process system compendium`);
    const processCompendium = async (compendiumKey) => {
        const pack = game.packs.get(compendiumKey);
        if (!pack) {
            debugLog(2, `Compendium '${compendiumKey}' not found.`);
            return;
        }
		
		debugLog(`Step: const index = pack.index`);
        const index = pack.index; // Use the prebuilt index
        debugLog(`Compendium index for ${compendiumKey}:`, index);

		debugLog(`Step: const filteredIndex = index.filter(entry => { const baseSlug = extractBaseSlug(entry.system.slug)`);
		let logCompendiumEntry = "";
        const filteredIndex = index.filter(entry => {
			if (!entry?.system?.slug) {
				logCompendiumEntry += `\n -> Skipping compendium entry ${entry.name} (${entry.uuid}) missing system.slug`;
				
				return false;
			}
			const baseSlug = extractBaseSlug(entry.system.slug);
            return deduplicatedBaseSlugs.includes(baseSlug);
        });
		if (logCompendiumEntry) debugLog(logCompendiumEntry);
		
        debugLog(`Filtered index for ${compendiumKey}:`, filteredIndex);
		updateLoadingProgress(60);
        // Fetch the full documents for relevant entries
		debugLog(`Step: Fetch the full documents for relevant entries`);
        let fetchedItems = "\n"; // Placeholder for list of fetched items
        const relevantItems = await Promise.all(
            filteredIndex.map(async (entry) => {
                try {
                    const item = await pack.getDocument(entry._id);
                    fetchedItems += `${item.name}\n`;
                    return item;
                } catch (error) {
                    debugLog(3, `Error fetching item for entry ${entry.name}: ${error.message}`);
                    return null;
                }
            })
        );
        debugLog(`Fetched items from ${compendiumKey}:${fetchedItems}`);
        itemsToCheck.push(...relevantItems.filter(Boolean));
		updateLoadingProgress(70);
    };
	debugLog(`Finished Task: Process system compendium`);
	
	debugLog(`Starting Task: await processCompendium(systemCompendium)`);
    await processCompendium(systemCompendium);
	debugLog(`Finished Task: await processCompendium(systemCompendium)`);
	updateLoadingProgress(80);
	
    // 2. Process user-defined compendiums
	debugLog(`Starting Task: Process user-defined compendiums`);
    for (const compendiumKey of userDefinedCompendiums) {
        await processCompendium(compendiumKey);
    }
	debugLog(`Finished Task: Process user-defined compendiums`);

    // 3. Filter items by level, traits, and rarity
	debugLog(`Starting Task: Filter items by level, traits, and rarity`);
    previousLevel ??= actor.getFlag('pf2e-alchemist-remaster-ducttape', 'previousLevel') || 1;
    debugLog(`Previous level for ${actor.name}: ${previousLevel}`);

    const filteredItems = itemsToCheck.filter(item => {
        const isAlchemical = item.system.traits?.value?.includes('alchemical');
        const isCommon = item.system.traits?.rarity === 'common';
        const levelCheck = item.system.level.value <= newLevel && item.system.level.value > previousLevel;
        // return isAlchemical && isCommon && levelCheck;
		return isAlchemical && levelCheck;
    });
	
	debugLog(`Finished Task: Filter items by level, traits, and rarity`);
    debugLog(`Filtered items for ${actor.name}:`, filteredItems);
	updateLoadingProgress(90);
	loadingDialog.close();
	
	debugLog(`Starting Task: let newFormulaUUIDs = filteredItems.map(item => item.uuid)`);
    let newFormulaUUIDs = filteredItems.map(item => item.uuid);
    debugLog(`New formula UUIDs:\n${newFormulaUUIDs.join('\n')}`);
	
	
    if (newFormulaUUIDs.length === 0) {
        debugLog(`No new formulas to add for ${actor.name}.`);
        return;
    }
	
	// Filter out already known fomrulas by UUID
	let skippedFormulas = [];
    const newFilteredFormulaUUIDs = [];
	for (const uuid of newFormulaUUIDs) {
	  if (!knownFormulaUUIDs.includes(uuid)) {
		newFilteredFormulaUUIDs.push(uuid);
	  } else {
		skippedFormulas.push(uuid);
	  }
	}
	debugLog(`Skipping already known formulas:\n${skippedFormulas.join('\n')}`);
	newFormulaUUIDs = newFilteredFormulaUUIDs;
    debugLog(`Adding the following new formulas to ${actor.name}:\n${newFormulaUUIDs.join('\n')}`);
	
	const overlap = newFormulaUUIDs.filter(f => knownFormulaUUIDs.includes(f));
	debugLog(`Found ${overlap.length} overlapping UUIDs:\n${overlap.join("\n")}`);

    // Collect added formulas for the chat message
    let addedFormulas = [];
	
	updateLoadingProgress(100);
	
    // Check setting to see if we are asking for each formula
    if (mode === "ask_each") {
		loadingDialog.close();
        for (const uuid of newFormulaUUIDs) {
            const item = await fromUuidSync(uuid);
            if (!item) continue;

            const confirmed = await showFormulaDialog(actor, item, item.system.level.value);
            if (confirmed) {
                const newFormulaObject = { uuid };
                const updatedFormulaObjects = [...actor.system.crafting.formulas, newFormulaObject];
                try {
                    await actor.update({ 'system.crafting.formulas': updatedFormulaObjects });
                } catch (error) {
                    debugLog(`Error updating formulas for ${actor.name}: ${error.message}`);
                }
                debugLog(`${actor.name} has learned the formula for ${item.name}.`);
                addedFormulas.push(item.name);
            } else {
                debugLog(`User declined to add formula ${item.name} to ${actor.name}.`);
            }
        }
        // Send new formula list to chat
        newFormulasChatMsg(actor.name, addedFormulas.join('<br>'), addedFormulas.length);
    } else if (mode === "ask_all") { // If we are asking for all at once
		loadingDialog.close();
        const formulasToPrompt = [];
        for (const uuid of newFormulaUUIDs) {
            const item = await fromUuidSync(uuid);
            if (!item) continue;
            formulasToPrompt.push({ uuid, name: item.name, level: item.system.level.value });
        }
        if (formulasToPrompt.length > 0) { // Make sure list is not empty
            const formulaNames = formulasToPrompt.map(f => f.name);
            // Add the formula names to the list
            addedFormulas.push(...formulaNames);

            // Show dialog with all formulas to add
            const confirmed = await showFormulaListDialog(actor, formulasToPrompt);
            if (confirmed) { // If player clicked "yes"
                const newFormulaObjects = formulasToPrompt.map(f => ({ uuid: f.uuid }));
                const existingUUIDs = new Set(actor.system.crafting.formulas.map(f => f.uuid));
				const updatedFormulaObjects = [
					...actor.system.crafting.formulas,
					...newFormulaUUIDs.filter(uuid => !existingUUIDs.has(uuid)).map(uuid => ({ uuid }))
				];
                await actor.update({ 'system.crafting.formulas': updatedFormulaObjects });
                debugLog(`${actor.name} has learned ${formulasToPrompt.length} new formulas.`);
                // Send new formula list to chat
                newFormulasChatMsg(actor.name, addedFormulas.join('<br>'), addedFormulas.length);
            } else {
                debugLog(`User declined to add formulas to ${actor.name}.`);
            }
        }
    } else if (mode === "auto") {
        const newFormulaObjects = newFormulaUUIDs.map(uuid => ({ uuid }));
        const updatedFormulaObjects = [...actor.system.crafting.formulas, ...newFormulaObjects];
        const validUUIDs = updatedFormulaObjects.filter(obj => obj && obj.uuid && typeof obj.uuid === 'string' && obj.uuid.startsWith('Compendium.'));
        try {
            await actor.update({ 'system.crafting.formulas': validUUIDs });
            debugLog(`${actor.name} has learned ${newFormulaUUIDs.length} new formulas.`);
            // Get the names of the added formulas
            const formulaNames = await Promise.all(newFormulaUUIDs.map(async (uuid) => {
                const item = await fromUuidSync(uuid);
                return item?.name ?? 'Unknown Formula';
            }));
            // Add the formula names to the list
            addedFormulas.push(...formulaNames);
            // Send new formula list to chat
            newFormulasChatMsg(actor.name, addedFormulas.join('<br>'), addedFormulas.length);
        } catch (error) {
            debugLog(3, `Error updating formulas for ${actor.name}: ${error.message}`);
        }
    }
}

//	Function to extract base name ignoring parenthisis and contents within, 
//	as well as commas and text after
function extractBaseName(name) {
    return name
		.toLowerCase()
		.replace(/\s*\(.*?\)|\s*,.*$/g, '') // Remove parentheses or comma-separated variants
		.trim();
}

//	Helper function to extract base slug
function extractBaseSlug(slug) {
	if (!slug) return null;

	/* Special cases: 
		- elemental-ammunition-[tier]-[element]
		- cooperative waffles (no lesser only greater)
	*/
	if (slug.startsWith("elemental-ammunition-")) {
		const parts = slug.split("-");
		if (parts.length >= 4 && ["lesser", "moderate", "greater"].includes(parts[2])) {
			// Remove the potency (third element), keep the elemental part
			parts.splice(2, 1);
			return parts.join("-");
		}
	} else if (slug.startsWith("cooperative-waffles")){
		debugLog(`extractBaseSlug() | WAAAAFFFFFLLLLLEEEEESSSSSS!!!!!!!!!`);
		const parts = slug.split("-");
		debugLog(`extractBaseSlug() | length: ${parts.length}`);
		if (parts.length >= 3 && ["greater"].includes(parts[2])) {
			// Remove the potency (third element),first part
			parts.splice(2, 1);
			return parts.join("-");
		}
		return slug; 
	}

	// Default: remove last segment (usually the potency)
	return slug.split("-").slice(0, -1).join("-");
}

//	Function to check for non-standard variant slugs
function isNonStandardVariant(slug) {
	const NON_STANDARD_ALCHEMICAL_PREFIXES = [
		"colorful-coating",
		"sprite-apple"
	];
	return NON_STANDARD_ALCHEMICAL_PREFIXES.some(prefix => slug.startsWith(prefix));
}

//	Function to check for and remove any duplicates in actor.system.crafting
async function removeDuplicateFormulas(actor) {
    
    await actor.setFlag('pf2e-alchemist-remaster-ducttape', 'cleaningDuplicates', true);
	let returnLog = "";
    let formulas = actor.system.crafting.formulas;

    // Create a Set to track unique UUIDs
    let seenUUIDs = new Set();
    let duplicates = []; // Collect duplicate UUIDs for logging
    let filteredFormulas = [];

    for (const formula of formulas) {
        if (!seenUUIDs.has(formula.uuid)) {
            seenUUIDs.add(formula.uuid);
            filteredFormulas.push(formula); // Keep only unique formulas
        } else {
            duplicates.push(formula); // Collect duplicate formulas
        }
    }

    // If there were duplicates, update the actor's formulas
    if (filteredFormulas.length !== formulas.length) {
        await actor.update({ 'system.crafting.formulas': filteredFormulas });     
        console.table(duplicates.map(f => ({ Name: f.name, UUID: f.uuid })));
		returnLog = `-> Removed ${duplicates.length} duplicate formulas for ${actor.name}\n`;
    } else {
        returnLog = `-> No duplicates found for ${actor.name}.\n`;
    }
    await actor.unsetFlag('pf2e-alchemist-remaster-ducttape', 'cleaningDuplicates');
	return returnLog;
}

//	Send message to chat with list of learned formulas.
function newFormulasChatMsg(actorName, newFormulas, newFormulaCount) {
	if (addNewFormulasToChat && newFormulaCount > 0) { // if option enabled and there was formulas added, display in chat
      try {
          ChatMessage.create({ 
              content: `<strong>${actorName}</strong> ${LOCALIZED_TEXT.LEVELUP_ADDED_CHAT_MSG}:<br><br> ${newFormulas}`
          });
      } catch (error) {
          debugLog(`Failed to send chat message for ${actorName}: ${error.message}`);
      }
    } else {
		debugLog(`actorName: ${actorName} | newFormulas: ${newFormulas} | newFormulaCount: ${newFormulaCount}`);
	}
}

//	Show a dialog to ask if the user wants to add all the gathered formulas.
async function showFormulaListDialog(actor, formulas, isRemoving = false) {
	return new Promise((resolve) => {
		if (formulas.length === 0) {
			debugLog("No formulas to show in the dialog.");
			return resolve(false);
		}

		const sortedFormulas = formulas.sort((a, b) => a.level - b.level);
		const formulaListHTML = sortedFormulas.map(f =>
			`<li>${LOCALIZED_TEXT.LEVELUP_LEVEL} ${f.level}: <strong>${f.name}</strong></li>`
		).join('');

		const title = isRemoving
			? LOCALIZED_TEXT.LEVELUP_REMOVE_LOWERLEVEL_FORMULAS
			: LOCALIZED_TEXT.LEVELUP_NEW_FORMULAS_DISCOVERED;

		const content = isRemoving
			? `<p>${actor.name} ${LOCALIZED_TEXT.LEVELUP_LOWER_LEVEL_BEING_REPLACED}:</p>
				<ul>${formulaListHTML}</ul>
				<p>${LOCALIZED_TEXT.LEVELUP_PROMPT_REMOVE_FORMULAS}</p>`
			: `<p>${actor.name} ${LOCALIZED_TEXT.LEVELUP_UNLOCKED_FORMULAS}:</p>
				<ul>${formulaListHTML}</ul>
				<p>${LOCALIZED_TEXT.LEVELUP_PROMPT_ADD_FORMULAS}</p>`;

		let resolved = false;

		const dialog = new foundry.applications.api.DialogV2({
			window: { title },
			content,
			buttons: [
				{
					action: "yes",
					label: LOCALIZED_TEXT.BTN_YES,
					icon: "fas fa-check",
					default: true
				},
				{
					action: "no",
					label: LOCALIZED_TEXT.BTN_NO,
					icon: "fas fa-times"
				}
			],
			submit: (result) => {
				if (!resolved) {
					resolved = true;
					resolve(result === "yes");
				}
			}
		});

		dialog.render(true);

		// Monkey-patch _onClose to resolve if the user closed the window
		const originalClose = dialog._onClose.bind(dialog);
		dialog._onClose = (...args) => {
			if (!resolved) {
				debugLog(1, "Dialog was closed manually — treating as 'No'");
				resolved = true;
				resolve(false);
			}
			return originalClose(...args);
		};
	});
}

//	Show a dialog to ask if the user wants to add a formula.
async function showFormulaDialog(actor, formula, level, isRemoving = false) {
	return new Promise((resolve) => {
		const title = isRemoving
		? LOCALIZED_TEXT.LEVELUP_REMOVE_LOWERLEVEL_FORMULAS
		: LOCALIZED_TEXT.LEVELUP_NEW_FORMULAS_DISCOVERED;

		const content = isRemoving
		? `<p>${actor.name} ${LOCALIZED_TEXT.LEVELUP_HIGHER_VERSION} <strong>${formula.name}</strong> (${LOCALIZED_TEXT.LEVELUP_LEVEL} ${level}). ${LOCALIZED_TEXT.LEVELUP_PROMPT_REMOVE_FORMULA}</p>`
		: `<p>${actor.name} ${LOCALIZED_TEXT.LEVELUP_UNLOCKED_FORMULA} <strong>${formula.name}</strong> (${LOCALIZED_TEXT.LEVELUP_LEVEL} ${level}). ${LOCALIZED_TEXT.LEVELUP_PROMPT_ADD_FORMULA}</p>`;

		new foundry.applications.api.DialogV2({
			window: { title },
			content,
			buttons: [
				{
				  action: "yes",
				  label: LOCALIZED_TEXT.BTN_YES,
				  icon: "fas fa-check",
				  default: true,
				  callback: () => {}
				},
				{
				  action: "no",
				  label: LOCALIZED_TEXT.BTN_NO,
				  icon: "fas fa-times",
				  callback: () => {}
				}
			],
			submit: (result) => {
				resolve(result === "yes");
			}
		}).render(true);
	});
}

//  Function to handle permissions
function canManageFormulas(actor) {
    const activeOwnersExist = hasActiveOwners(actor);

    if (addFormulasPermission === "gm_only") {
        // GM-only permission: Allow only the GM
        if (!game.user.isGM) {
            debugLog(`User ${game.user.name} is not a GM and cannot manage formulas for ${actor.name}.`);
            return false;
        } else {
			return true;
		}
    }

    if (addFormulasPermission === "actor_owner") {
        // If there are active owners, allow only owners to proceed
        if (activeOwnersExist) { // An owner is logged in 
            if (actor.isOwner && !game.user.isGM) { // Allow only active non-GM owner
				return true; 
            } else {
				debugLog(`User ${game.user.name} is not an owner of ${actor.name}.`);
                return false;
			}
			
		// If no active owners, allow GM to manage formulas
        } else if (game.user.isGM) {
        
            debugLog(`No active non-GM owners for ${actor.name}. Allowing GM to manage formulas.`);
            return true;
        }
    }

    return false;
}

//	Function to get all Alchemists current level at start
async function getAlchemistLevels(){
	if (game.user.isGM) {
		let getAlchemistLevelsLog = "getAlchemistLevels():\n";
		// Avoid sending multiple messages for the same actor
		const processedActorIds = new Set();

		// Loop through all actors and find Alchemists		
		game.actors.forEach(async actor =>  {
			// Make sure selected token is an alchemist or has archetype
			const alchemistCheck = isAlchemist(actor);
			if (!alchemistCheck.qualifies) {
				getAlchemistLevelsLog += `-> Selected Character (${actor.name}) is not an Alchemist - Ignoring\n`;
			} else {
				getAlchemistLevelsLog += `-> ${alchemistCheck.log}\n`;
				// Avoid processing the same actor multiple times
				if (processedActorIds.has(actor.id)) return;
				processedActorIds.add(actor.id);
				
				// Clean up duplicate formulas
				getAlchemistLevelsLog += await removeDuplicateFormulas(actor);
				
				// Set previous level flag as current level
				await actor.setFlag('pf2e-alchemist-remaster-ducttape', 'previousLevel', actor.system.details.level.value);	
				getAlchemistLevelsLog += `Previous level flag set for ${actor.name} = ${actor.system.details.level.value}\n`;
			}
		});
		debugLog(`${getAlchemistLevelsLog}`);
	}
}

//	Function to clear flags from alchemists used while 
//	scanning them to prevent recurive loops
async function clearFlags() {
	if (!game.user.isGM) return;

	let clearedFlagsLog = "clearFlags():\n";

	for (const actor of game.actors) {
		let cleared = false;

		for (const flagKey of ["cleaningDuplicates", "processingUpdate"]) {
			const hasFlag = actor.getFlag("pf2e-alchemist-remaster-ducttape", flagKey);
			if (hasFlag !== undefined) {
				await actor.unsetFlag("pf2e-alchemist-remaster-ducttape", flagKey);
				clearedFlagsLog += `-> Cleared '${flagKey}' flag for ${actor.name}\n`;
				cleared = true;
			}
		}
		
		/*
		if (!cleared) {
			clearedFlagsLog += `-> No flags to clear for ${actor.name}\n`;
		}
		*/
	}

	debugLog(clearedFlagsLog);
}

//	Function to update progress bar
function updateLoadingProgress(percent) {
  const fill = document.getElementById("progress-fill");
  const text = document.getElementById("progress-text");
  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = `${percent}%`;
}

//	Function to handle form submission
async function handleFormSubmit(actor,options,currentLevel){
	debugLog(`Options chosen: ${JSON.stringify(options)}`);
	
	const method = await qaChooseFormulaGrantMethod();
	if (!method) {
		debugLog("handleFormSubmit() | Grant formulas canceled by user.");
		return;
	}
	
	try {
		// get mode
		const mode = options.mode;
		
		// see if we are adding or removing
		if (options.action === "add_formulas"){
			const prevLevel = options.prevLevel;
			// See which method we are using, fast (alchemical only) or full (all formulas)
			if (method === "fast") {
				await grantAlchemistFormulas(actor, currentLevel, mode, prevLevel);
			} else {
				await grantFormulasFull(actor, currentLevel, mode, prevLevel);
			}
		}else if (options.action === "remove_formulas"){
			await removeLowerLevelFormulasOLd(actor, mode);
		}
	} catch (err) {
		debugLog(`handleFormSubmit() | Grant formulas error: ${err?.message ?? err}`);
	}
}

//	Function to use as a macro to prompt to add formulas for alchemist
async function promptTokenFormulaAdd() {
	
	const token = canvas.tokens.controlled[0];
	if (!token || !token.actor) {
		ui.notifications.warn(LOCALIZED_TEXT.NOTIF_SELECT_ALCHEMIST);
		return;
	}
	const actor = token.actor;
	const options = {};
	const currentLevel = actor.system.details.level.value;
	const prevLevel = currentLevel - 1;
	
	const alchemistCheck = isAlchemist(actor);
	if (!alchemistCheck) {
		ui.notifications.warn(LOCALIZED_TEXT.NOTIF_SELECT_ALCHEMIST);
		return;
	}
	
	// Check defaults for form
	let defaultAddMode = "";
	if (addFormulasSetting === "ask_each"){
		defaultAddMode = `<option value="ask_each" selected>${LOCALIZED_TEXT.ASK_EACH}</option>`;
	}else if (addFormulasSetting === "ask_all"){
		defaultAddMode = `<option value="ask_all" selected>${LOCALIZED_TEXT.ASK_ALL}</option>`;
	}else if (addFormulasSetting === "auto"){
		defaultAddMode = `<option value="auto" selected>${LOCALIZED_TEXT.AUTO}</option>`;
	}
	
	const formContent = `
		<div style="min-width: 400px; overflow-y: auto; padding-right: 1em;">
			<form>
				<div class="form-group">
					<label>${LOCALIZED_TEXT.MACRO_ADD_FORMULAS}</label>
					<select name="addFormulas">
						<option value="yes">${LOCALIZED_TEXT.BTN_YES}</option>
						<option value="no">${LOCALIZED_TEXT.BTN_NO}</option>
					</select>
				</div>
				<br />
				<div class="form-group">
					<label>${LOCALIZED_TEXT.MACRO_PROMPT_STYLE}</label>
					<select name="mode">
						${defaultAddMode}
						<option value="auto">${LOCALIZED_TEXT.AUTO}</option>
						<option value="ask_each">${LOCALIZED_TEXT.ASK_EACH}</option>
						<option value="ask_all">${LOCALIZED_TEXT.ASK_ALL}</option>
					</select>
				</div>
				<br />
				<div class="form-group">
					<label for="level">${LOCALIZED_TEXT.MACRO_START_LEVEL}</label>
					<input type="number" name="startlevel" id="startlevel" value="${prevLevel}" min="1" max="20" />
				</div>
			</form>
		</div>
	`;

	const dialog = new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.MACRO_ADD_TITLE },
		content: formContent,
		buttons: [
			{
				action: "submit",
				label: LOCALIZED_TEXT.OK,
				type: "submit",
				default: true,
				callback: (event, button, dialog) => {
					const form = button.form;
					return {
						addFormulas: form.addFormulas.value === "yes",
						action: "add_formulas",
						mode: form.mode.value,
						prevLevel: form.startlevel.value
					};
				}
			},
			{
				action: "cancel",
				label: LOCALIZED_TEXT.BTN_CANCEL
			}
		],
		submit: async (result) => {
			if (result?.addFormulas !== undefined) {
				dialog.close(); // Close immediately
				await handleFormSubmit(actor, result,currentLevel);
			}
		}
	});

	dialog.render(true);
}

//	Function to use as a macro to prompt to remove lower level formulas for alchemist
// 	Finds items whose baseSlug matches deduplicatedBaseSlugs
async function promptTokenFormulaRemove() {
	
	const token = canvas.tokens.controlled[0];
	if (!token || !token.actor) {
		ui.notifications.warn(LOCALIZED_TEXT.NOTIF_SELECT_ALCHEMIST);
		return;
	}
	const actor = token.actor;
	const options = {};
	const currentLevel = actor.system.details.level.value;
	const alchemistCheck = isAlchemist(actor);
	if (!alchemistCheck) {
		ui.notifications.warn(LOCALIZED_TEXT.NOTIF_SELECT_ALCHEMIST);
		return;
	}
	
	// Check defaults for form
	let defaultRemovemode = "";
	if (addFormulasSetting === "ask_each_lower"){
		defaultRemovemode = `<option value="ask_each_lower" selected>${LOCALIZED_TEXT.ASK_EACH}</option>`;
	}else if (addFormulasSetting === "ask_all_lower"){
		defaultRemovemode = `<option value="ask_all_lower" selected>${LOCALIZED_TEXT.ASK_ALL}</option>`;
	}
	
	const formContent = `
		<form>
			<div class="form-group">
				<label>${LOCALIZED_TEXT.MACRO_REMOVE_FORMULAS}</label>
			</div>
			
			<div class="form-group">
				<label>${LOCALIZED_TEXT.MACRO_PROMPT_STYLE}</label>
				<select name="mode">
					${defaultRemovemode}
					<option value="ask_each_lower">${LOCALIZED_TEXT.ASK_EACH}</option>
					<option value="ask_all_lower">${LOCALIZED_TEXT.ASK_ALL}</option>
				</select>
			</div>
			
		</form>
	`;

	const dialog = new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.MACRO_REMOVE_TITLE },
		content: formContent,
		buttons: [
			{
				action: "submit",
				label: LOCALIZED_TEXT.OK,
				type: "submit",
				default: true,
				callback: (event, button, dialog) => {
					const form = button.form;
					return {
						action: "remove_formulas",
						mode: form.mode.value
					};
				}
			},
			{
				action: "cancel",
				label: LOCALIZED_TEXT.BTN_CANCEL
			}
		],
		submit: async (result) => {
			dialog.close(); // ✅ Close immediately
			await handleFormSubmit(actor, result, currentLevel);
		}
	});

	dialog.render(true);
}

//	Prompt user to choose how to grant formulas (fast vs full)
async function qaChooseFormulaGrantMethod() {
	return new Promise((resolve) => {
		let resolved = false;

		const dlg = new foundry.applications.api.DialogV2({
			window: { title: "Grant Formulas" },
			content: `
				<div style="min-width: 450px; overflow-y: auto; padding-right: 1em;">
					<p><strong>How do you want to grant formulas?</strong></p>
					<p>• <em>Fast</em>: Alchemical items only (uses the Index; much faster).</p>
					<p>• <em>Full</em>: Check all items (slower; legacy behavior).</p>
				</div>
			`,
			buttons: [
				{
					action: "fast",
					label: "Fast (Alchemical Only)",
					icon: "fas fa-bolt",
					callback: () => {
						if (!resolved) {
							resolved = true;
							resolve("fast");
						}
					}
				},
				{
					action: "full",
					label: "Full (All Items)",
					icon: "fas fa-list",
					callback: () => {
						if (!resolved) {
							resolved = true;
							resolve("full");
						}
					}
				},
				{
					action: "cancel",
					label: "Cancel",
					icon: "fas fa-times",
					callback: () => {
						if (!resolved) {
							resolved = true;
							resolve(null);
						}
					}
				}
			],
			classes: ["quick-alchemy-dialog"],
			default: "fast",
		});

		dlg.render(true);
	});
}

// Process the AlchIndex instead of fetching compendiums directly.
function processIndex(deduplicatedBaseSlugs) {
	debugLog("processIndex() | Start");
	
	const idx = getAlchIndex();

	if (!idx?.items) {
		debugLog(2, "processIndex() | No items in index.");
		return;
	}

	const relevantItems = [];
	let logRelevantItems = "relevantItems[]: ";

	for (const [uuid, entry] of Object.entries(idx.items)) {
		if (!entry?.slug) {
			logRelevantItems += `\n -> Skipping index entry ${entry.name} (${uuid}) missing slug`;
			continue;
		}

		const baseSlug = extractBaseSlug(entry.slug);
		if (deduplicatedBaseSlugs.includes(baseSlug)) {
			logRelevantItems += `\n -> Adding ${entry.name} to logRelevantItems[]`;
			relevantItems.push(entry);
		}
	}

	debugLog(logRelevantItems);
	debugLog(`processIndex() | Found ${relevantItems.length} matching entries`);
	debugLog(`processIndex() | Returning: `, relevantItems);

	return relevantItems;
}