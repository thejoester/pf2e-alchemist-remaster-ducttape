import { debugLog, getSetting, hasFeat, isAlchemist  } from './settings.js';

// See if VialSearch option enabled, default to false
let vialSearchReminder = false;
let versatileVialName = "versatile vial";

Hooks.once('init', () => {
    // Check if the vialSearchReminder setting is enabled globally
    vialSearchReminder = getSetting("vialSearchReminder");
	
    if (vialSearchReminder) {
		
		//debug
		debugLog(`Vial Search Reminder enabled!`);
		
		Hooks.on('updateWorldTime', async () => {

			// Ensure this hook only runs for GMs
			if (!game.user.isGM) return;
			
			/*
				explorationTime = total time in exploration mode
				currentTime = game world current time
				previousTime = game world time before change
			*/			
			
			// Initialize explorationBlocks and get explorationTime and previousTime from game settings
			let explorationBlocks = 0;
			let explorationTime = getSetting('explorationTime') ?? 0;
			let previousTime = getSetting('previousTime');
			const currentTime = game.time.worldTime;

			// If previousTime is not set, initialize it to current world time
			if (!previousTime) {
				previousTime = currentTime;
				await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', previousTime);
				debugLog(`Initializing previousTime to current world time: ${previousTime}`);
			}

			// If in combat, stop tracking
			if (game.combat) {
				debugLog(`In Combat - Not incrementing explorationTime`);
				await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', currentTime);
				return;
			}

			// Calculate the difference in time
			let diff = currentTime - previousTime;

			debugLog(`Current Time: ${currentTime}, Previous Time: ${previousTime}, Diff: ${diff}, Exploration Time: ${explorationTime}`);

			// Cap the maximum possible time difference to 90 minutes (5400 seconds) but **only for forward time**
			if (diff > 5400) {
				debugLog(`Large time jump detected. Limiting diff to 90 minutes.`);
				diff = 5400; // Cap diff to 90 minutes
			}

			// Handle negative diff by subtracting it from explorationTime
			if (diff < 0) {
				explorationTime += diff; // Subtract the diff from explorationTime
				debugLog(`Negative time detected. Reducing explorationTime by ${Math.abs(diff)} seconds.`);
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

			debugLog(`Exploration time updated | explorationTime: ${explorationTime} | explorationBlocks: ${explorationBlocks}`);

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

				/*
					Checking that actor is Alchemist
					!!!Archetype does not qualify for this feature!!!
				*/
				const isAlchemist = actor.class?.name?.toLowerCase() === 'alchemist'; 
				if (!isAlchemist) continue; // actor is not alchemist, stop

				// Avoid processing the same actor multiple times
				if (processedActorIds.has(actor.id)) continue;
				processedActorIds.add(actor.id);
				
				// Get maximum vials character can have
				const maxVials = getMaxVials(actor);
				
				/* 
				Get number of vials that can be found per block
				= 2 unless actor has alchemical expertise feat
				*/
				let foundVials = hasFeat(actor, "alchemical-expertise") ? 3 : 2;
				// multiply by how many 10 minute blocks have passed
				foundVials *= explorationBlocks;
				
				// get current vial count
				let currentVials = getCurrentVials(actor); 
				debugLog(`${actor.name} has ${currentVials} and found a max of ${foundVials} versatile vials.`);

				if (currentVials < maxVials) { // if actor is not maxed out on vials already
					
					// Make sure we do not exceed maxVials count
					const maxVialsToAdd = maxVials - currentVials;
					foundVials = foundVials < maxVialsToAdd ? foundVials : maxVialsToAdd;
					
					
					const messageContent = `
                        <p>${actor.name} has spent ${explorationBlocks * 10} minutes in exploration mode. Would you like to add ${foundVials} versatile vials? (Maximum: ${maxVials}, Current: ${currentVials})</p>
                        <button class="add-vials-button" data-actor-id="${actor.id}" data-found-vials="${foundVials}">Add Vials</button>
                    `;

                    // Make sure to only send to owner of actor
					const playerIds = game.users.filter(u => actor.testUserPermission(u, 'OWNER')).map(u => u.id);
					
					// Compose chat message
                    const message = await ChatMessage.create({
                        content: `
                            <p>${actor.name} has spent ${explorationBlocks * 10} minutes in exploration mode. Would you like to add ${foundVials} versatile vials? (Maximum: ${maxVials}, Current: ${currentVials})</p>
                            <button class="add-vials-button" data-actor-id="${actor.id}" data-found-vials="${foundVials}">Add Vials</button>
                        `,
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
							content: `${actor.name} already has the maximum number of versatile vials.`,
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
		console.error('Error: foundVials is not a valid number');
		return;
	}
    const actor = game.actors.get(actorId);
    if (!actor) { // Check for Actor, if none stop
		debugLog(`No actor found on .add-vials-button`);
		return; 
	}
	
    // Check if the player has owner permission on the actor
    if (!actor.testUserPermission(game.user, 'OWNER')) {
        ui.notifications.warn('You do not have permission to modify this actor.');
        return;
    }

    if (vialsToAdd > 0) { // Make sure we are adding vials
        // add vials to the actor
        await addVialsToActor(actor, vialsToAdd); // Add vials 
		debugLog(`Added ${vialsToAdd} to ${actor.name}`);
		
        // Send chat message visible to all players
        ChatMessage.create({
            content: `${actor.name} found ${vialsToAdd} versatile vial(s).`,
            speaker: { alias: "Game Master" }
        });
    } else {
        ui.notifications.warn(`${actor.name} already has the maximum number of versatile vials.`);
    }
	
	// Once clicked - delete button from chat mesasage
	const messageId = button.closest('.message').dataset.messageId; // Get the chat message ID
    const message = game.messages.get(messageId); // Get the chat message object
	debugLog(`MessageId: ${messageId} | message: ${message}`);
    
	if (!messageId) {
        console.error('Message ID not found on button. Ensure data-message-id is set correctly.');
        return;
    }
	if (!message) {
        console.error(`Message not found for ID: ${messageId}`);
        return;
    }
	
    // Disable the button and remove it from the chat message
    button.disabled = true;
    const updatedContent = message.content.replace(button.outerHTML, '');
    await message.update({ content: updatedContent });
	
});

/*
	function to get the max number of versatile vials actor should have in inventory
	@param {Actor} actor 
	@returns {number} maximum count of versatile vials
*/
function getMaxVials(actor){
  const maxVials = 2 + actor.system.abilities.int.mod; // 2 + INT modifier
  debugLog(`Actor ${actor.name} max vials calculated as: ${maxVials}`);
  return maxVials;
}

/*
	function to get the current count of versatile vials in an actor's inventory
	@param {Actor} actor 
	@returns {number} Current count of versatile vials
*/
function getCurrentVials(actor) {
    const versatileVials = actor.items.filter((item) => item.slug?.toLowerCase() === "versatile-vial");
    const vialCount = versatileVials.reduce((count, vial) => count + vial.system.quantity, 0);
    return vialCount;
}

/*
	Custom function to add versatile vials to the actor's inventory
	@param {number} count - Number of vials to add
*/
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
                console.log(`${actor.name}'s versatile vial level updated to ${itemLevel}.`);
            }

			// Update the item's quantity
			const newQuantity = currentQuantity + count;
			await vialItem.update({ 'system.quantity': newQuantity });
			debugLog(`Updated versatile vial quantity for ${actor.name} to ${newQuantity}.`);
		} else {
			// Add a new versatile vial item from the compendium
			const versatileVials = actor.getResource("versatileVials");
			if (versatileVials) {
				
				// Determine the highest crafting tier based on actor's level
				const itemLevel = actorLevel >= 18 ? 18 : actorLevel >= 12 ? 12 : actorLevel >= 4 ? 4 : 1;
				await actor.updateResource("versatileVials", versatileVials.value + count);
				vialItem = actor.items.find(item => item.system.slug === 'versatile-vial');
				if (vialItem) await vialItem.update({ 'system.level.value': itemLevel });
				debugLog(`Added item (quantity: ${count}, level: ${vialItem.level}) to ${actor.name}: `, vialItem );
			}
		}
	} catch (error) {
		debugLog(`Error adding versatile vial for actor ${actor.name}:`, error);
	}
}
