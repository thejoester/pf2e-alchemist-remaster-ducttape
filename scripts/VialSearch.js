import { debugLog } from './settings.js';

// See if VialSearch option enabled, default to false
let vialSearchReminder = false;

Hooks.once('init', () => {
    // Check if the vialSearchReminder setting is enabled globally
    vialSearchReminder = game.settings.get("pf2e-alchemist-remaster-ducttape", "vialSearchReminder");

    if (vialSearchReminder) {
		
		//debug
		debugLog(`Vial Search Reminder enabled!`);
		
		Hooks.on('updateWorldTime', async () => {

			// Ensure this hook only runs for GMs
			if (!game.user.isGM) return;
		  
			const TEN_MINUTES_IN_SECONDS = 600; // 10 minutes in seconds

			// Retrieve or initialize the last processed time and the previous time
			let lastProcessedTime = game.settings.get('pf2e-alchemist-remaster-ducttape', 'lastProcessedTime') || 0;
			let previousTime = game.settings.get('pf2e-alchemist-remaster-ducttape', 'previousTime');

			// If previousTime is not set (still 0), initialize it to the current world time
			if (!previousTime) {
				previousTime = game.time.worldTime;
				await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', previousTime);
				debugLog(`Initializing previousTime to current world time: ${previousTime}`);
			}
			
			// Get the current world time
			const currentTime = game.time.worldTime;

			// Check if the game is in combat
			if (game.combat) {
				debugLog(`Still in combat`);
				// await game.settings.set('pf2e-alchemist-remaster-ducttape', 'lastProcessedTime', lastProcessedTime);
				await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', currentTime);
				debugLog(`Current Time: ${currentTime}, Previous Time: ${previousTime}, Last Processed Time: ${lastProcessedTime}`);
				return;
			}

			// Calculate time difference
			let diff = currentTime - previousTime;

			// Handle large jumps in time (like advancing 1 day) by capping the diff to a reasonable range
			if (diff < 0) {
				debugLog(`Negative time difference detected. Correcting. Previous: ${previousTime}, Current: ${currentTime}`);
				lastProcessedTime += diff; // Subtract the backward movement from elapsed time
				lastProcessedTime = Math.max(lastProcessedTime, 0); // Ensure it doesn't go negative
				diff = Math.max(diff, 0); // Ensure diff does not go negative
			} else if (diff > 3600) { // If diff is greater than 1 hour (in seconds)
				debugLog(`Large time jump detected. Limiting diff to 1 hour. Previous: ${previousTime}, Current: ${currentTime}`);
				diff = 3600; // Cap to 1 hour (3600 seconds)
			}

			diff = Math.floor(diff);

			// Accumulate the elapsed time
			lastProcessedTime = Math.floor(lastProcessedTime + diff);
			debugLog(`Current Time: ${currentTime}, Previous Time: ${previousTime}, Diff: ${diff}, Last Processed Time: ${lastProcessedTime}`);

			// If it has not been 10 minutes, return
			if (lastProcessedTime < TEN_MINUTES_IN_SECONDS) {
				await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', currentTime);
				await game.settings.set('pf2e-alchemist-remaster-ducttape', 'lastProcessedTime', lastProcessedTime);
				return;
			}

			// If it HAS been 10 minutes... 
			debugLog(`10 minutes have passed. Resetting lastProcessedTime.`);
			lastProcessedTime -= TEN_MINUTES_IN_SECONDS;

			// Update the last processed time in game settings
			await game.settings.set('pf2e-alchemist-remaster-ducttape', 'lastProcessedTime', lastProcessedTime);

			// Avoid sending multiple messages for the same actor
			const processedActorIds = new Set();

			// Loop through all actors and find Alchemists
			for (const actor of game.actors) {
				if (!actor || actor.type !== 'character') continue;

				const isAlchemist = actor.class?.name?.toLowerCase() === 'alchemist';
				if (!isAlchemist) continue;

				// Avoid processing the same actor multiple times
				if (processedActorIds.has(actor.id)) continue;
				processedActorIds.add(actor.id);

				const maxVials = 2 + actor.system.abilities.int.mod; // Calculate max vials
				let currentVials = getCurrentVials(actor); // Custom function to get current vial count

				if (currentVials < maxVials) {
					const messageContent = `
						<p>${actor.name} has spent 10 minutes in exploration mode. Would you like to add up to 2 versatile vials? (Maximum: ${maxVials}, Current: ${currentVials})</p>
						<button class="add-vials-button" data-actor-id="${actor.id}">Add Vials</button>
					`;

					const playerIds = game.users.filter(u => actor.testUserPermission(u, 'OWNER')).map(u => u.id);
					ChatMessage.create({
						content: messageContent,
						speaker: ChatMessage.getSpeaker({ actor: actor }),
						whisper: playerIds
					});
				}
			}

			// Update the previous time to the current time at the end of the function
			await game.settings.set('pf2e-alchemist-remaster-ducttape', 'previousTime', currentTime);
		});
	}
});


// Event listener for button click
$(document).on('click', '.add-vials-button', async (event) => {
    const button = event.currentTarget;
    const actorId = button.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;

    // Check if the player has owner permission on the actor
    if (!actor.testUserPermission(game.user, 'OWNER')) {
        ui.notifications.warn('You do not have permission to modify this actor.');
        return;
    }

    const maxVials = 2 + actor.system.abilities.int.mod; // Calculate max vials
    let currentVials = getCurrentVials(actor); // Custom function to get current vial count

    const vialsToAdd = Math.min(2, maxVials - currentVials);
    if (vialsToAdd > 0) {
        await addVialsToActor(actor, vialsToAdd); // Custom function to add vials to the actor
        ui.notifications.info(`${actor.name} found ${vialsToAdd} versatile vials!`);
        
        // Disable the button
        button.disabled = true;
        button.textContent = "Vials Added";

        // Send chat message visible to all players
        ChatMessage.create({
            content: `${actor.name} found ${vialsToAdd} versatile vial(s).`,
            speaker: ChatMessage.getSpeaker({ actor: actor })
        });
    } else {
        ui.notifications.warn(`${actor.name} already has the maximum number of versatile vials.`);
    }
});

/**
 * Custom function to get the current count of versatile vials in an actor's inventory
 * @param {Actor} actor 
 * @returns {number} Current count of versatile vials
 */
function getCurrentVials(actor) {
    const versatileVials = actor.items.filter((item) => item.slug === "versatile-vial");
    const vialCount = versatileVials.reduce((count, vial) => count + vial.system.quantity, 0);
    return vialCount;
}

/**
 * Custom function to add versatile vials to the actor's inventory
 * @param {Actor} actor 
 * @param {number} count - Number of vials to add
 */
async function addVialsToActor(actor, count) {
    let vialItem = actor.items.find(item => item.name.toLowerCase() === 'versatile vial');
    
    if (!vialItem) { 
      const compendium = game.packs.get('pf2e.equipment-srd');
      const entry = await compendium.getIndex().then(index => index.find(e => e.name.toLowerCase() === 'versatile vial'));
      if (entry) { 
          const item = await compendium.getDocument(entry._id);
          if (item) {
              const itemData = item.toObject();
              itemData.system.quantity = count;
              await actor.createEmbeddedDocuments('Item', [itemData]);
          }
      }
    } else {
        const newQuantity = vialItem.system.quantity + count;
        await vialItem.update({ 'system.quantity': newQuantity });
    }
}  
