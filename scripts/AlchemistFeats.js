import { debugLog, getSetting, hasFeat, isAlchemist, hasActiveOwners  } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";

/**
	Update item description based on regex pattern and replacement logic. 
	@param {string} description - The original item description. 
	@param {RegExp} regexPattern - The regex pattern to match.
	@param {Function} replacementFn - A function that takes a match and returns a replacement string.
	@returns {string} - The updated item description.
*/
function updateDescription(description, regexPattern, replacementFn) {
	const updatedDescription = description.replace(regexPattern, replacementFn);
	return updatedDescription;
}

Hooks.on("ready", () => {
  console.log("%cPF2e Alchemist Remaster Duct Tape: AlchemistFeats.js loaded","color: aqua; font-weight: bold;");
		
	Hooks.on("createItem", async (item) => {
		debugLog(`Item ${item.name} Created!`);
		
		// Get the actor from the item's parent (the actor who owns the item)
		const actor = item.parent;
		if (!actor) {
			debugLog(3,`Actor for item ${item.name} not found.`,);
			return;
		}
		
		// Check permissions to prevent errors on other users
		const activeOwnersExist = hasActiveOwners(actor);
		if (activeOwnersExist) { // Owners exist, make sure user is owner
			if (!actor.isOwner) {
				debugLog(1,`Current user is owner of item: ${item.name}`,);
				return;	
			}
		} else { // No owners exist, check if GM
			if (!game.user.isGM){ // User is not GM
				debugLog(1,`Current user is owner of item: ${item.name}`,);
				return;	
			}
		}
		
		// Make sure selected token is an alchemist or has archetype
		const alchemistCheck = isAlchemist(actor);
		if (alchemistCheck.qualifies) {
			debugLog("Actor's Class DC:", alchemistCheck.dc);
			if (!alchemistCheck.dc) {
				debugLog(2, "Warning: Class DC not found for the actor:", actor);
				return;
			}
		} else {
			debugLog(`Selected Character (${actor.name}) is not an Alchemist - Ignoring`);
			return;
		}
		
		// ensure the item type is 'weapon' or 'consumable'
		if (!item || (item.type !== "weapon" && item.type !== "consumable")) {
		  debugLog(`Item type (${item.type}) is not weapon or consumable or item is undefined - Ignoring.`);
		  return;
		}
		
		/*
			*** POWERFUL ALCHEMY *** 
			Check if the actor has Powerful Alchemy - if not return with mesactorge in log	
		*/
		//check if Powerful Alchemy is enabled
		const paEnabled = getSetting("enablePowerfulAlchemy");
		if (paEnabled) {
			debugLog("PowerfulAlchemy enabled.");
			if (hasFeat(actor, "powerful-alchemy")) {
				applyPowerfulAlchemy(item,actor);
			}else{
				debugLog(`Actor (${actor.name}) does not have Powerful alchemy, ignoring!`);
			}
		}
		/*
			*** DEBILITATING BOMB *** 
			Check if the actor has Debilitating Bomb - if not return with mesactorge in log	
		*/
		if (hasFeat(actor, "debilitating-bomb")) {
			applyDebilitatingBomb(actor, item, alchemistCheck.dc);
		}else{
			debugLog(`Actor (${actor.name}) does not have Powerful alchemy, ignoring!`);
		}
		
		
		
	});
});


/*
	Function to apply Powerful Alchemy effects to item created by Alchemist
*/
async function applyPowerfulAlchemy(item,actor){
	
	// Ensure the item has the 'alchemical' trait
	if (!item || !item.system.traits.value.includes("alchemical")) {
	  debugLog(`Item (${item.name}) does not have the 'alchemical' trait or item is undefined.`);
	  return;
	}
	
	// Ensure Quick Alchemy was used to create item - it will have the "infused" trait
	if (!item || !item.system.traits.value.includes("infused")) {
	  debugLog(`Item (${item.name}) does not have the 'infused' trait or item is undefined.`);
	  return;
	}

	// Log infused item was created
	debugLog(`Infused item created! Item: `, item);
				
	// Get current description of item
	let description = item.system.description.value;
	
	// Check for strings to replace in item description
	const replacements = [
		{ 
			pattern: /@Check\[(?!flat)\w+\|dc:(\d+)\]/g, 
			replaceFn: (match, p1) => match.replace(`dc:${p1}`, `dc:${alchemistCheck.dc}`)
		}, // Match @Check that is NOT flat (negative lookahead prevents matching "@Check[flat|dc:X]")
		{ 
			pattern: /DC is (\d+)/g, 
			replaceFn: (match, p1) => match.replace(`DC is ${p1}`, `DC is ${alchemistCheck.dc}`)
		} // Example "DC is 17", but ensure this won't affect flat checks if written differently
	];
	
	// Make replacements
	let updatedDescription = description;
	for (const { pattern, replaceFn } of replacements) {
		updatedDescription = updateDescription(updatedDescription, pattern, replaceFn);
	}
	
	// Update the item with the new description
	if (updatedDescription !== description) {
		await item.update({"system.description.value": updatedDescription});
		debugLog("Description was updated to Class DC!");
		
		// Send Mesactorge to Chat
		const itemName = item.name;
		ChatMessage.create({
			author: game.user?.id,    // User ID to send the mesactorge as the system
			content: `<h3>Powerful Alchemy:</h3><p>${itemName} ${LOCALIZED_TEXT.POWERFUL_ALCHEMY_UPDATED_CLASS_DC} ${alchemistCheck.dc}!</p>`,
			speaker: { alias: "Powerful Alchemy" }  // Optional: sets the speaker to "System"
		});
	}
	
	// Find and update the Rule Element for Notes
	let updatedRules = item.system.rules.map(rule => {
		if (rule.key === "Note" && rule.selector.includes("{item|_id}-damage")) {
			debugLog(`Updating Note Rule Element for ${item.name}`);
			return {
				...rule,
				text: updatedDescription // Use the updated description in the rule element
			};
		}
		return rule;
	});

	// Only update if there's a change
	if (JSON.stringify(updatedRules) !== JSON.stringify(item.system.rules)) {
		await item.update({ "system.rules": updatedRules });
		debugLog(`Updated Note Rule Element for ${item.name} to use new description.`);
	}
	
}

async function applyDebilitatingBomb(actor, item, dc){
	// Ensure the item has the 'alchemical' trait
	if (!item || !item.system.traits.value.includes("alchemical")) {
	  debugLog(`Item (${item.name}) does not have the 'alchemical' trait or item is undefined.`);
	  return;
	}
	
	// Ensure Quick Alchemy was used to create item - it will have the "infused" trait
	if (!item || !item.system.traits.value.includes("infused")) {
	  debugLog(`Item (${item.name}) does not have the 'infused' trait or item is undefined.`);
	  return;
	}
	
	// Get current description of item
	let description = item.system.description.value;
	
	// Add Debilitating Bomb text
	let updatedDescription = `${description}<ul class="notes">\n<li class="roll-note" data-item-id="tP1GniYnspjaJWuz"><strong>Debilitating Bomb</strong> The target must succed at a @Check[fortitude|dc:${dc}], or suffer one of the following effects: dazzled, deafened, off-guard, or take a -5 foot status penalty to Speeds. @UUID[Compendium.pf2e.feat-effects.Item.VTJ8D23sOIfApEt3]{Effect: Debilitating Bomb}</li>\n</ul>`;
	await item.update({"system.description.value": updatedDescription});
	debugLog("Description was updated with Debilitating Bomb text!");
}