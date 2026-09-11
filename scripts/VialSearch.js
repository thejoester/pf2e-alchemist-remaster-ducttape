import { debugLog, getSetting, hasFeat, qualifiesForQA  } from './settings.js';
import { LT } from "./localization.js";

// vial-search reminder toggle, read at init
let vialSearchReminder = false;
let versatileVialName = "versatile vial";

/* ==========================================================================
	Pyrotechnic (fire) versatile vials
========================================================================== */

// trait + damage changes to retype an acid versatile vial, or null if none needed
function vialRetypeUpdate(vial, damageType) {
	if (!vial || !damageType || damageType === "acid") return null;
	const traits = [...(vial.system?.traits?.value ?? [])];
	const isAcid = vial.system?.damage?.damageType === "acid" || traits.includes("acid");
	if (!isAcid) return null;
	const i = traits.indexOf("acid");
	if (i > -1) traits[i] = damageType;
	else if (!traits.includes(damageType)) traits.push(damageType);
	const update = { "system.traits.value": traits };
	if (vial.system?.damage) {
		update["system.damage.damageType"] = damageType;
		update["system.damage.critDamageType"] = damageType;
	}
	return update;
}

// retype an existing versatile vial in place to match the actor's vial damage type
async function retypeVialForActor(actor, vial) {
	const { vialDamageType } = qualifiesForQA(actor);
	const update = vialRetypeUpdate(vial, vialDamageType);
	if (!update) return;
	await vial.update(update);
	debugLog(`VialSearch.js | ${actor.name}'s versatile vials retyped to ${vialDamageType}.`);
}

// New versatile vials (daily prep or otherwise) get retyped before creation, so Firework
// Technician vials are pyrotechnic without a follow-up write.
Hooks.on("preCreateItem", (item) => {
	try {
		const actor = item?.parent;
		if (!actor || item.system?.slug !== "versatile-vial") return;
		const { vialDamageType } = qualifiesForQA(actor);
		const update = vialRetypeUpdate(item, vialDamageType);
		if (update) item.updateSource(update);
	} catch (e) {
		debugLog(3, `VialSearch.js | preCreateItem vial retype failed: ${e?.message ?? e}`);
	}
});

// Catch-up sweep for vials that predate the feat or this feature
Hooks.once("ready", async () => {
	if (!game.user.isGM) return;
	for (const actor of game.actors) {
		const vial = actor.items.find(i => i.system?.slug === "versatile-vial");
		if (vial) await retypeVialForActor(actor, vial);
	}
});

Hooks.once('init', () => {
    // Check if the vialSearchReminder setting is enabled globally
    vialSearchReminder = getSetting("vialSearchReminder");
	
    if (vialSearchReminder) {
		debugLog(`VialSearch.js | Vial Search Reminder enabled!`);

		Hooks.on('updateWorldTime', async () => {

			// Ensure this hook only runs for GMs
			if (!game.user.isGM) return;
			
			/*
				explorationTime = accumulated time in exploration mode
				currentTime = world time now; previousTime = world time at last tick
			*/
			let explorationBlocks = 0;
			let explorationTime = getSetting('explorationTime') ?? 0;
			let previousTime = getSetting('previousTime');
			const currentTime = game.time.worldTime;

			// If previousTime is not set, initialize it to current world time
			if (!previousTime) {
				previousTime = currentTime;
				await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', previousTime);
				debugLog(`VialSearch.js | Initializing previousTime to current world time: ${previousTime}`);
			}

			// If in combat, stop tracking
			if (game.combat) {
				debugLog(`VialSearch.js | In Combat - Not incrementing explorationTime`);
				await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', currentTime);
				return;
			}

			// Calculate the difference in time
			let diff = currentTime - previousTime;

			debugLog(`VialSearch.js | Current Time: ${currentTime}, Previous Time: ${previousTime}, Diff: ${diff}, Exploration Time: ${explorationTime}`);

			// Cap the maximum possible time difference to 90 minutes (5400 seconds) but **only for forward time**
			if (diff > 5400) {
				debugLog(`VialSearch.js | Large time jump detected. Limiting diff to 90 minutes.`);
				diff = 5400; // Cap diff to 90 minutes
			}

			// Handle negative diff by subtracting it from explorationTime
			if (diff < 0) {
				explorationTime += diff; // Subtract the diff from explorationTime
				debugLog(`VialSearch.js | Negative time detected. Reducing explorationTime by ${Math.abs(diff)} seconds.`);
			} else {
				// Accumulate total exploration time for positive diffs
				explorationTime += diff;
			}

			// Calculate how many 10-minute blocks occurred
			if (explorationTime >= 600) {
				explorationBlocks = Math.floor(explorationTime / 600);
				explorationTime %= 600; // Store only the leftover time
			}

			// Ensure explorationTime does not go negative
			explorationTime = Math.max(0, explorationTime); 

			debugLog(`VialSearch.js | Exploration time updated | explorationTime: ${explorationTime} | explorationBlocks: ${explorationBlocks}`);

			// Save explorationTime and previousTime back into the game settings
			await game.settings.set('pf2e-alchemist-remaster-ducttape', 'explorationTime', explorationTime);
			await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', currentTime);

			// If no blocks were found, do nothing
			if (explorationBlocks <= 0) return;

			// Reset diff
			diff = 0;

			// Avoid sending multiple messages for the same actor
			const processedActorIds = new Set();

			// Loop through all party actors and find Alchemists
			for (const actor of game.actors.party.members) {
				if (!actor || actor.type !== 'character') continue; // Actor is character

				// Checking that actor is Alchemist - Archetype does not qualify for this feature
				const alchemistCheck = qualifiesForQA(actor);
				// Only those who replenish vials during exploration: Alchemist class + Firework Technician.
				if (!alchemistCheck.qualifies || !alchemistCheck.explorationVials) {
					debugLog(`VialSearch.js | Skipping Vial Search for Actor: ${actor.name} | Qualifies: ${alchemistCheck.qualifies} | explorationVials: ${alchemistCheck.explorationVials}`);
					continue; // actor does not get exploration vial replenishment
				}

				// Avoid processing the same actor multiple times
				if (processedActorIds.has(actor.id)) continue;
				processedActorIds.add(actor.id);
				
				// Get maximum vials character can have
				const maxVials = getMaxVials(actor);
				
				// number of vials that can be found per block = 2 unless actor has alchemical expertise feat
				let foundVials = hasFeat(actor, "alchemical-expertise") ? 3 : 2;
				// multiply by how many 10 minute blocks have passed
				foundVials *= explorationBlocks;
				
				// get current vial count
				let currentVials = getCurrentVials(actor); 
				debugLog(`VialSearch.js | ${actor.name} has ${currentVials} and found a max of ${foundVials} versatile vials.`);

				if (currentVials < maxVials) { // if actor is not maxed out on vials already
					
					// Make sure we do not exceed maxVials count
					const maxVialsToAdd = maxVials - currentVials;
					foundVials = foundVials < maxVialsToAdd ? foundVials : maxVialsToAdd;
					
					
					const messageContent = `
                        <p>${LT.vialsearchMessage({ actorName: actor.name, explorationTime: explorationBlocks * 10, foundVials })} (${LT.vialsearchMax()}: ${maxVials}, ${LT.vialsearchCurrent()}: ${currentVials})</p>
						<button class="add-vials-button" data-actor-id="${actor.id}" data-found-vials="${foundVials}">${LT.vialsearchAddVials()}</button>
                    `;

                    // Make sure to only send to owner of actor
					const playerIds = game.users.filter(u => actor.testUserPermission(u, 'OWNER')).map(u => u.id);
					
					// Compose chat message
                    const message = await ChatMessage.create({
                        content: messageContent,
                        speaker: { alias: "Game Master" },
                        whisper: playerIds
                    });
					
					// Update the message to add the data-message-id to the button
					const updatedContent = message.content.replace(
						'<button class="add-vials-button"',
						`<button class="add-vials-button" data-message-id="${message.id}"`
					);
					await message.update({ content: updatedContent });
				} else {
					if (getSetting('maxVialsMessage')) { // Check settings if we are sending messages
						// Send chat message visible to all players
						ChatMessage.create({
							content: `${actor.name} ${LT.vialsearchHasMaxVials()}`,
							speaker: { alias: "Game Master" }
						});
					}
				}	
			}
		});
	}
});

// Event listener for button click
$(document).on('click', '.add-vials-button', async (event) => {
    const button = event.currentTarget;
    const actorId = button.dataset.actorId;
	const vialsToAdd = parseInt(button.dataset.foundVials, 10);
	if (isNaN(vialsToAdd)) {
		debugLog(3,'VialSearch.js | Error: foundVials is not a valid number');
		return;
	}
    const actor = game.actors.get(actorId);
    if (!actor) { // Check for Actor, if none stop
		debugLog(`VialSearch.js | No actor found on .add-vials-button`);
		return; 
	}
	
    // Check if the player has owner permission on the actor
    if (!actor.testUserPermission(game.user, 'OWNER')) {
        ui.notifications.warn(LT.notifNoPerms());
        return;
    }

    if (vialsToAdd > 0) { // Make sure we are adding vials
        // add vials to the actor
        await addVialsToActor(actor, vialsToAdd); // Add vials 
		debugLog(`VialSearch.js | Added ${vialsToAdd} to ${actor.name}`);
		
        // Send chat message visible to all players
        ChatMessage.create({
            content: LT.vialsearchChatFoundVials({ actorname: actor.name, vialcount: vialsToAdd }),
            speaker: { alias: "Game Master" }
        });
    } else {
        ui.notifications.warn(LT.notifAlreadyMaxVials({ actorname: actor.name }));
    }
	
	// Once clicked - delete button from chat mesasage
	const messageId = button.closest('.message').dataset.messageId; // Get the chat message ID
    const message = game.messages.get(messageId); // Get the chat message object
	debugLog(`VialSearch.js | MessageId: ${messageId} | message: ${message}`);
    
	if (!messageId) {
        debugLog('VialSearch.js | Message ID not found on button. Ensure data-message-id is set correctly.');
        return;
    }
	if (!message) {
        debugLog(`VialSearch.js | Message not found for ID: ${messageId}`);
        return;
    }
	
    // Disable the button and remove it from the chat message
    button.disabled = true;
    const updatedContent = message.content.replace(button.outerHTML, '');
    await message.update({ content: updatedContent });
	
});

// max vials an actor should hold: 2 + INT mod
function getMaxVials(actor){
  const maxVials = 2 + actor.system.abilities.int.mod; // 2 + INT modifier
  debugLog(`VialSearch.js | Actor ${actor.name} max vials calculated as: ${maxVials}`);
  return maxVials;
}

// current versatile vial count in inventory
function getCurrentVials(actor) {
    const versatileVials = actor.items.filter((item) => item.slug?.toLowerCase() === "versatile-vial");
    const vialCount = versatileVials.reduce((count, vial) => count + vial.system.quantity, 0);
    return vialCount;
}

// add versatile vials to an actor, creating the item or bumping quantity
export async function addVialsToActor(actor, count) {
	
	// Determine the actor's level
	const actorLevel = actor.system.details.level.value;
	// Determine the highest crafting tier based on actor's level
	const itemLevel = actorLevel >= 18 ? 18 : actorLevel >= 12 ? 12 : actorLevel >= 4 ? 4 : 1;
	// Check if the actor already has the versatile vial item
	let vialItem = actor.items.find(item => item.system.slug === 'versatile-vial');
	try {
		if (vialItem) {
			// Update the item if it exists
			const currentQuantity = vialItem.system.quantity ?? 0;
			
			// Update item level if it doesn't match the expected level
            const currentLevel = vialItem.system.level.value;
            if (currentLevel !== itemLevel) {
                await vialItem.update({ 'system.level.value': itemLevel });
                debugLog(`VialSearch.js | ${actor.name}'s versatile vial level updated to ${itemLevel}.`);
            }

			// Update the item's quantity
			const newQuantity = currentQuantity + count;
			await vialItem.update({ 'system.quantity': newQuantity });
			debugLog(`VialSearch.js | Updated versatile vial quantity for ${actor.name} to ${newQuantity}.`);
		} else {
			// Add a new versatile vial item from the compendium
			const versatileVials = actor.getResource("versatileVials");
			if (versatileVials) {
				
				// Determine the highest crafting tier based on actor's level
				const itemLevel = actorLevel >= 18 ? 18 : actorLevel >= 12 ? 12 : actorLevel >= 4 ? 4 : 1;
				await actor.updateResource("versatileVials", versatileVials.value + count);
				vialItem = actor.items.find(item => item.system.slug === 'versatile-vial');
				if (vialItem) await vialItem.update({ 'system.level.value': itemLevel });
				debugLog(`VialSearch.js | Added item (quantity: ${count}, level: ${vialItem.level}) to ${actor.name}: `, vialItem );
			}
		}

		// Firework Technician's versatile vials are pyrotechnic (fire, not acid)
		if (vialItem) await retypeVialForActor(actor, vialItem);
	} catch (error) {
		debugLog(`VialSearch.js | Error adding versatile vial for actor ${actor.name}:`, error);
	}
}