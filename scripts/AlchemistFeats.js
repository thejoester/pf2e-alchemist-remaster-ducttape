import { debugLog, getSetting, hasFeat, isAlchemist, hasActiveOwners  } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";

//	Update item description based on regex pattern and replacement logic. 
//	@param {string} description - The original item description. 
//	@param {RegExp} regexPattern - The regex pattern to match.
//	@param {Function} replacementFn - A function that takes a match and returns a replacement string.
//	@returns {string} - The updated item description.
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
		
		// Make sure item was created by Quick Alchemy Macro
		if (!item?.system?.ductTaped) {
			debugLog(`Item ${item.name} not created with Duct Tape module... skipping: `, item);
			return;
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
		
		/*
			*** EFFECT LINK *** 
			Check if description has an effect link in it and inject note before
			the link to state "Apply before use" 
		*/
		await annotateEffectLinkBeforeUse(item);

		if(item.system.traits.value.includes("healing")) {
			debugLog("Item is a healing item - Ignoring.");
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
				await applyPowerfulAlchemy(item,actor,alchemistCheck.dc);
			}else{
				debugLog(`Actor (${actor.name}) does not have Powerful alchemy, ignoring!`);
			}
		}			
	});
});

/*
	Injects "<strong> Apply before using: </strong>" immediately before the first
	@UUID[...] {Effect: ...} link in the item's description.
	Does nothing if it's already injected or no such link exists.
*/
async function annotateEffectLinkBeforeUse(item) {
	setTimeout(async () => {
		try {
			if (!item) return;

			const desc = item.system?.description?.value ?? '';
			if (!desc) return;

			// Already injected? bail.
			if (/>\s*Apply before using\s*:\s*<\/strong>\s*\@UUID\[/i.test(desc)) {
				debugLog(`annotateEffectLinkBeforeUse: already present for ${item.name}`);
				return;
			}

			// Only the @UUID[...] {Effect: ...} pattern
			const uuidEffectRe = /(\@UUID\[[^\]]+\]\{\s*Effect:\s*[^}]+\})/i;

			if (!uuidEffectRe.test(desc)) {
				debugLog(`annotateEffectLinkBeforeUse: no @UUID Effect link in ${item.name}`);
				return;
			}

			const updated = desc.replace(uuidEffectRe, (_m, g1) => {
				return `<p><strong> Apply before using: </strong>${g1}</p>`;
			});

			if (updated !== desc) {
				await item.update({ 'system.description.value': updated });
				debugLog(`annotateEffectLinkBeforeUse: injected label for ${item.name}`);
			}
		} catch (err) {
			debugLog(`annotateEffectLinkBeforeUse ERROR: ${err?.message || err}`);
			console.error(err);
		}
	}, 100);
}


//	Function to apply Powerful Alchemy effects to item created by Alchemist
async function applyPowerfulAlchemy(item,actor,alchemistDC){
	// Delay to allow item to finish embedding (avoids Foundry V12 timing issues)
	setTimeout(async () => {
		try {
			if (!item || !item.system?.traits?.value?.includes("alchemical")) {
				debugLog(`Item (${item?.name}) does not have the 'alchemical' trait or item is undefined.`);
				return;
			}

			if (!item.system.traits.value.includes("infused")) {
				debugLog(`Item (${item.name}) does not have the 'infused' trait.`);
				return;
			}

			debugLog(`Infused item created! Item: `, item);

			let description = item.system.description.value;

			const replacements = [
				{
					pattern: /@Check\[(?!flat)\w+\|dc:(\d+)(?:\|[^\]]+)?\]/g,
					replaceFn: (match, p1) => match.replace(`dc:${p1}`, `dc:${alchemistDC}`)
				},
				{
					pattern: /DC is (\d+)/g,
					replaceFn: (match, p1) => match.replace(`DC is ${p1}`, `DC is ${alchemistDC}`)
				},
				{
					pattern: /DC is \[\[\/act [^\]]*?dc=(\d+)\]\]\{\d+\}/g,
					replaceFn: (match, p1) => `DC is [[/act escape dc=${alchemistDC}]]{${alchemistDC}}`
				}
			];

			let updatedDescription = description;
			for (const { pattern, replaceFn } of replacements) {
				updatedDescription = updatedDescription.replace(pattern, replaceFn);
			}

			if (updatedDescription !== description) {
				await item.update({ "system.description.value": updatedDescription });
				debugLog(`Description was updated to Class DC: ${alchemistDC}`);

				await ChatMessage.create({
					author: game.user?.id,
					content: `<h3>Powerful Alchemy:</h3><p>${item.name} ${LOCALIZED_TEXT.POWERFUL_ALCHEMY_UPDATED_CLASS_DC} ${alchemistDC}!</p>`,
					speaker: { alias: "Powerful Alchemy" }
				});
			}

			// Update any matching Note rule elements with the new description
			let updatedRules = item.system.rules.map(rule => {
				if (rule.key === "Note" && rule.selector.includes("{item|_id}-damage")) {
					debugLog(`Updating Note Rule Element for ${item.name}`);
					return {
						...rule,
						text: updatedDescription
					};
				}
				return rule;
			});

			if (JSON.stringify(updatedRules) !== JSON.stringify(item.system.rules)) {
				await item.update({ "system.rules": updatedRules });
				debugLog(`Updated Note Rule Element for ${item.name} to use new description.`);
			}
		} catch (err) {
			debugLog(`Error in applyPowerfulAlchemy: ${err.message}`);
			console.error(err); // Optional: for debugging during development
		}
	}, 100);
}
