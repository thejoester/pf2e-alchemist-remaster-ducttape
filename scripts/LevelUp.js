import { debugLog } from './settings.js';
console.log("%cPF2e Alchemist Remaster Duct Tape | LevelUp.js loaded","color: aqua; font-weight: bold;");

// Store the addFormulasOnLevelUp setting globally
let addFormulasSetting = "disabled";

Hooks.once('init', () => {
    // Check if the addFormulasOnLevelUp setting is disabled globally
    addFormulasSetting = game.settings.get("pf2e-alchemist-remaster-ducttape", "addFormulasOnLevelUp");

    if (addFormulasSetting !== "disabled") {
        // Hook into updateActor to detect level-ups and grant Alchemist formulas
        Hooks.on('updateActor', async (actor, updateData, options, userId) => {
            // Ensure this only runs for GMs
            if (!game.user.isGM) return;

            // Check if the actor's class is "Alchemist"
            const className = actor.class?.name?.toLowerCase() || '';
            if (className !== "alchemist") {
                debugLog(`Character is not an Alchemist.`);
                return;
            }

            // Check if the level was updated
            const newLevel = updateData?.system?.details?.level?.value;
            if (newLevel === undefined) {
                debugLog(`No level change detected for ${actor.name}.`, "c", 1);
                return;
            }

            debugLog(`Level change detected for ${actor.name}. New Level = ${newLevel}`, "c", 1);
            
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
    debugLog(`Known formula UUIDs for ${actor.name}: ${knownFormulaUUIDs.join(', ')}`, "c", 1);

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

    const deduplicatedBaseFormulas = [...new Set(knownBaseFormulas.filter(Boolean))];
    debugLog(`Known base formulas for ${actor.name} (deduplicated): ${deduplicatedBaseFormulas.join(', ')}`, "c", 1);

    // Get the index from the compendium
    const index = await compendium.getIndex();
    const relevantEntries = index.filter(entry => 
        deduplicatedBaseFormulas.some(baseFormula => entry.name.startsWith(baseFormula))
    );

    // Load the relevant item documents
    const relevantItems = await Promise.all(
        relevantEntries.map(entry => compendium.getDocument(entry._id))
    );

    const filteredItems = relevantItems.filter(item => 
        item.system.level.value === newLevel &&
        item.system.traits?.value?.includes('alchemical') && 
        item.system.traits?.rarity === 'common'
    );

    const relevantUUIDs = filteredItems.map(item => `Compendium.${compendiumName}.Item.${item.id}`);
    const newFormulaUUIDs = relevantUUIDs.filter(uuid => !knownFormulaUUIDs.includes(uuid));

    if (newFormulaUUIDs.length === 0) {
        debugLog(`No new formulas to add for ${actor.name}.`, "c", 1);
        return;
    }

    debugLog(`Adding the following new formula UUIDs to ${actor.name}: ${newFormulaUUIDs.join(', ')}`, "c", 1);
    
    if (addFormulasSetting === "ask") {
        for (const uuid of newFormulaUUIDs) {
            const item = await fromUuid(uuid);
            if (!item) continue;

            const confirmed = await showFormulaDialog(actor, item, newLevel);
            if (confirmed) {
                const newFormulaObject = { uuid };
                const updatedFormulaObjects = [...actor.system.crafting.formulas, newFormulaObject];
                await actor.update({ 'system.crafting.formulas': updatedFormulaObjects });
                ui.notifications.info(`${actor.name} has learned the formula for ${item.name}.`);
            } else {
                debugLog(`User declined to add formula ${item.name} to ${actor.name}.`, "c", 2);
            }
        }
    } else if (addFormulasSetting === "auto") {
        const newFormulaObjects = newFormulaUUIDs.map(uuid => ({ uuid }));
        const updatedFormulaObjects = [...actor.system.crafting.formulas, ...newFormulaObjects];
        const validUUIDs = updatedFormulaObjects.filter(obj => obj && obj.uuid && typeof obj.uuid === 'string' && obj.uuid.startsWith('Compendium.'));

        try {
            await actor.update({ 'system.crafting.formulas': validUUIDs });
            ui.notifications.info(`${actor.name} has learned ${newFormulaUUIDs.length} new formulas.`);
        } catch (error) {
            debugLog(`Error updating formulas for ${actor.name}: ${error.message}`, "c", 3);
        }
    }
}


/**
 * Show a dialog to ask if the user wants to add a formula.
 * 
 * @param {Actor} actor - The actor receiving the formula.
 * @param {Item} item - The item (formula) to add.
 * @param {number} newLevel - The actor's new level.
 * @returns {Promise<boolean>} - Resolves to true if user clicks "Yes", false otherwise.
 */
function showFormulaDialog(actor, item, newLevel) {
    return new Promise((resolve) => {
        new Dialog({
            title: "New Formula Discovered",
            content: `<p>${actor.name} has unlocked the formula for <strong>${item.name}</strong> at level ${newLevel}. Would you like to add it?</p>`,
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
