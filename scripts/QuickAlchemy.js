import { debugLog, hasFeat, isAlchemist  } from './settings.js';

let isArchetype = false;

Hooks.on("combatTurnChange", async (combat, prior, current) => {
    // Get the combatant whose turn just ended
    const priorCombatant = combat.combatants.get(prior.combatantId);
    if (!priorCombatant) {
        debugLog("No valid prior combatant found during combatTurnChange.");
        return;
    }
	const priorActor = priorCombatant.actor;
	if (!priorActor || priorActor.type !== 'character'){
		debugLog("No valid prior combatant found during combatTurnChange.");
	}
	debugLog(`End of ${priorActor.name}'s turn.`);
	await deleteTempItems(priorActor);
    
});

Hooks.on("deleteCombat", async (combat) => {
    if (!combat) {
        debugLog("No combat found during deleteCombat hook.");
        return;
    }

    debugLog(`Combat ended. Cleaning up items for combatants in Combat ID: ${combat.id}`);

    // Iterate through all combatants in the combat encounter
    for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor || actor.type !== 'character') {
            debugLog(`Actor associated with combatant ${combatant.name} not valid`);
            continue;
        }
		
        // Perform cleanup of Quick Alchemy items created during combat
        await deleteTempItems(actor);
    }
});

Hooks.on("ready", () => {
  console.log("%cPF2e Alchemist Remaster Duct Tape (QuickAlchemy.js) loaded", "color: aqua; font-weight: bold;");
  // Attach function to the global window object
  window.qaCraftAttack = qaCraftAttack;
});
	/*
		Function to clear temporary items from inventory
		
	*/
	async function deleteTempItems(actor){
		debugLog(`deleteTempItems(${actor.name}) called`);
		// Perform cleanup of Quick Alchemy items created during the turn
		const quickAlchemyItems = actor.items.filter(item => 
			item.name.endsWith("(*Temporary)"));
		const removedItems = []; // to collect list of items removed
		for (const item of quickAlchemyItems) {
			removedItems.push(item.name);
			await item.delete();
			debugLog(`Removed ${item.name} from ${actor.name}.`);
		}

		// Send a single chat message summarizing removed items
		if (removedItems.length > 0) {
			const messageContent = `
				<p>The following items created with Quick Alchemy were removed from ${actor.name}'s inventory:</p>
				<ul>${removedItems.map(name => `<li>${name}</li>`).join('')}</ul>
			`;
			ChatMessage.create({
				user: game.user.id,
				speaker: { alias: "Quick Alchemy" },
				content: messageContent
			});
		}
	}
	
	// Function to determine size of the actor
	async function getActorSize(actor){
		// Access the size of the actor
		const creatureSize = await actor.system.traits.size.value;
		debugLog(`The size of the creature is: ${creatureSize}`);
		return creatureSize;
	}
	
	
	// Function to send a message with a link to use a consumable item
	async function sendConsumableUseMessage(itemUuid) {
		// Get the item from the provided UUID
		const item = await fromUuid(itemUuid);
		if (!item) {
			ui.notifications.warn("Item not found.");
			return;
		}

		// Use the item programmatically
		try {
			await item.toChat(); // Display item in chat
			//await item.use({ configureDialog: false }); // Trigger item use (e.g., apply effects)
		} catch (error) {
			debugLog(3,`Error using item: ${error.message}`,error);
			ui.notifications.error("Failed to use the item.");
		}
	}

	/*
		Function to send "Already consumed" chat message
	*/
	function sendAlreadyConsumedChat(){
		/*
			// most likely this happens because user clicked 
			attack already and item was consumed, we will send 
			chat message saying item was already used
		*/
		const actor = game.user.character; // Assuming actor is the user's character
		const content = `
			<p><strong>Unable to attack!</strong></p>
			<p>Item was already consumed, you must craft another one!</p>
			`;

		// Send the message to chat
		ChatMessage.create({
			user: game.user.id,
			speaker: { alias: "Quick Alchemy" },
			content: content,
		});
	}
	
	/*
		Function to create chat message after creating Versatile Vial
		prompting to attack or open QuickAlchemy dialog
	*/
	async function sendVialAttackMessage(itemUuid,actor) {
		// Log the UUID for debugging purposes
		debugLog(`Attempting to fetch item with UUID: ${itemUuid}`);

		// Fetch the item (weapon) from the provided full UUID
		const item = await fromUuid(itemUuid);
		if (!item) {
			ui.notifications.error("Item not found.");
			debugLog(3`Debug: Failed to fetch item with UUID ${itemUuid}`);
			return;
		}

		// Fetch the actor associated with the item
		if (!actor) {
			const actor = item.actor;
		}
		if (!actor) {
			ui.notifications.error("No actor associated with this item.");
			return;
		}

		// Construct the chat message content with buttons for attack rolls
		const content = `
			<p><strong>${actor.name} created Quick Vial with Quick Alchemy!</strong></p>
			<p>${item.system.description.value || "No description available."}</p>
			<button class="roll-attack" data-uuid="${itemUuid}" data-actor-id="${actor.id}" data-item-id="${item.id}" data-map="0" style="margin-top: 5px;">Roll Attack</button>
			<button class="qa-craft" data-actor-id="${actor.id}" style="margin-top: 5px;">Use with Quick Alchemy</button>
		`;

		// Send the message to chat
		ChatMessage.create({
			user: game.user.id,
			speaker: ChatMessage.getSpeaker({ actor: actor }),
			content: content,
		});

		// Event listener for the button click to roll the attack
		Hooks.once("renderChatMessage", (app, html) => {
			
			/*
				 Roll Attack Button
			*/
			// Ensure we only add event listeners once
			if (html.find(".roll-attack").length > 0) {
				html.find(".roll-attack").click(async (event) => {
					const itemUuid = event.currentTarget.dataset.uuid;
					const mapValue = parseInt(event.currentTarget.dataset.map, 10);
					const actorId = event.currentTarget.dataset.actorId;
					const itemId = event.currentTarget.dataset.itemId;

					// Fetch the actor and item based on their IDs
					const actor = game.actors.get(actorId);
					const item = actor.items.get(itemId);

					if (!actor || !item) {
						sendAlreadyConsumedChat();
						debugLog(3, "Actor or Item not found, item already used or UUIDs might be invalid.");
						return;
					}

					// Ensure a target is selected
					const target = game.user.targets.first();
					if (!target) {
						ui.notifications.error("Please target a token for the attack.");
						return;
					} else {
						// Roll the attack with the appropriate MAP modifier
						game.pf2e.rollActionMacro({
							actorUUID: actor.uuid,
							type: "strike",
							itemId: item.id,
							slug: item.slug,
						});
					}
				});
			}

			/*
				 Craft Button
			*/
			// Ensure we only add event listeners once
			if (html.find(".qa-craft").length > 0) {
				html.find(".qa-craft").click(async (event) => {
					const itemUuid = event.currentTarget.dataset.uuid;
					const mapValue = parseInt(event.currentTarget.dataset.map, 10);
					const actorId = event.currentTarget.dataset.actorId;
					const itemId = event.currentTarget.dataset.itemId;

					// Fetch the actor and item based on their IDs
					const actor = game.actors.get(actorId);
					//const item = actor.items.get(itemId);

					if (!actor) {
						sendAlreadyConsumedChat();
						debugLog(3, "Actor or Item not found, item already used or UUIDs might be invalid.");
						return;
					}

					// Show Quick Alchemy dialog
					qaDialog(actor);
				});
			}
		});
	}

	// Function to send a message with a link to roll an attack with a weapon
	async function sendWeaponAttackMessage(itemUuid) {
		// Log the UUID for debugging purposes
		debugLog(`Attempting to fetch item with UUID: ${itemUuid}`);

		// Fetch the item (weapon) from the provided full UUID
		const item = await fromUuid(itemUuid);
		if (!item) {
			ui.notifications.error("Item not found.");
			debugLog(3,`Failed to fetch item with UUID ${itemUuid}`);
			return;
		}

		// Ensure the item is a weapon
		if (item.type !== "weapon") {
			ui.notifications.error("The item is not a weapon.");
			return;
		}

		// Fetch the actor associated with the item
		const actor = item.actor;
		if (!actor) {
			ui.notifications.error("No actor associated with this item.");
			debugLog(3,`No actor associated with this item: `,item);
			return;
		}

		// Construct the chat message content with buttons for attack rolls
		const content = `
			<p><strong>New Item created by Quick Alchemy: ${item.name}</strong></p>
			<p>${item.system.description.value || "No description available."}</p>
			<button class="roll-attack" data-uuid="${itemUuid}" data-actor-id="${actor.id}" data-item-id="${item.id}" data-map="0" style="margin-top: 5px;">Roll Attack</button>
		`;

		// Send the message to chat
		ChatMessage.create({
			user: game.user.id,
			speaker: ChatMessage.getSpeaker({ actor: actor }),
			content: content,
		});

		// Event listener for the button click to roll the attack
		Hooks.once("renderChatMessage", (app, html) => {
			
			
			/*
				Roll Attack Button
			*/
			// Ensure we only add event listeners once
			if (html.find(".roll-attack").length > 0) {
				html.find(".roll-attack").click(async (event) => {
					const itemUuid = event.currentTarget.dataset.uuid;
					const mapValue = parseInt(event.currentTarget.dataset.map, 10);
					const actorId = event.currentTarget.dataset.actorId;
					const itemId = event.currentTarget.dataset.itemId;

					// Fetch the actor and item based on their IDs
					const actor = game.actors.get(actorId);
					const item = actor.items.get(itemId);

					if (!actor || !item) { 
						sendAlreadyConsumedChat();
						debugLog(2, "Actor or Item not found, item already used or UUIDs might be invalid.");
						return;
					}

					// Ensure a target is selected
					const target = game.user.targets.first();
					if (!target) {
						ui.notifications.error("Please target a token for the attack.");
						return;
					} else {
						// Roll the attack with the appropriate MAP modifier
						game.pf2e.rollActionMacro({
							actorUUID: actor.uuid,
							type: "strike",
							itemId: item.id,
							slug: item.slug,
						});
					}
				});
			}
		});
	}

	// Function to equip an item by slug
	async function equipItemBySlug(slug,actor) {
		debugLog(`equipItemBySlug(${slug}, ${actor.name})`);
		
		if (!actor) {
			const actor = canvas.tokens.controlled[0]?.actor;
			if (!actor) {
				debugLog(3,"No actor selected.");
				return;
			}
		}

		const item = await actor.items.find((i) => i.slug === slug);
		if (!item) {
			debugLog("Item not found.");
			return;
		}

		await item.update({
			"system.equipped.carryType": "held",
			"system.equipped.handsHeld": "1",
		});

		ui.notifications.info(`${item.name} is now equipped.`);
		return item._id;
	}

	// Function to clear infused items
	async function clearInfused(actor) {
		let itemsToDelete = [];
		for (let item of actor.items) {
			if (item.system.traits?.value?.includes("infused") && item.system.quantity === 0) {
				itemsToDelete.push(item);
			}
		}

		if (itemsToDelete.length > 0) {
			// Log before deletion for better debugging
			debugLog(`Deleting ${itemsToDelete.length} infused items with quantity 0.`);
			for (let item of itemsToDelete) {
				await item.delete();
			}
				debugLog(`Deleted ${itemsToDelete.length} infused items with 0 quantity.`);
		} else {
			debugLog("No infused items with quantity 0 found.");
		}
	}
	
	// Set Item created as Infused
	async function makeInfused(itemToInfuse){
		if (!itemToInfuse || !itemToInfuse.system || !itemToInfuse.system.traits || !Array.isArray(itemToInfuse.system.traits.value)) {
			debugLog(3, "Invalid item structure");
			return;
		}
		
		if (!itemToInfuse.system.traits.value.includes("infused")) {
				await itemToInfuse.system.traits.value.push("infused");
        }	
	}
	
	/* 	
		Function to craft "Healing Quick Vial" from the module compendium  
		and add "(*Temporary)" to the end of the name and "-temp" to the 
		end of the slug.
	*/
	async function craftHealingVial(selectedItem, selectedActor) {
		// Define the slug for the healing quick vial
		const healingSlug = "healing-quick-vial-temp";
		const alchemyMode = game.settings.get("pf2e-alchemist-remaster-ducttape", "enableSizeBasedAlchemy");
		
		// Get actor size to use for new item size
		const actorSize = await getActorSize(selectedActor);
		// Check if the item already exists in the actor's inventory
		const existingItem = selectedActor.items.find(item => item.slug === healingSlug);

		if (existingItem) {
			// Item exists, increase its quantity
			const newQuantity = existingItem.system.quantity + 1;
			await existingItem.update({ "system.quantity": newQuantity });
			debugLog(`Increased quantity of ${existingItem.name} to ${newQuantity}.`);
			return;
		} else {	
		
			// Item does not exist, retrieve from compendium
			const compendium = game.packs.get("pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items");
			if (!compendium) {
				debugLog(3,"Compendium not found.");
				return;
			}

			try {
				// Find the item in the compendium
				const compendiumIndex = await compendium.getIndex();
				const healingItemEntry = compendiumIndex.find(entry => entry.name === "Healing Quick Vial");
				if (!healingItemEntry) {
					debugLog(3, "Healing Quick Vial not found in compendium.");
					return;
				}

				// Get the full item document from the compendium
				const healingItem = await compendium.getDocument(healingItemEntry._id);

				// Clone the item to make modifications
				const modifiedItem = healingItem.toObject();

				// Adjust Quick Vial Level
				const actorLevel = selectedActor.system.details.level.value;
				const itemLevel = actorLevel >= 18 ? 18 : actorLevel >= 12 ? 12 : actorLevel >= 4 ? 4 : 1;
				const itemFormula = actorLevel >= 18 ? "4d6" : actorLevel >= 12 ? "3d6" : actorLevel >= 4 ? "2d6" : "1d6";
				modifiedItem.system.level.value = itemLevel;
				modifiedItem.system.damage.formula = itemFormula;

				// Rename the item
				modifiedItem.name += " (*Temporary)";
			
				// If we are using size based quick alchemy, modify size
				if (alchemyMode !== "disabled") { 
					if (alchemyMode === "tinyOnly" && actorSize !== "tiny") { 
						debugLog("tinyOnly enabled | Actor is not tiny.");
					} else { 
						modifiedItem.system.size = actorSize; // Adjust size if necessary
					}
				}

				// Add the item to the actor's inventory
				const createdItem = await selectedActor.createEmbeddedDocuments("Item", [modifiedItem]);
				debugLog(`Crafted ${createdItem[0].name}.`);
				return healingSlug;
			} catch (error) {
				debugLog(3, "Error retrieving Healing Quick Vial from compendium:", error);
			}
		}
	}
	
	/* 	
		Function to craft Quick Vial using Quick Alchemy and add  
		"(*Temporary)" to the end of the name and "-temp" to
		the end of the slug of any item created with this 
		Quick Alchmy macro so that it can be removed at the 
		end of the turn and ensured that when attacking it is 
		using the same item.
	*/
	async function craftVial(selectedItem, selectedActor) {
		debugLog(`Selected Item: ${selectedItem?.name || "No Name"}`);
		debugLog(`Selected Actor: ${selectedActor?.name || "No Name"}`);
		
		if (!selectedItem || !selectedActor) {
			debugLog(3, "Invalid item or actor provided.");
			return;
		}
		let newItemSlug = "";
		
		const alchemyMode = game.settings.get("pf2e-alchemist-remaster-ducttape", "enableSizeBasedAlchemy");
		
		// Get actor size to use for new item size
		const actorSize = await getActorSize(selectedActor);
		
		
		// If actor has chirurgeon feat
		if (hasFeat(selectedActor, "chirurgeon")) {
			// Prompt the user to craft a healing Quick Vial
			const userConfirmed = await new Promise((resolve) => {
				new Dialog({
					title: "Chirurgeon",
					content: `<p>Do you want to craft a healing Quick Vial?</p>`,
					buttons: {
						yes: {
							label: "Yes",
							callback: () => resolve(true)
						},
						no: {
							label: "No",
							callback: () => resolve(false)
						}
					},
					default: "no"
				}).render(true);
			});
			
			// If the user confirms, proceed with crafting
			if (userConfirmed) {
				newItemSlug = await craftHealingVial(selectedItem, selectedActor);
				return newItemSlug;
			}
		}
		
		//	If actor has bomber feat we will prompt to select damage type.
		let selectedType = "acid" // Default type to acid
		let specialIngredient = "none"; 
		if (hasFeat(selectedActor,"bomber")){
			debugLog(`feat 'bomber' detected.`);
			selectedType = await new Promise((resolve) => {
				new Dialog({
					title: "Field Vials (Bomber)",
					content: `
						<form>
						  <div class="form-group">
							<label for="damage-type">Select a Damage Type:</label>
							<select id="damage-type">
							  <option value="acid">Acid</option>
							  <option value="cold">Cold</option>
							  <option value="electricity">Electricity</option>
							  <option value="fire">Fire</option>
							</select>
						  </div>
						</form>
					  `,
					buttons: {
						ok: {
							label: "OK",
							callback: (html) => resolve(html.find("#damage-type").val())
						},
					}
				}).render(true);
			});	
			
			// Check if using Advanced Vials (Bomber)
			if (hasFeat(selectedActor, "advanced-vials-bomber")) {
				specialIngredient = await new Promise((resolve) => {
					new Dialog({
						title: "Advanced Vials (Bomber)",
						content: `
							<form>
							  <div class="form-group">
								<label for="special-ingredient">Select special ingredient:</label>
								<select id="special-ingredient">
								  <option value="none">- None -</option>
								  <option value="adamantine">Adamantine</option>
								  <option value="cold-iron">Cold Iron</option>
								  <option value="dawnsilver">Dawnsilver</option>
								</select>
							  </div>
							</form>
						  `,
						buttons: {
							ok: {
								label: "Add",
								callback: (html) => resolve(html.find("#special-ingredient").val())
							},
						}
					}).render(true);
				});
			}
		} 
		
		// Check if the item exists in inventory, has an asterisk, and is infused
		const itemExists = selectedActor.items.find((item) => 
			item.slug === `quick-vial-${selectedType}-temp` && 
			item.name.endsWith(`(${selectedType})(*Temporary)`) && 
			item.system.traits?.value?.includes("infused")
		);
		
		if (itemExists) {
			newItemSlug = itemExists.slug;
			// Item exists, increase quantity of existing infused item
			const newQty = itemExists.system.quantity + 1;
			await itemExists.update({ "system.quantity": newQty });
		} else { // Item does not exist, craft new one
			// Duplicate and modify the item, adding custom flags
			const modifiedItem = foundry.utils.duplicate(selectedItem);
			modifiedItem.system.traits.value.push("infused"); // Add infused trait
			
			// Replace the "acid" trait with the selected damage type
			if (selectedType !== "acid") {
				const traitIndex = modifiedItem.system.traits.value.indexOf("acid");
				if (traitIndex > -1) {
					// Replace the trait at the found index
					modifiedItem.system.traits.value[traitIndex] = selectedType;
				} else {
					// If "acid" is not found, just add the new trait
					modifiedItem.system.traits.value.push(selectedType);
				}
				
				// Update the item's damage type
				if (modifiedItem.system.damage) {
					modifiedItem.system.damage.damageType = selectedType;
				} else {
					debugLog("Item does not have a damage property to update.");
				}					
			}
			
			// Replace materials if selected
			if (specialIngredient !== "none"){
				modifiedItem.system.material.grade = "standard";
				modifiedItem.system.material.type = specialIngredient;
			}
			
			// Append "-temp" to slug for easy identification
			modifiedItem.system.slug = `quick-vial-${selectedType}-temp`;
			newItemSlug = modifiedItem.system.slug;
			// Append "(*Temporary)" to the name for visual identification
			if (!modifiedItem.name.endsWith(`(${selectedType})(*Temporary)`)) {
				modifiedItem.name = `Quick Vial (${selectedType})(*Temporary)`;
			}

			// If we are using size based quick alchemy, modify size
			if (alchemyMode !== "disabled") { 
				if (alchemyMode === "tinyOnly" && actorSize !== "tiny") { 
					debugLog("tinyOnly enabled | Actor is not tiny.");
				} else { 
					modifiedItem.system.size = actorSize; // Adjust size if necessary
				}
			}
			
			// Adjust Quick Vial Level
			// Determine the actor's level
			const actorLevel = selectedActor.system.details.level.value;
			// Determine the highest crafting tier based on actor's level
			const itemLevel = actorLevel >= 18 ? 18 : actorLevel >= 12 ? 12 : actorLevel >= 4 ? 4 : 1;
			modifiedItem.system.level.value = itemLevel;
			
			// Create the items for the actor
			const createdItem = await selectedActor.createEmbeddedDocuments("Item", [modifiedItem]);
			debugLog(`Created item with Quick Alchemy: `, createdItem);
		}
		debugLog(`Returning ${newItemSlug}`);
		return newItemSlug; // return slug
	}
	
	/* 	
		Function to craft item using Quick Alchemy and add  
		"(*Temporary)" to the end of the name and "-temp" to
		the end of the slug of any item created with this 
		Quick Alchmy macro so that it can be removed at the 
		end of the turn and ensured that when attacking it is 
		using the same item.
	*/
	async function craftItem(selectedItem, selectedActor, count = 1) {
		debugLog(`Selected Item: ${selectedItem?.name || "No Name"}`);
		debugLog(`Selected Actor: ${selectedActor?.name || "No Name"}`);
		
		const alchemyMode = game.settings.get("pf2e-alchemist-remaster-ducttape", "enableSizeBasedAlchemy");
		
		if (!selectedItem || !selectedActor) {
			debugLog(3, "Invalid item or actor provided.");
			return;
		}

		// Get actor size to use for new item size
		const actorSize = await getActorSize(selectedActor);

		// Check if the item exists in inventory, has an asterisk, and is infused
		const itemExists = selectedActor.items.find((item) => 
			item.slug === `${selectedItem?.slug}-temp` && 
			item.name.endsWith("(*Temporary)") && 
			item.system.traits?.value?.includes("infused")
		);
	  
		if (itemExists) {
			// Item exists, increase quantity of existing infused item
			const newQty = itemExists.system.quantity + 1;
			await itemExists.update({ "system.quantity": newQty });
		} else {
			// Duplicate and modify the item, adding custom flags
			const modifiedItem = foundry.utils.duplicate(selectedItem);
			modifiedItem.system.traits.value.push("infused"); // Add infused trait
			// Append "-temp" to slug for easy identification
			modifiedItem.system.slug = `${selectedItem.slug}-temp`;
			// Append "(*Temporary)" to the name for visual identification
			if (!modifiedItem.name.endsWith("(*Temporary)")) {
				modifiedItem.name += " (*Temporary)";
			}

			// If we are using size based quick alchemy, modify size
			if (alchemyMode !== "disabled") { 
				if (alchemyMode === "tinyOnly" && actorSize !== "tiny") { 
					debugLog("tinyOnly enabled | Actor is not tiny.");
				} else { 
					modifiedItem.system.size = actorSize; // Adjust size if necessary
				}
			}
			
			// Create the items for the actor
			const createdItem = await selectedActor.createEmbeddedDocuments("Item", [modifiedItem]);
			debugLog(`Created item with Quick Alchemy: `, createdItem);
		}
		return `${selectedItem?.slug}-temp`;
	}
	
	/*
		Function to get count of versatile vials in actor's inventory
	*/
	export function getVersatileVialCount(actor) {
		// Verify valid actor passed
		if (!actor || !actor.items) {
			debugLog(3, `Error: no valid actor passed to getVersatileVialCount()`);
			return 0; // Return 0 instead of undefined for better consistency
		}

		// Filter and count versatile vials
		const versatileVials = actor.items.filter(item => item.slug === "versatile-vial");
		const tempVersatileVials = actor.items.filter(item => item.slug === "versatile-vial-temp");

		// Combine counts using reduce
		const totalVialCount = versatileVials.reduce((count, vial) => count + (vial.system.quantity || 0), 0) + tempVersatileVials.reduce((count, vial) => count + (vial.system.quantity || 0), 0);

		return totalVialCount;
	}


	/*
		Function to consume a versatile vial when crafting with quick alchemy
	*/
	async function consumeVersatileVial(actor, slug, count = 1){
		if (!actor) {
			debugLog(3,"Actor is not defined.");
			return false;
		}
		
		// If we are crafting a veratile vial, do not consume, return true
		if (slug.startsWith("versatile-vial") || slug.startsWith("quick-vial")){
			debugLog(`Crafted item with slug ${slug} without consuming vial`);
			return true;
		}
		
		// Find versatile-vial in inventory
		const regularVial = actor.items.find(item => item.slug === "versatile-vial");

		// Consume versatile vial
		if (regularVial && regularVial.system.quantity >= count) {
			await regularVial.update({ "system.quantity": regularVial.system.quantity - count });
			debugLog(`Consumed ${count} versatile vial(s): ${regularVial.name}`);
			return true;
		}

		// No vial available to consume
		debugLog("No versatile vials available to consume.");
		ui.notifications.warn("No versatile vials available to consume.");
		return false;
	}

	/*
		Function to process formulas with a progress bar
	*/
	async function processFormulasWithProgress(actor) {
		// Get known formulas
		const formulas = actor?.system.crafting?.formulas || [];
		const formulaCount = formulas.length;
		
		if (!formulaCount) {
			debugLog(`No formulas found for type: ${type || 'all'}`);
			return;
		}
		
		// Prepare progress bar dialog
		let progress = 0;
		const total = formulas.length;

		const progressDialog = new Dialog({
		title: "Quick Alchemy",
		content: `
			<div>
			<p>Processing ${formulaCount} formulas, may take a while the first time run...<br>If this window does not close, you may close it.</p>
			<progress id="progress-bar" value="0" max="${total}" style="width: 100%;"></progress>
			</div>
			`,
		buttons: {},
		close: () => {},
		});
		progressDialog.render(true);

		// Arrays to store entry objects
		const weaponEntries = [];
		const consumableEntries = [];

		// Gather entries in respective arrays
		for (let [index, formula] of formulas.entries()) {
			debugLog(`Formula UUID: ${formula.uuid}`);
			const entry = await fromUuid(formula.uuid);

			// Update progress
			progress++;
			const progressBar = document.getElementById("progress-bar");
			if (progressBar) progressBar.value = progress;

			// Check if entry is null
			if (entry != null) {
				debugLog(`slug: ${entry.slug}, name: ${entry.name}, uuid: ${entry.uuid}`);

				if (entry.slug === "versatile-vial") {
					// do nothing 
					debugLog("slug = versatile-vial: skipping");
				} else if (entry.type === "weapon") {
					weaponEntries.push(entry);
					debugLog("added to weaponEntries");
				} else if (entry.type === "consumable") {
					consumableEntries.push(entry);
					debugLog("added to consumableEntries");
				} else {
					//otherEntries.push(entry);
					debugLog("Not Weapon or consumable, ignoring");
				}
			} else { // entry is null
				debugLog(3, `entry ${formula.uuid} is null`);
			}
		}

		// Close progress dialog
		progressDialog.close();
		
		// Sort entries by name
		const sortEntries = async (entriesToSort) => {
			entriesToSort.sort((a, b) => {
				const nameA = a.name.replace(/\s*\(.*?\)/g, "").trim(); // Remove text in parentheses
				const nameB = b.name.replace(/\s*\(.*?\)/g, "").trim();
				const nameComparison = nameA.localeCompare(nameB);
				if (nameComparison !== 0) return nameComparison; // Sort by name if names differ
				const levelA = a.system.level?.value || 0; // Default to 0 if undefined
				const levelB = b.system.level?.value || 0;
				return levelB - levelA; // Otherwise, sort by item level descending
			});
		return { entriesToSort };
		}
		
		sortEntries(weaponEntries);
		sortEntries(consumableEntries);
		
		/*
		weaponEntries.sort((a, b) => a.name.localeCompare(b.name));
		consumableEntries.sort((a, b) => a.name.localeCompare(b.name));
		*/
		// Generate sorted options
		const weaponOptions = weaponEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
		const consumableOptions = consumableEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
		
		// Close progress dialog - just in case
		progressDialog.close();
		
		// Return categorized entries
		return { weaponOptions, consumableOptions };
	}
	
	/*
		Function to process FILTERED formulas with a progress bar
	*/
	async function processFilteredFormulasWithProgress(actor, type) {
		
		if (!type){
			debugLog(3, `No type passed to processFilteredFormulasWithProgress()`);
			return { filteredEntries: [] };
		}
		debugLog(`Filtering by type: ${type}`);
		
		// Get known formulas
		const formulas = actor?.system.crafting?.formulas || [];
		const formulaCount = formulas.length;
		
		if (!formulas.length) {
			debugLog(`No formulas available for actor: ${actor.name}`);
			return { filteredEntries: [] };
		}

		// Prepare progress bar dialog
		let progress = 0;
		const total = formulas.length;

		const progressDialog = new Dialog({
		title: "Quick Alchemy",
		content: `
			<div>
			<p>Processing ${formulaCount} formulas, may take a while the first time run...<br>If this window does not close, you may close it.</p>
			<progress id="progress-bar" value="0" max="${total}" style="width: 100%;"></progress>
			</div>
			`,
		buttons: {},
		close: () => {},
		});
		progressDialog.render(true);

		// Arrays to store entry objects
		const filteredEntries = [];
		
		// Gather entries in respective arrays
		for (let [index, formula] of formulas.entries()) {
			debugLog(`Formula UUID: ${formula.uuid}`);
			const entry = await fromUuid(formula.uuid);

			// Update progress
			progress++;
			const progressBar = document.getElementById("progress-bar");
			if (progressBar) progressBar.value = progress;

			// Check if entry is null
			if (entry != null) {
				debugLog(`slug: ${entry.slug}, name: ${entry.name}, uuid: ${entry.uuid}`);

				if (entry.slug === "versatile-vial") {
					//do nothing
					debugLog("slug = versatile-vial: skipping");
				} else if (entry.type === type) {
					filteredEntries.push(entry);
					debugLog("added to filteredEntries");
				} 
			} else { // entry is null
				debugLog(3, `entry ${formula.uuid} is null`);
			}
		}

		// Close progress dialog
		progressDialog.close();

		// Return categorized entries
		debugLog(`Returning filteredEntries: `, filteredEntries);
		// Sort entries by name then level ignoring text in parenthesis 
		filteredEntries.sort((a, b) => {
			const nameA = a.name.replace(/\s*\(.*?\)/g, "").trim(); // Remove text in parentheses
			const nameB = b.name.replace(/\s*\(.*?\)/g, "").trim();
			const nameComparison = nameA.localeCompare(nameB);
			if (nameComparison !== 0) return nameComparison; // Sort by name if names differ
			const levelA = a.system.level?.value || 0; // Default to 0 if undefined
			const levelB = b.system.level?.value || 0;
			return levelB - levelA; // Otherwise, sort by item level descending
		});
		return { filteredEntries };
		
		// Close progress dialog - just in case
		progressDialog.close();
	}
	
	/*
		Helper function for craftButton() and craftAttackButton()
	*/
	async function handleCrafting(uuid, actor, quickVial = false, doubleBrew = false, attack = false){
	debugLog(`handleCrafting(${uuid}, ${actor.name}, ${doubleBrew}, ${attack}) called.`);
		// Make sure uuid was passed
		if (uuid === "none") {
			debugLog("No item selected for crafting.");
			return;
		}
		
		// Get Selected Item Object from uuid
		const selectedItem = await fromUuid(uuid);
		if (!selectedItem) return;
		// Check if crafting Quick Vial
		let newItemSlug = "";
		if (quickVial) {
			newItemSlug = await craftVial(selectedItem, actor);
		} else {
			newItemSlug = await craftItem(selectedItem, actor);
		}
		debugLog(`newItemSlug: ${newItemSlug}`);
		
		const temporaryItem = actor.items.find(item =>
			item.slug === newItemSlug &&
			item.name.endsWith("(*Temporary)")
		);
		
		if (!temporaryItem) {
			debugLog("Failed to find temporary item created by Quick Alchemy.");
			return;
		}

		const vialConsumed = await consumeVersatileVial(actor, temporaryItem.slug, 1);
		if (!vialConsumed) {
			debugLog("No vials available to craft the item.");
			ui.notifications.error("No versatile vials available.");
			return;
		}
		debugLog(`equipItemBySlug(${temporaryItem.slug}, ${actor.name})`);
		const newUuid = await equipItemBySlug(temporaryItem.slug, actor);
		if (!newUuid) {
			debugLog(3, `Failed to equip item with slug: ${temporaryItem.slug}`);
			ui.notifications.error("Failed to equip item.");
			return;
		}
		
		const sendMsg = async (itemType, uuid, actor) => {
			debugLog(`sendMsg => itemType: ${itemType} | newUuid: ${newUuid} | actor: ${actor.name}`);
			
			
			switch (itemType) {
				case 'weapon':
					sendWeaponAttackMessage(uuid);
					break;
				case 'vial':
					sendVialAttackMessage(uuid, actor);
					break;
				case 'consumable':
					sendConsumableUseMessage(uuid);
					break;
				default:
					debugLog("Unknown item type for crafting.");
			}
		}
		
		const formattedUuid = `Actor.${actor.id}.Item.${newUuid}`;
		debugLog(`formattedUuid: ${formattedUuid}`);
		
		// Determine behavior based on parameters
		if (doubleBrew) {
			// Send message to chat based on item type
			debugLog(`Double Brew enabled, sending item to chat only | newUuid: ${formattedUuid} | actor: `, actor);
			await sendMsg(temporaryItem.type, formattedUuid, actor);
		} else if (attack) {
			await sendMsg(temporaryItem.type, formattedUuid, actor);
			
			game.pf2e.rollActionMacro({
				actorUUID: actor.uuid,
				type: "strike",
				itemId: temporaryItem.id,
				slug: temporaryItem.slug,
			});
			
		} else {
			// Send message to chat based on item type
			await sendMsg(temporaryItem.type, formattedUuid, actor);
		}
	};

	/*
		Function to process craft button
	*/
	async function craftButton(actor, itemUuid, dbItemUuid, itemType){
		const selectedUuid = itemUuid;
		const dbSelectedUuid = dbItemUuid;
		debugLog(`Item Selection: ${selectedUuid} | Double Brew Selection: ${dbSelectedUuid}`);
		
		// Check if we are making Quick Vial
		if (itemType === 'vial'){
			debugLog(`handleCrafting=> uuid: ${selectedUuid} | itemTye: ${itemType} | actor: `, actor);
			await handleCrafting(selectedUuid, actor, true, false, false);
			debugLog(`Double Brew: handleCrafting=> uuid: ${dbSelectedUuid} | actor: `, actor);
			if (dbSelectedUuid == selectedUuid) { // We are creating another Quick Vial
				await handleCrafting(dbSelectedUuid, actor, true, true, false);
			} else {
				await handleCrafting(dbSelectedUuid, actor, false, true, false);
			}
		} else {
			debugLog(`handleCrafting=> uuid: ${selectedUuid} | actor: `, actor);
			await handleCrafting(selectedUuid, actor, false, false, false);
			debugLog(`handleCrafting=> uuid: ${dbSelectedUuid} | actor: `, actor);
			await handleCrafting(dbSelectedUuid, actor, false, true, false);
		}
	}

	/*
		Function to process craft and attack button
	*/
	async function craftAttackButton(actor, itemUuid, dbItemUuid, itemType){
		const selectedUuid = itemUuid; 
		const dbSelectedUuid = dbItemUuid;
		debugLog(`actor name: ${actor.name} | Item Selection: ${selectedUuid} | Item Type: ${itemType} | Double Brew Selection: ${dbSelectedUuid}`);
		
		// Check if we are making Quick Vial
		if (itemType === 'vial'){
			debugLog(`handleCrafting=> uuid: ${selectedUuid} | itemTye: ${itemType} | actor: `, actor);
			await handleCrafting(selectedUuid, actor, true, false, true);
			debugLog(`Double Brew: handleCrafting=> uuid: ${dbSelectedUuid} | actor: `, actor);
			if (dbSelectedUuid == selectedUuid) { // We are creating another Quick Vial
				await handleCrafting(dbSelectedUuid, actor, true, true, false);
			} else {
				await handleCrafting(dbSelectedUuid, actor, false, true, false);
			}
		} else {
			debugLog(`handleCrafting=> uuid: ${selectedUuid} | actor: `, actor);
			await handleCrafting(selectedUuid, actor, false, false, true);
			debugLog(`handleCrafting=> uuid: ${dbSelectedUuid} | actor: `, actor);
			await handleCrafting(dbSelectedUuid, actor, false, true, false);
		}
	}
	
	/*
		Function to display crafting dialog
	*/
	async function displayCraftingDialog(actor, itemType) {
		debugLog(`displayCraftingDialog() actor: ${actor.name} | itemType: ${itemType}`);
		// Check if actor has double brew feat
		const doubleBrewFeat = hasFeat(actor,"double-brew");
		debugLog(`doubleBrewFeat: ${doubleBrewFeat}`);
		let content = ``;
		let selectedUuid = "";
		let dbSelectedUuid = "";
		let craftItemButtons = {};
		
		/*
			If we are creating a Quick vial, we will add one 
			to inventory, Then check if we have Double Brew Feat 
			otherwise ask display list of item type selected
		*/
		if (itemType === 'vial') {
			
			// Use UUID to get the versatile vial item
			const uuid = "Compendium.pf2e.equipment-srd.Item.ljT5pe8D7rudJqus";
			
			const item = await fromUuid(uuid);

			if (!item) {
				debugLog(3, `No item found for versatile vial using UUID: ${uuid}`);
				return;
			}
			debugLog(`actor: ${actor.name} |itemType: ${itemType} | uuid: ${uuid} | item name: ${item.name}`);
			// Build HTML Content
			content = `<form>
				<div>
					<select id="item-selection" style="display: none;">
					<option value="${uuid}">Quick Vial</option>
					</select>
					</div>
					</form>
					`;
			
			//if actor has double brew feat, fisrt ask if we are using it
			if (doubleBrewFeat) {
				// Make sure we have enough Versatile Vials to craft second item
				const vialCount = getVersatileVialCount(actor);
				if (vialCount >= 2) { 
					// Get known formulas
					const { weaponOptions, consumableOptions } = await processFormulasWithProgress(actor);
					// HTML content to prompt which formula to create
					content = `${content}
						<form>
							<h3>Double Brew Feat</h3>
							<p>Crafting Quick Vial, do you also want to use Double Brew to craft another item?</p>
							<div>
								<label for="db-item-selection">Choose Item or leave "-None-":</label>
								<select id="db-item-selection">
								<option value="none">-None-</option>
								<option value="${uuid}">Quick Vial</option>
								${weaponOptions}
								${consumableOptions}
								</select>
								</div>
								</form>
								<br/>
								`;

				}
			}
			// Build Vial Buttons
			craftItemButtons['craftAttack'] = {
				icon: "<i class='fas fa-bomb'></i>",
				label: "Craft and Attack",
				callback: async (html) => {
					// Ensure we have an actor
					if (!actor) {
						ui.notifications.error("Actor not found.");
						return;
					}
					
					// Ensure target exists
					const target = game.user.targets.size > 0 ? [...game.user.targets][0] : null;
					if (!target) {
						ui.notifications.error("Please target a token for the attack.");
						displayCraftingDialog(actor, 'vial');
						return;
					}
					
					selectedUuid = html.find("#item-selection").val();
					dbSelectedUuid = html.find("#db-item-selection").val();
					
					debugLog(`selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
					
					if (!selectedUuid){
						selectedUuid = "none";
					}
					if (!dbSelectedUuid){
						dbSelectedUuid = "none";
					}
					
					craftAttackButton(actor, selectedUuid, dbSelectedUuid, itemType);
				}
			},
			craftItemButtons['craft'] = {
				icon: "<i class='fas fa-hammer'></i>",
				label: "Craft",
				callback: async (html) => {
					if (!actor) {
						ui.notifications.error("Actor not found.");
						return;
					}

					// Perform actions with the actor
					selectedUuid = html.find("#item-selection").val();
					dbSelectedUuid = html.find("#db-item-selection").val();
					debugLog(`selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
					if (!selectedUuid){
						selectedUuid = "none";
					}
					if (!dbSelectedUuid){
						dbSelectedUuid = "none";
					}
					craftButton(actor, selectedUuid, dbSelectedUuid, itemType);
				}
			};
			craftItemButtons['back'] = {
				icon: "<i class='fas fa-arrow-left'></i>",
				label: " Back",
				callback: () => qaDialog(actor)
			};
				
			const craftingDialog = new Dialog({
				title: "Quick Alchemy",
				content: content,
				buttons: craftItemButtons,
				default: "craftvial",
				render: (html) => {
					// Apply styles to specific buttons
					html.find('button:contains("Craft")').css({
						width: "100px",
						height: "40px",
						fontSize: "14px"
					});
					html.find('button:contains("Attack")').css({
						height: "40px",
						fontSize: "14px"
					});
					html.find('button:contains("Back")').css({
						width: "50px",
						height: "40px",
						fontSize: "14px"
					});
				}
			}, {
					width: 450    // Set desired width
			});
			craftingDialog.render(true);
			
		} else { // We are crafting Weapon or Consumable
				
			let options = "";
			const { filteredEntries } = await processFilteredFormulasWithProgress(actor,itemType);
			options = filteredEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
			
			content = `
				<form>
				<div>
				<h3>Select a ${itemType} to craft:</h3>
				<select id="item-selection" style="display: inline-block;margin-top: 5px; overflow-y: auto;">${options}</select>
				<br/><br/>
				</div>
				</form>
				`;
				
			// If actor has double brew feat	
			if (doubleBrewFeat) {
				// Check that actor has versatile vials
				const vialCount = getVersatileVialCount(actor);
				if (vialCount > 1) { // Make sure we have enough versatile vials
				const { weaponOptions, consumableOptions } = await processFormulasWithProgress(actor);
					content = `${content} 
						<form>
							<h3>Double Brew Feat</h3>
							<p>Do you also want to use Double Brew to craft another item?</p>
							<div>
								<label for="db-item-selection">Choose Item or leave "-None-":</label>
								<select id="db-item-selection">
								<option value="none">-None-</option>
								${weaponOptions}
								${consumableOptions}
								</select>
								</div>
								</form>
								<br/>
								`;
				} else { // we will only prompt to make another vial
				
					if (!isArchetype){ // do not show for Archetype
						content = `${content} 
							<form>
							<div>
								<h3>Double Brew Feat</h3>
								<p>You only have ${vialCount}, use Double Brew to craft another?</p>
									<label for="db-item-selection">Double Brew:</label>
									<select id="db-item-selection">
									<option value="none">-None-</option>
									<option value="Compendium.pf2e.equipment-srd.Item.ljT5pe8D7rudJqus">Versatile Vial</option>
									</select>
								</div>
							</form>
							<br/>`;
					}
				}
			}
		
			// Build Buttons
			if (itemType === 'weapon'){
				craftItemButtons['craftAttack'] = {
					icon: "<i class='fas fa-bomb'></i>",
					label: "Craft and Attack",
					callback: async (html) => {
						if (!actor) {
							ui.notifications.error("Actor not found.");
							return;
						}
						
						// Ensure user has target
						const target = game.user.targets.size > 0 ? [...game.user.targets][0] : null;
						if (!target) {
							ui.notifications.error("Please target a token for the attack.");
							displayCraftingDialog(actor, 'weapon');
							return;
						}
						
						selectedUuid = html.find("#item-selection").val();
						dbSelectedUuid = html.find("#db-item-selection").val();
						
						debugLog(`selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
						
						if (!selectedUuid){
							selectedUuid = "none";
						}
						if (!dbSelectedUuid){
							dbSelectedUuid = "none";
						}
						
						craftAttackButton(actor, selectedUuid, dbSelectedUuid, itemType);
					}
				},
				craftItemButtons['craft'] = {
					icon: "<i class='fas fa-hammer'></i>",
					label: "Craft",
					callback: async (html) => {
						if (!actor) {
							ui.notifications.error("Actor not found.");
							return;
						}

						// Perform actions with the actor
						selectedUuid = html.find("#item-selection").val();
						dbSelectedUuid = html.find("#db-item-selection").val();
						debugLog(`selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
						if (!selectedUuid){
							selectedUuid = "none";
						}
						if (!dbSelectedUuid){
							dbSelectedUuid = "none";
						}
						craftButton(actor, selectedUuid, dbSelectedUuid, itemType);
					}
				};
				craftItemButtons['back'] = {
					icon: "<i class='fas fa-arrow-left'></i>",
					label: " Back",
					callback: () => qaDialog(actor)
				};
			} else if (itemType === 'consumable'){
				craftItemButtons['craft'] = {
					icon: "<i class='fas fa-hammer'></i>",
					label: "Craft",
					callback: async (html) => {
						if (!actor) {
							ui.notifications.error("Actor not found.");
							return;
						}

						// Perform actions with the actor
						selectedUuid = html.find("#item-selection").val();
						dbSelectedUuid = html.find("#db-item-selection").val();
						
						if (!selectedUuid){
							selectedUuid = "none";
						}
						if (!dbSelectedUuid){
							dbSelectedUuid = "none";
						}
						craftButton(actor, selectedUuid, dbSelectedUuid, itemType);
					}
				};
				craftItemButtons['back'] = {
					icon: "<i class='fas fa-arrow-left'></i>",
					label: " Back",
					callback: () => qaDialog(actor)
				};
			} 
			
			const craftingDialog = new Dialog({
				title: "Quick Alchemy",
				content: content,
				buttons: craftItemButtons,
				default: "craft",
				render: (html) => {
					// Apply styles to specific buttons
					html.find('button:contains("Craft")').css({
						width: "100px",
						height: "40px",
						fontSize: "14px"
					});
					html.find('button:contains("Attack")').css({
						height: "40px",
						fontSize: "14px"
					});
					html.find('button:contains("Back")').css({
						width: "50px",
						height: "40px",
						fontSize: "14px"
					});
				}
			}, {
					width: 450    // Set desired width
			});
			craftingDialog.render(true);
		}
	}
	
	/*
		Function to display Quick Alchemy Dialog
	*/
	async function qaDialog(actor){
		
		/*
			First we will check how many versatile vials actor has,
			if they have none we will prompt them to search for 10
			minutes, unless they are archetype. 
		*/
		const vialCount = getVersatileVialCount(actor);
		debugLog(`Versatile Vial count for ${actor.name}: ${vialCount}`);
		let dbbuttons = {};
		let content = "";
		
		if (vialCount < 1) {
			dbbuttons['OK'] = { 
				icon: "<i class='fas fa-check'></i>",
				label: "OK",
				callback: () => quickAlchemyDialog.close()
			};
			content = `<p>You have no more Versatile Vials.</p>`;
			if (!isArchetype) content = `${content} You must spend 10 minutes searching for reagents to craft more.`;
		} else {
			dbbuttons['weapon'] = {
				icon: "<i class='fas fa-bomb'></i>",
				label: "Weapon",
				callback: () => displayCraftingDialog(actor, 'weapon')
			};
			dbbuttons['consumable'] = {
				icon: "<i class='fas fa-flask'></i>",
				label: "Consumable",
				callback: () => displayCraftingDialog(actor, 'consumable')
			};
			dbbuttons['vial'] = {
				icon: "<i class='fas fa-vial'></i>",
				label: "Quick Vial",
				callback: () => displayCraftingDialog(actor, 'vial')
			};
			content = `<p>What type of item do you wish to craft with Quick Alchemy?</p>`;
		}
		
		debugLog(`dbbuttons object:`, dbbuttons);
		
		const quickAlchemyDialog = new Dialog({
			title: "Select Item Type",
			content: content,
			buttons: dbbuttons,
			default: "vial"
		});
		quickAlchemyDialog.render(true);
	}
	
	/*
		Main crafting function
	*/
	async function qaCraftAttack() {
		const token = canvas.tokens.controlled[0];
		if (!token) {
			ui.notifications.error("Please select a token first.");
			return;
		}
		const actor = token.actor;
		
		// Make sure selected token is an alchemist or has archetype
		const alchemistCheck = isAlchemist(actor);
		if (!alchemistCheck.qualifies) {
			debugLog(`Selected Character (${actor.name}) is not an Alchemist - Ignoring`);
			return;
		} 
		
		// Check if character is archetype for features. 
		isArchetype = alchemistCheck.isArchetype;
		
		// Delete any items with "infused" tag and 0 qty
		await clearInfused(actor);
		
		qaDialog(actor);

	}


