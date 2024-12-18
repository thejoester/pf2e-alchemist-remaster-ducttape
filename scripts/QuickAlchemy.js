import { debugLog } from './settings.js';
import { hasFeat } from './settings.js';
Hooks.on("ready", () => {
  console.log("%cPF2e Alchemist Remaster Duct Tape (QuickAlchemy.js) loaded", "color: aqua; font-weight: bold;");

	
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

	  // Construct the chat message content
	  const content = `
		<p><strong>New Item created by Quick Alchemy: ${item.name}</strong></p>
		<p>${item.system.description.value}</p>
		<button class="use-consumable" data-uuid="${itemUuid}" style="margin-top: 5px;">Use ${item.name}</button>
	  `;

	  // Send the message to chat
	  ChatMessage.create({
		user: game.user.id,
		speaker: ChatMessage.getSpeaker(),
		content: content,
	  });

	  // Add an event listener to handle the button click
	  Hooks.once("renderChatMessage", (app, html) => {
		html.find(".use-consumable").click(async (event) => {
		  const itemUuid = event.currentTarget.dataset.uuid;
		  const item = await fromUuid(itemUuid);
		  const actor = item?.actor;

		  if (!actor) {
			ui.notifications.error("Actor not found.");
			return;
		  }

		  // Reduce item quantity by 1
		  await item.update({ "system.quantity": item.system.quantity - 1 });
		  ui.notifications.error(`${item.name} has been used.`);

		  // Optionally, trigger any additional effects or healing logic here
		});
	  });
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
			debugLog("Item not found. Please check the UUID.", "u", 3);
			debugLog(`Debug: Failed to fetch item with UUID ${itemUuid}`, "c", 3);
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
			<p><strong>${actor.name} created Versatile Vial with Quick Alchemy!</strong></p>
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
						debugLog("Actor or Item not found, item already used or UUIDs might be invalid.", "c", 3);
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
						debugLog("Actor or Item not found, item already used or UUIDs might be invalid.", "c", 3);
						return;
					}

					// Show Quick Alchemy dialog
					displayQuickAlchemyDialog(actor);
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
			debugLog("Item not found. Please check the UUID.", "u", 3);
			debugLog(`Debug: Failed to fetch item with UUID ${itemUuid}`, "c", 3);
			return;
		}

		// Ensure the item is a weapon
		if (item.type !== "weapon") {
			ui.notifications.error("The item is not a weapon.", "u", 3);
			return;
		}

		// Fetch the actor associated with the item
		const actor = item.actor;
		if (!actor) {
			ui.notifications.error("No actor associated with this item.");
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
						debugLog("Actor or Item not found, item already used or UUIDs might be invalid.", "c", 3);
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
	async function equipItemBySlug(slug) {
		const actor = canvas.tokens.controlled[0]?.actor;
		if (!actor) {
		  debugLog("No actor selected.", "u", 3);
		  return;
		}

		const item = actor.items.find((i) => i.slug === slug);
		if (!item) {
			debugLog("Item not found.", "u", 3);
			return;
		}

		await item.update({
			"system.equipped.carryType": "held",
			"system.equipped.handsHeld": "1",
		});

		debugLog(`${item.name} is now equipped.`, "u", 1);
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
			debugLog("Invalid item structure", "c", 3);
			return;
		}
		
		if (!itemToInfuse.system.traits.value.includes("infused")) {
				await itemToInfuse.system.traits.value.push("infused");
        }	
	}
	
	// Function to craft item
	async function craftItem(selectedItem, selectedActor, count = 1) {
		debugLog(`Selected Item: ${selectedItem?.name || "No Name"}`);
		debugLog(`Selected Actor: ${selectedActor?.name || "No Name"}`);
		
		const alchemyMode = game.settings.get("pf2e-alchemist-remaster-ducttape", "enableSizeBasedAlchemy");
		
		if (!selectedItem || !selectedActor) {
			debugLog("Invalid item or actor provided.", "u", 3);
			return;
		}

		// Get actor size to use for new item size
		const actorSize = await getActorSize(selectedActor); // get actor size

		// Check if the item exists in inventory
		const itemExists = selectedActor.items.find((item) => item.slug === selectedItem?.slug);
		if (itemExists?.system.traits?.value?.includes("infused")) { // make sure item exists and is infused
			// Item exists, Increase quantity of existing infused item
			const newQty = itemExists.system.quantity + count;
			await itemExists.update({ "system.quantity": newQty });
			
		} else {
			// Duplicate and create a new item, with infused trait added
			const modifiedItem = foundry.utils.duplicate(selectedItem);
			modifiedItem.system.traits.value.push("infused"); // Make infused before creation
			if (alchemyMode !== "disabled") { // Adjust size if enabled
				if (alchemyMode === "tinyOnly" && actorSize !== "tiny") { // Actor is not Tiny, do not adjust
					debugLog("tinyOnly enabled | Actor is not tiny.");
				} else { 
					//modifiedItem.system.bulk.heldOrStowed = 0;
					//modifiedItem.system.bulk.value = 0;
					modifiedItem.system.size = actorSize;
					debugLog(modifiedItem);
				}
			}	
			// Create multiple copies if count > 1
			const newItems = Array(count).fill(modifiedItem); // Create multiple versions of the item
			await selectedActor.createEmbeddedDocuments("Item", newItems);
		}
	}

	/*
		Function to get count of versatile vials in actors inventory
	*/
	function getVersatileVialCount(actor){
		//verify valid actor passed
		if (!actor){
			debugLog(`Error: no valid actor passed to getVersatileVialCount()`,"c",3);
			return;
		}
		const versatileVials = actor.items.filter((item) => item.slug === "versatile-vial");
		return versatileVials.reduce((count, vial) => count + vial.system.quantity, 0);
	}


	/*
		Function to consume a versatile vial when crafting with quick alchemy
	*/
	async function consumeVersatileVial(itemCreated, versatileVials, count = 1){
		if (itemCreated === "versatile-vial" || !itemCreated ) {
			debugLog("Creating Versatile Vial, Skipping decrement of Versatile Vial.");
			return;
		} else {
			// Reduce Versatile Vial count
			const vialToRemove = versatileVials[0];
			await vialToRemove.update({ "system.quantity": vialToRemove.system.quantity - count });
		}
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
		const vialEntries = [];
		const otherEntries = [];

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
					vialEntries.push(entry);
					debugLog("added to vialEntries");
				}
				if (entry.type === "weapon") {
					weaponEntries.push(entry);
					debugLog("added to weaponEntries");
				} else if (entry.type === "consumable") {
					consumableEntries.push(entry);
					debugLog("added to consumableEntries");
				} else {
					otherEntries.push(entry);
					debugLog("added to otherEntries");
				}
			} else { // entry is null
				debugLog(`entry ${formula.uuid} is null`, "c", 3);
			}
		}

		// Close progress dialog
		progressDialog.close();

		// Return categorized entries
		return { weaponEntries, consumableEntries, vialEntries, otherEntries };
		
		// Close progress dialog - just in case
		progressDialog.close();
	}
	
	/*
		Function to process FILTERED formulas with a progress bar
	*/
	async function processFilteredFormulasWithProgress(actor, type) {
		
		if (!type){
			debugLog(`No type passed to processFilteredFormulasWithProgress()`,"c",3);
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

				if (entry.type === type) {
					filteredEntries.push(entry);
					debugLog("added to filteredEntries");
				} 
			} else { // entry is null
				debugLog(`entry ${formula.uuid} is null`, "c", 3);
			}
		}

		// Close progress dialog
		progressDialog.close();

		// Return categorized entries
		debugLog(`Returning filteredEntries: <pre>${JSON.stringify(filteredEntries, null, 2)}</pre>`);
		return { filteredEntries };
		
		// Close progress dialog - just in case
		progressDialog.close();
	}

	/*
		Function to display Double Brew Dialog
	*/
	async function displayDoubleBrewDialog(actor) {
		const firstDialog = new Dialog({
			title: "Double Brew Feat",
			content: `<p>Would you like to use your Double Brew Feat?</p>`,
			buttons: {
				yes: {
					icon: "<i class='fas fa-check'></i>",
					label: "Yes",
					callback: () => displayItemTypeDialog(actor)
				},
				no: {
					icon: "<i class='fas fa-times'></i>",
					label: "No",
					callback: () => displayQuickAlchemyDialog(actor)
				}
			},
			default: "no"
		});
		firstDialog.render(true);
	}
	
	/*
		Function to display item type dialog
		for displayDoubleBrewDialog(actor)
	*/
	async function displayItemTypeDialog(actor) {
		
		/*
			First we will check how many versatile vials actor has,
			if they only have 1 we will only ask them to craft another
		*/
		const vialCount = getVersatileVialCount(actor);
		debugLog(`Versatile Vial count for ${actor.name}: ${vialCount}`);
		let dbbuttons = {};
		if (vialCount < 2) { 
			dbbuttons['vial'] = { 
				icon: "<i class='fas fa-vial'></i>",
				label: "Versatile Vial",
				callback: () => displayCraftingDialog(actor, 'vial')
			};
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
				label: "Versatile Vial",
				callback: () => displayCraftingDialog(actor, 'vial')
			};
		}
		
		debugLog(`dbbuttons object:`);
		console.log(dbbuttons);
		
		const secondDialog = new Dialog({
			title: "Select Item Type",
			content: `<p>What type of item do you wish to craft with Quick Alchemy for the <strong>second</strong> item?</p>`,
			buttons: dbbuttons,
			default: "vial"
		});
		secondDialog.render(true);
	}

	/*
		Function to display double brew crafting dialog
		for displayItemTypeDialog(actor)
	*/
	async function displayCraftingDialog(actor, itemType) {
		
		/*
			If we are creating a vial, we will just add one to inventory
			otherwise display options
		*/
		if (itemType === 'vial') {
			// Use UUID to get the versatile vial item
			const uuid = "Compendium.pf2e.equipment-srd.Item.ljT5pe8D7rudJqus";
			const item = await fromUuid(uuid);

			if (!item) {
				debugLog(`No item found for versatile vial using UUID: ${uuid}`,"c",3);
				return;
			}

			// Add the vial to the actor's inventory
			await craftItem(item, actor, 1);

			// Launch the displayQuickAlchemyDialog
			displayQuickAlchemyDialog(actor);

			//return; // Exit the function early since we're done
		} else {
		
			let options = "";
			
			const { filteredEntries } = await processFilteredFormulasWithProgress(actor,itemType);
			console.log(`filteredEntries: `,filteredEntries);
			options = filteredEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
			
			const content = `
				<form>
				<div>
				<label for="item-selection">Select an item to craft:</label>
				<br/>
				<select id="item-selection" style="display: inline-block;margin-top: 5px; overflow-y: auto;">${options}</select>
				<br/><br/>
				</div>
				</form>
				`;
				
			const craftingDialog = new Dialog({
				title: "Select Item to Craft",
				content: content,
				buttons: {
					craft: {
						icon: "<i class='fas fa-hammer'></i>",
						label: "Craft",
						callback: async (html) => {
							const selectedUuid = html.find("#item-selection").val();
							const selectedItem = await fromUuid(selectedUuid);
							if (selectedItem) {
								await craftItem(selectedItem, actor);
								const versatileVials = actor.items.filter((item) => item.slug === "versatile-vial");
								debugLog(`consuming versatile vial| Item Created slug: ${selectedItem.slug} | versatileVials: ${versatileVials}`);
								consumeVersatileVial(selectedItem.slug,versatileVials);
								displayQuickAlchemyDialog(actor);
							} else {
								ui.notifications.error("No item selected or item not found.");
							}
						},
						button: { style: "display: inline-block; margin-top: 10px;" }
					}
				},
				default: "craft"
			});
			craftingDialog.render(true);
		}
	}
	
	
	/*
		Function to display Quick Alchemy Dialog
	*/
	async function displayQuickAlchemyDialog(actor){
		
		// Get known formulas
		const { weaponEntries, consumableEntries, vialEntries, otherEntries } = await processFormulasWithProgress(actor);
	
		// Sort entries by name
		vialEntries.sort((a, b) => a.name.localeCompare(b.name));
		weaponEntries.sort((a, b) => a.name.localeCompare(b.name));
		consumableEntries.sort((a, b) => a.name.localeCompare(b.name));
		
		// Generate sorted options
		const vialOptions = vialEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
		const weaponOptions = weaponEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
		const consumableOptions = consumableEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
		
		// Count the number of options in each
		// Initialize counts
		let weaponCount = "";
		let consumableCount = "";
		const showQACounts = game.settings.get("pf2e-alchemist-remaster-ducttape", "showQACounts");
		if (showQACounts){
			weaponCount = "(" + (weaponOptions.match(/<option/g) || []).length + ")";
			consumableCount = "(" + (consumableOptions.match(/<option/g) || []).length + ")";
			debugLog(`Showing Counts | weaponCount = ${weaponCount} | consumableCount = ${consumableCount}`);
		}
		
		// Check Versatile Vial counts
		const versatileVials = actor.items.filter((item) => item.slug === "versatile-vial");
		//const vialCount = versatileVials.reduce((count, vial) => count + vial.quantity, 0);
		const vialCount = getVersatileVialCount(actor);
		let content = "";
		if (vialCount < 1) { // no versatile vials
			
			// HTML content to prompt to create vial
			content = `
				<form>
					<div>
						<center>
						<label for="vial-formula"><font color="red">No Versatile Vials!</font></label>
						<br/><br/>
						<select id="vial-formula" style="visibility: hidden; height: 0; width: 0;">${vialOptions}</select>
						<button id="craft-vial-btn" type="button" style="display: inline-block; width: 150px; margin-right: 0%;"><i class='fas fa-vial'></i> Craft Versatile Vial</button>
						</center>
					</div>
				</form>
			`;
		} else {
	
			// HTML content to prompt which formula to create
			content = `
				<form>
					<p>Versatile Vials: ${vialCount}</p>
					<div>
						<label for="weapon-formula">Select a Weapon Formula ${weaponCount}</label>
						<select id="weapon-formula">${weaponOptions}</select>
						<button id="craft-weapon-btn" type="button" style="display: inline-block; width: 150px; margin-right: 0%;">
						<i class='fas fa-bomb'></i> Craft and Attack</button>
						<button id="craft-weapon-only-btn" type="button" style="display: inline-block; width: 100px; margin-top: 5px;"><i class='fas fa-hammer'></i> Craft Only</button>
					</div>
					<br/>
					<div>
						<label for="consumable-formula">Select a Consumable Formula ${consumableCount}</label>
						<select id="consumable-formula">${consumableOptions}</select>
						<button id="craft-consumable-btn" type="button" style="margin-top: 5px; width: 225px;"><i class='fas fa-hammer'></i> Craft</button>
					</div>
				</form>
			`;
		}
		
		let qaDialog = new Dialog({
			title: "Quick Alchemy",
			content: content,
			buttons: {},
			render: (html) => {

				/*
					-- Craft Vial Button -- 
				*/
				html.find("#craft-vial-btn").click(async () => {
					const selectedUuid = html.find("#vial-formula").val();
					const selectedItem = await fromUuid(selectedUuid);

					if (selectedItem) {
						
						// Create/Add item
						await craftItem(selectedItem, actor);
						
						// Equip item
						const newUuid = await equipItemBySlug(selectedItem.slug);
						
						// Send Message to Chat
						await sendVialAttackMessage(selectedItem.uuid,actor);
						
						// Close the dialog window
						qaDialog.close();
					
					} else {
						ui.notifications.error("Selected item is invalid.");
					}
				});
	
				// Craft And Attack button
				html.find("#craft-weapon-btn").click(async () => {
					// Get selected item
					const selectedUuid = html.find("#weapon-formula").val();
					const selectedItem = await fromUuid(selectedUuid); 
					
					// Ensure a target is selected
					const target = game.user.targets.first();
					if (!target) {
						ui.notifications.error("Please target a token for the attack.");
						return;
					}
					
					// Create or increase item qty
					if (selectedItem) {
						
						// Create/Add item
						await craftItem(selectedItem, actor);
						
						// Equip Item
						const newUuid = await equipItemBySlug(selectedItem.slug);
						if (!newUuid) {
							ui.notifications.error("Failed to equip item.");
							return;
						} 
						const target = canvas.tokens.controlled[0]?.target;
						
						// Make sure we have a target
						if (!target) {
							ui.notifications.error("Please target a token for the attack.");
							return;
						} else {
							// Initate rollActionMacro 
							const actorUuid = actor.uuid;
							game.pf2e.rollActionMacro({
								actorUUID: actorUuid,
								type: "strike",
								itemId: newUuid,
								slug: selectedItem.slug,
							});
						}

						// Reduce Versatile Vial count
						debugLog(`consuming versatile vial| Item Created slug: ${selectedItem.slug} | versatileVials: ${versatileVials}`);
						consumeVersatileVial(selectedItem.slug,versatileVials);
						
						// Close the dialog window
						qaDialog.close();	

					} else {
						debugLog("Selected item is invalid.", "u", 3);
					}
				});
			
				// Weapon Craft Button Weapon
				html.find("#craft-weapon-only-btn").click(async () => {
					const selectedUuid = html.find("#weapon-formula").val();
					const selectedItem = await fromUuid(selectedUuid);

					if (selectedItem) {
						
						// Create/Add item
						await craftItem(selectedItem, actor);
						
						// Equip item
						const newUuid = await equipItemBySlug(selectedItem.slug);
						
						// Send Message to Chat
						if(selectedItem.slug === "versatile-vial"){
							sendVialAttackMessage(selectedItem.uuid,actor);
						} else {
							await sendWeaponAttackMessage(`${actor.uuid}.Item.${newUuid}`);
						}

						// Reduce Versatile Vial count
						debugLog(`consuming versatile vial| Item Created slug: ${selectedItem.slug} | versatileVials: <pre>${JSON.stringify(versatileVials, null, 2)}</pre>`);
						consumeVersatileVial(selectedItem.slug,versatileVials);
					
						// Close the dialog window
						qaDialog.close();
					
					} else {
						debugLog("Selected item is invalid.", "u", 3);
					}
				});

				// Craft Consumable button
				html.find("#craft-consumable-btn").click(async () => {
					const selectedUuid = html.find("#consumable-formula").val();
					const selectedItem = await fromUuid(selectedUuid);

					if (selectedItem) {
						
						// Create/Add item
						await craftItem(selectedItem, actor);
						
						// Equip item
						const newUuid = await equipItemBySlug(selectedItem.slug);
						
						// Send message to Chat
						await sendConsumableUseMessage(`${actor.uuid}.Item.${newUuid}`);
						
						// Reduce Versatile Vial count
						debugLog(`consuming versatile vial| Item Created slug: ${selectedItem.slug} | versatileVials: ${versatileVials}`);
						consumeVersatileVial(selectedItem.slug,versatileVials);
						
						// Close the dialog window
						qaDialog.close();	

					} else {
						debugLog("Selected item is invalid.", "u", 3);
					}
				});
			},
		},{width: 300, height: 'auto'}).render(true);
	}
	
	/*
		Main crafting function
	*/
	async function qaCraftAttack() {
		const token = canvas.tokens.controlled[0];
		if (!token) {
			debugLog("Please select a token first.", "u", 3);
			return;
		}
		const actor = token.actor;
		
		// Delete any items with "infused" tag and 0 qty
		await clearInfused(actor);
		
		// Check if actor has double brew feat
		const doubleBrewFeat = hasFeat(actor,"double-brew");
		
		//if actor has double brew feat, fisrt ask if we are using it
		if (doubleBrewFeat) {
			displayDoubleBrewDialog(actor);
		} else {		
			// Display Quick Alchemy dialog
			displayQuickAlchemyDialog(actor);
		}
	}

  // Attach function to the global window object
  window.qaCraftAttack = qaCraftAttack;
});
