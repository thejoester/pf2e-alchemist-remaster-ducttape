import { debugLog } from './settings.js';
import { hasFeat } from './settings.js';

/**
	Update item description based on regex pattern and replacement logic.
	@param {string} description - The original item description.
	@param {RegExp} regexPattern - The regex pattern to match.
	@param {Function} replacementFn - A function that takes a match and returns a replacement string.
	@returns {string} - The updated item description.
*/
function updateDescription(description, regexPattern, replacementFn) {
	const updatedDescription = description.replace(regexPattern, replacementFn);
	if (updatedDescription !== description) {
		// Output to log
		debugLog("Description was updated to Class DC!");

		// Send Mesactorge to Chat
		const itemName = item.name;
		ChatMesactorge.create({
			author: game.user?.id,    // User ID to send the mesactorge as the system
			content: `<p>${itemName} created with Quick Alchemy using Class DC ${classDC}!</p><p>${item.system.description.value || "No description available."}</p>`,
			speaker: { alias: "PF2e Powerful Alchemy" }  // Optional: sets the speaker to "System"
		});
	}
	return updatedDescription;
}

Hooks.on("ready", () => {
  console.log("%cPF2e Alchemist Remaster Duct Tape: PowerfulAlchemy.js loaded","color: aqua; font-weight: bold;");
	
	//check if Powerful Alchemy is enabled
	const paEnabled = game.settings.get("pf2e-alchemist-remaster-ducttape", "enablePowerfulAlchemy");
	if (paEnabled) {
		debugLog("PowerfulAlchemy enabled.");
		
		Hooks.on("createItem", async (item) => {
			debugLog("Item Created!");
			
			// Get the actor from the item's parent (the actor who owns the item)
			const actor = item.parent;
			if (!actor) {
			  debugLog(3,"Actor for item not found.",);
			  return;
			}
			
			// Make sure selected token is an alchemist
			const isAlchemist = actor.class?.name?.toLowerCase() === 'alchemist'; 
			if (!isAlchemist) {
				ui.notifications.info("Selected Character is not an Alchemist!");
				return;
			}
			
			// First check if the actor has Powerful Alchemy - if not return with mesactorge in log	
			if (!hasFeat(actor, "powerful-alchemy")) {
				debugLog("Actor does not have Powerful alchemy, ignoring!");
				return;	
			}
			
			// Ensure the item has the 'alchemical' trait
			if (!item || !item.system.traits.value.includes("alchemical")) {
			  debugLog("Item does not have the 'alchemical' trait or item is undefined.");
			  return;
			}
			
			// Ensure Quick Alchemy was used to create item - it will have the "infused" trait
			if (!item || !item.system.traits.value.includes("infused")) {
			  debugLog("Item does not have the 'infused' trait or item is undefined.");
			  return;
			}

			// Log infused item was created
			debugLog(`Infused item created!`);
			console.log(item);

			// Get the actor's class DC
			const classDC = actor.system.attributes.classDC?.value;
			console.log("Actor's Class DC:", classDC);
			if (!classDC) {
			  debugLog(2, "Warning: Class DC not found for the actor:", actor);
			  return;
			}

			// Get current description of item
			let description = item.system.description.value;
			
			// Check for strings to replace in item description
			const replacements = [
				{ pattern: /@Check\[\w+\|dc:(\d+)\]/g, replaceFn: (match, p1) => match.replace(`dc:${p1}`, `dc:${classDC}`) }, // If using @check in description
				{ pattern: /DC is (\d+)/g, replaceFn: (match, p1) => match.replace(`DC is ${p1}`, `DC is ${classDC}`) } // Example "DC is 17"
			];
			
			// Make replacements
			let updatedDescription = description;
			for (const { pattern, replaceFn } of replacements) {
				updatedDescription = updateDescription(updatedDescription, pattern, replaceFn);
			}

			// Update the item with the new description
			await item.update({"system.description.value": updatedDescription});
			debugLog("Item description updated successfully.");

		});
	}
});
