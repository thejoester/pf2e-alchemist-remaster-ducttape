import { debugLog } from './settings.js';
console.log("%cPF2e Alchemist Remaster Duct Tape | LevelUp.js loaded","color: aqua; font-weight: bold;");

// Settings placeholders
let addFormulasSetting = "disabled";
let addNewFormulasToChat = false;
let addFormulasPermission = "gm_only"; 

Hooks.once('init', () => {

    // Get Settings
    addFormulasSetting = game.settings.get("pf2e-alchemist-remaster-ducttape", "addFormulasOnLevelUp");
	addNewFormulasToChat = game.settings.get("pf2e-alchemist-remaster-ducttape", "addNewFormulasToChat");
	addFormulasPermission = game.settings.get("pf2e-alchemist-remaster-ducttape", "addFormulasPermission");
    debugLog(`Setting - Add Formulas on level up: ${addFormulasSetting}`);

    if (addFormulasSetting !== "disabled") {
        // Hook into updateActor to detect level-ups and grant Alchemist formulas
        Hooks.on('updateActor', async (actor, updateData, options, userId) => {
            // Check permissions
			if (addFormulasPermission === "gm_only" && !game.user.isGM) return;
			if (addFormulasPermission === "actor_owner" && !actor.isOwner) return;	
			if (addFormulasPermission === "actor_owner" && game.user.isGM) return; // Prevent GM from being asked
			
            // Check if the actor's class is "Alchemist"
            const className = actor.class?.name?.toLowerCase() || '';
            if (className !== "alchemist") {
                debugLog(`Character is not an Alchemist.`);
                return;
            }

            // Check if the level was updated
            const newLevel = updateData?.system?.details?.level?.value;
            if (newLevel === undefined) {
                debugLog(`No level change detected for ${actor.name}.`);
                return;
            }
            debugLog(`Level change detected for ${actor.name}. New Level = ${newLevel}`);
            
            // Update formulas
            await grantAlchemistFormulas(actor, newLevel);
        });
    }
});

/**
 * Grants new formulas to Alchemists as they level up.
 * 
 * @param {Actor} actor - The actor that leveled up.
 * @param {number} newLevel - The level after leveling up.
 */
async function grantAlchemistFormulas(actor, newLevel) {
    debugLog(`Checking for new formulas for ${actor.name} for level ${newLevel}.`);
    
    const compendiumName = 'pf2e.equipment-srd';
    const compendium = game.packs.get(compendiumName);
    if (!compendium) {
        ui.notifications.error(`Compendium '${compendiumName}' not found.`);
        debugLog(`Compendium '${compendiumName}' not found.`, "c", 3);
        return;
    }

    // Extract the UUIDs from the actor's known formulas
    const knownFormulaUUIDs = actor.system.crafting.formulas.map(f => (typeof f.uuid === 'string' ? f.uuid : null)).filter(Boolean);
    debugLog(`Known formula UUIDs for ${actor.name}:\n ${knownFormulaUUIDs.join(' \n')}`);

    // Extract base formula names from the known UUIDs
    const knownBaseFormulas = await Promise.all(
        knownFormulaUUIDs.map(async (uuid) => {
            try {
                const item = await fromUuid(uuid);
                return item ? item.name.replace(/\s*\(.*?\)\s*/g, '') : null;
            } catch (error) {
                debugLog(`Error extracting item for UUID: ${uuid} | Error: ${error.message}`, "c", 3);
                return null;
            }
        })
    );

	// Filters out any duplicates and false values from the knownBaseFormulas array.
    const deduplicatedBaseFormulas = [...new Set(knownBaseFormulas.filter(Boolean))];
	if (deduplicatedBaseFormulas.length === 0) {
		debugLog(`No base formulas found for ${actor.name}.`);
	} else {
		debugLog(`Known base formulas for ${actor.name} (deduplicated):\n${deduplicatedBaseFormulas.join('\n')}`);
	}

    // Get the index from the compendium
    const index = await compendium.getIndex();
    const relevantEntries = index.filter(entry => 
        deduplicatedBaseFormulas.some(baseFormula => entry.name.startsWith(baseFormula))
    );

    // Load the relevant item documents
    const relevantItems = await Promise.all(
        relevantEntries.map(entry => compendium.getDocument(entry._id))
    );

	// Filter items to only items that match new level & have common trait & have alchemical trait
    const filteredItems = relevantItems.filter(item => 
		item.system.level.value <= newLevel &&
        item.system.traits?.value?.includes('alchemical') && 
        item.system.traits?.rarity === 'common'
    );

    const relevantUUIDs = filteredItems.map(item => `Compendium.${compendiumName}.Item.${item.id}`);
    const newFormulaUUIDs = relevantUUIDs.filter(uuid => !knownFormulaUUIDs.includes(uuid));

    // Check if no new formulas to add
    if (newFormulaUUIDs.length === 0) {
        debugLog(`No new formulas to add for ${actor.name}.`);
        return;
    }

    // List formulas in console if we are debugging
    debugLog(`Adding the following new formula UUIDs to ${actor.name}: \n${newFormulaUUIDs.join('\n')}`);

    // Collect added formulas for the chat message
    let addedFormulas = [];
  
	// check setting to see if we asking for each formula
    if (addFormulasSetting === "ask_each") {
        for (const uuid of newFormulaUUIDs) {
            const item = await fromUuid(uuid);
            if (!item) continue;

            const confirmed = await showFormulaDialog(actor, item, item.system.level.value);
            if (confirmed) {
                const newFormulaObject = { uuid };
                const updatedFormulaObjects = [...actor.system.crafting.formulas, newFormulaObject];
                await actor.update({ 'system.crafting.formulas': updatedFormulaObjects });
                debugLog(`${actor.name} has learned the formula for ${item.name}.`);
				addedFormulas.push(item.name);		
            } else {
                debugLog(`User declined to add formula ${item.name} to ${actor.name}.`, "c", 2);
            }
        }
		// Send new formula list to chat
		newFormulasChatMsg(actor.name,addedFormulas.join('<br>'),addedFormulas.length);
    } else if (addFormulasSetting === "ask_all") { // If we are asking for all at once
		const formulasToPrompt = [];
		for (const uuid of newFormulaUUIDs) {
			const item = await fromUuid(uuid);
			if (!item) continue;
			formulasToPrompt.push({ uuid, name: item.name, level: item.system.level.value });
		}
		if (formulasToPrompt.length > 0) { // Make sure list is not empty
			const formulaNames = await Promise.all(newFormulaUUIDs.map(async (uuid) => {
                const item = await fromUuid(uuid);
                return item?.name ?? 'Unknown Formula';
            }));
            // Add the formula names to the list
            addedFormulas.push(...formulaNames);
			
			// Show dialog with all formulas to add 
			const confirmed = await showFormulaListDialog(actor, formulasToPrompt); 
			if (confirmed) { // If player clicked "yes"
				const newFormulaObjects = formulasToPrompt.map(f => ({ uuid: f.uuid }));
				const updatedFormulaObjects = [...actor.system.crafting.formulas, ...newFormulaObjects];
				await actor.update({ 'system.crafting.formulas': updatedFormulaObjects });
				debugLog(`${actor.name} has learned ${formulasToPrompt.length} new formulas.`);
				// Send new formula list to chat
				newFormulasChatMsg(actor.name,addedFormulas.join('<br>'),addedFormulas.length);
			} else {
				debugLog(`User declined to add formulas to ${actor.name}.`, "c", 2);
			}
		}
    } else if (addFormulasSetting === "auto") {
        const newFormulaObjects = newFormulaUUIDs.map(uuid => ({ uuid }));
        const updatedFormulaObjects = [...actor.system.crafting.formulas, ...newFormulaObjects];
        const validUUIDs = updatedFormulaObjects.filter(obj => obj && obj.uuid && typeof obj.uuid === 'string' && obj.uuid.startsWith('Compendium.'));
        try {
            await actor.update({ 'system.crafting.formulas': validUUIDs });
            debugLog(`${actor.name} has learned ${newFormulaUUIDs.length} new formulas.`);
            // Get the names of the added formulas
            const formulaNames = await Promise.all(newFormulaUUIDs.map(async (uuid) => {
                const item = await fromUuid(uuid);
                return item?.name ?? 'Unknown Formula';
            }));
            // Add the formula names to the list
            addedFormulas.push(...formulaNames);
			// Send new formula list to chat
			newFormulasChatMsg(actor.name,addedFormulas.join('<br>'),addedFormulas.length);
        } catch (error) {
            debugLog(`Error updating formulas for ${actor.name}: ${error.message}`, "c", 3);
        }
    }
}

/**
 * Send message to chat with list of learned formulas.
 * 
 * @param {newFormulas} - list of new formulas added
 * @param {newFormulaCount} formulas - The list of formulas to add.
 */
function newFormulasChatMsg(actorName, newFormulas, newFormulaCount) {
	if (addNewFormulasToChat && newFormulaCount > 0) { // if option enabled and there was formulas added, display in chat
        ChatMessage.create({ 
            content: `<strong>${actorName}</strong> has learned the following new formulas:<br><br> ${newFormulas}`
        });
    } else {
		debugLog(`actorName: ${actorName} | newFormulas: ${newFormulas} | newFormulaCount: ${newFormulaCount}`);
	}
}

/**
 * Show a dialog to ask if the user wants to add all the gathered formulas.
 * 
 * @param {Actor} actor - The actor receiving the formulas.
 * @param {Array} formulas - The list of formulas to add.
 * @returns {Promise<boolean>} - Resolves to true if user clicks "Yes", false otherwise.
 */
function showFormulaListDialog(actor, formulas) {
    return new Promise((resolve) => {
        // Sort formulas by level
        const sortedFormulas = formulas.sort((a, b) => a.level - b.level);

        // Build the list of formulas to display
        const formulaListHTML = sortedFormulas.map(f => 
            `<li>Level ${f.level}: <strong>${f.name}</strong></li>`
        ).join('');

        new Dialog({
            title: "New Formulas Discovered",
            content: `
                <p>${actor.name} has unlocked the following new formulas:</p>
                <ul>${formulaListHTML}</ul>
                <p>Would you like to add all of these formulas to their crafting book?</p>
            `,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Yes",
                    callback: () => resolve(true)
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "No",
                    callback: () => resolve(false)
                }
            },
            default: "yes",
        }).render(true);
    });
}

/**
 * Show a dialog to ask if the user wants to add a formula.
 * 
 * @param {Actor} actor - The actor receiving the formula.
 * @param {Item} item - The item (formula) to add.
 * @param {number} newLevel - The actor's new level.
 * @returns {Promise<boolean>} - Resolves to true if user clicks "Yes", false otherwise.
 */
function showFormulaDialog(actor, item, itemLevel) {
    return new Promise((resolve) => {
        new Dialog({
            title: "New Formula Discovered",
            content: `<p>${actor.name} has unlocked the formula for <strong>${item.name}</strong> at level ${itemLevel}. Would you like to add it?</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Yes",
                    callback: () => resolve(true)
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "No",
                    callback: () => resolve(false)
                }
            },
            default: "yes",
        }).render(true);
    });
}
