Hooks.on("ready", () => {
  console.log("%cPF2e Alchemist Remaster Duct Tape (main.js) loaded", "color: aqua; font-weight: bold;");
	
	// Function to send a message with a link to use a consumable item
	async function sendConsumableUseMessage(itemUuid) {
	  // Get the item from the provided UUID
	  const item = await fromUuid(itemUuid);
	  if (!item) {
		ui.notifications.error("Item not found.");
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
		  ui.notifications.info(`${item.name} has been used.`);

		  // Optionally, trigger any additional effects or healing logic here
		});
	  });
	}

	// Function to send a message with a link to roll an attack with a weapon
async function sendWeaponAttackMessage(itemUuid) {
	// Log the UUID for debugging purposes
	console.log(`Attempting to fetch item with UUID: ${itemUuid}`);

	// Fetch the item (weapon) from the provided full UUID
	const item = await fromUuid(itemUuid);
	if (!item) {
		ui.notifications.error("Item not found. Please check the UUID.");
		console.log(`Debug: Failed to fetch item with UUID ${itemUuid}`);
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
					ui.notifications.error("Actor or Item not found. UUIDs might be invalid.");
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

   
  // Helper function to check if an actor has a specific feat by slug
  function hasFeat(actor, slug) {
    return actor.itemTypes.feat.some((feat) => feat.slug === slug);
  }
	
  // Function to equip an item by slug
  async function equipItemBySlug(slug) {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor) {
      ui.notifications.error("No actor selected.");
      return;
    }

    const item = actor.items.find((i) => i.slug === slug);
    if (!item) {
      ui.notifications.error("Item not found.");
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
		console.log(`Deleting ${itemsToDelete.length} infused items with quantity 0.`);
      for (let item of itemsToDelete) {
        await item.delete();
      }
      console.log(`Deleted ${itemsToDelete.length} infused items with 0 quantity.`);
    } else {
      console.log("No infused items with quantity 0 found.");
    }
  }

  // Show loading screen
  function showLoadingScreen() {
    const overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.style = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background-color: rgba(0, 0, 0, 0.5); display: flex;
      justify-content: center; align-items: center;
      color: white; font-size: 24px;
    `;
    overlay.innerHTML = "Loading... Please wait";
    document.body.appendChild(overlay);
  }

  // Hide loading screen
  function hideLoadingScreen() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) document.body.removeChild(overlay);
  }
	
	// Set Item created as Infused
	async function makeInfused(itemToInfuse){
		if (!itemToInfuse || !itemToInfuse.system || !itemToInfuse.system.traits || !Array.isArray(itemToInfuse.system.traits.value)) {
			console.error("Invalid item structure");
			return;
		}
		
		if (!itemToInfuse.system.traits.value.includes("infused")) {
				await itemToInfuse.system.traits.value.push("infused");
        }	
	}
	
	
	async function craftItem(selectedItem, selectedActor) {
		console.log(`Selected Item: ${selectedItem?.name || "No Name"}`);
		console.log(`Selected Actor: ${selectedActor?.name || "No Name"}`);

		if (!selectedItem || !selectedActor) {
			ui.notifications.error("Invalid item or actor provided.");
			return;
		}

		// Check if the item exists in inventory
		const itemExists = selectedActor.items.find((item) => item.slug === selectedItem?.slug);
		if (itemExists?.system.traits?.value?.includes("infused")) {
			// Increase quantity of existing infused item
			const newQty = itemExists.system.quantity + 1;
			await itemExists.update({ "system.quantity": newQty });
		} else {
			// Duplicate and create a new item, with infused trait added
			const modifiedItem = foundry.utils.duplicate(selectedItem);
			modifiedItem.system.traits.value.push("infused"); // Make infused before creation
			await selectedActor.createEmbeddedDocuments("Item", [modifiedItem]);
		}
	}

	async function consumeVersatileVial(itemCreated, versatileVials){
	if (itemCreated === "versatile-vial" || !itemCreated ) {
			console.log(`Item Slug: ${itemSlug}. Skipping decrement of Versatile Vial.`);
			return;
		} else {
			// Reduce Versatile Vial count
			const vialToRemove = versatileVials[0];
			await vialToRemove.update({ "system.quantity": vialToRemove.system.quantity - 1 });
		}
	}		

  // Main crafting function
	async function qaCraftAttack() {
		const token = canvas.tokens.controlled[0];
		if (!token) {
			ui.notifications.error("Please select a token first.");
			return;
		}

		const actor = token.actor;
		const formulas = actor?.system.crafting?.formulas || [];
		const versatileVials = actor.items.filter((item) => item.slug === "versatile-vial");
		const vialCount = versatileVials.reduce((count, vial) => count + vial.quantity, 0);

		if (vialCount < 1) {
			new Dialog({
				title: "No Versatile Vials",
				content: "<p>You do not have any Versatile Vials available for crafting.</p>",
				buttons: { ok: { label: "OK", callback: () => {} } },
				default: "ok",
			}).render(true);
			return;
		}

		// Delete any items with "infused" tag and 0 qty
		await clearInfused(actor);

		// Arrays to store entry objects
		const weaponEntries = [];
		const consumableEntries = [];

		// Gather entries in respective arrays
		for (let formula of formulas) {
			const entry = await fromUuid(formula.uuid);
			if (entry) {
				if (entry.type === "weapon") {
					weaponEntries.push(entry);
				} else if (entry.type === "consumable") {
					consumableEntries.push(entry);
				}
			}
		}
	
		// Sort entries by name
		weaponEntries.sort((a, b) => a.name.localeCompare(b.name));
		consumableEntries.sort((a, b) => a.name.localeCompare(b.name));

		// Generate sorted options
		const weaponOptions = weaponEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
		const consumableOptions = consumableEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
	
		// HTML content
		const content = `
			<form>
				<p>Versatile Vials: ${vialCount}</p>
				<div>
					<label for="weapon-formula">Select a Weapon Formula</label>
					<select id="weapon-formula">${weaponOptions}</select>
					<button id="craft-weapon-btn" type="button" style="display: inline-block; width: 150px; margin-right: 0%;">Craft and Attack</button>
					<button id="craft-weapon-only-btn" type="button" style="display: inline-block; width: 100px; margin-top: 5px;">Craft Only</button>
				</div>
				<br/>
				<div>
					<label for="consumable-formula">Select a Consumable Formula</label>
					<select id="consumable-formula">${consumableOptions}</select>
					<button id="craft-consumable-btn" type="button" style="margin-top: 5px; width: 225px;">Craft</button>
				</div>
			</form>
		`;

		let qaDialog = new Dialog({
			title: "Quick Alchemy",
			content: content,
			buttons: {},
				render: (html) => {

					// Craft And Attack button
					html.find("#craft-weapon-btn").click(async () => {
					// Get selected item
					const selectedUuid = html.find("#weapon-formula").val();
					const selectedItem = await fromUuid(selectedUuid); 
					
					// Make target is selected
					
					
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
						consumeVersatileVial(selectedItem.slug,versatileVials);
						
						/*
						const vialToRemove = versatileVials[0];
						await vialToRemove.update({ "system.quantity": vialToRemove.system.quantity - 1 });
						*/
						
						// Close the dialog window
						qaDialog.close();	

					} else {
						ui.notifications.error("Selected item is invalid.");
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
						await sendWeaponAttackMessage(`${actor.uuid}.Item.${newUuid}`);

						// Reduce Versatile Vial count
						consumeVersatileVial(selectedItem.slug,versatileVials);
						
						/*
						const vialToRemove = versatileVials[0];
						await vialToRemove.update({ "system.quantity": vialToRemove.system.quantity - 1 });
						*/

						// Close the dialog window
						qaDialog.close();
					
					} else {
						ui.notifications.error("Selected item is invalid.");
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
						consumeVersatileVial(selectedItem.slug,versatileVials);
						
						/*
						const vialToRemove = versatileVials[0];
						await vialToRemove.update({ "system.quantity": vialToRemove.system.quantity - 1 });
						*/
						
						// Close the dialog window
						qaDialog.close();	

					} else {
					ui.notifications.error("Selected item is invalid.");
					}
				});
			},
		},{width: 300, height: 'auto'}).render(true);
	}

  // Attach function to the global window object
  window.qaCraftAttack = qaCraftAttack;
});
