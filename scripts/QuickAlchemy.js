import { debugLog, getSetting, hasFeat, isAlchemist  } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";

let isArchetype = false;
const acidVialId = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.9NXufURxsBROfbz1";
const poisonVialId = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.LqZyfGxtRGXEpzZq";

// Hook for combat turn change to remove temp items on start of turn
Hooks.on("combatTurnChange", async (combat, prior, current) => {
	
	// Get Setting to see if we are removing Quick Vials at start of turn
	if (getSetting("removeTempItemsAtTurnChange", true)) {
		
		//only run as GM
		if (game.user.isGM) {
			
			//get previous combatant - check for Quick Vials
			const priorCombatant = combat.combatants.get(prior.combatantId)
			if (!priorCombatant) {
				debugLog(LOCALIZED_TEXT.DEBUG_PRIOR_COMBATANT_NOT_FOUND);
			} else {
				const priorActor = priorCombatant.actor;
				if (!priorActor || priorActor.type !== 'character'){
					debugLog(LOCALIZED_TEXT.DEBUG_PRIOR_COMBATANT_NOT_FOUND);
				}
				const alchemistCheck = isAlchemist(priorActor);
				if (!alchemistCheck.qualifies) {
					debugLog(LOCALIZED_TEXT.DEBUG_PRIOR_COMBATANT_NOT_ALCHEMIST(priorActor.name));
				} else {
					debugLog(LOCALIZED_TEXT.DEBUG_END_COMBATANT_TURN(priorActor.name));
					await deleteTempItems(priorActor, true); // Delete Quick Vials
				}
			}
			
			// Get the combatant whose turn it is
			const currentCombatant = combat.combatants.get(current.combatantId);
			
			// Make sure there is a current combatant
			if (!currentCombatant) {
				debugLog(2, LOCALIZED_TEXT.DEBUG_PRIOR_COMBATANT_NOT_FOUND);
				return;
			}
			//Get current combatant actor
			const currentActor = currentCombatant.actor;
			// Make sure the actor exists and is a character
			if (!currentActor || currentActor.type !== 'character' ){
				debugLog(1, LOCALIZED_TEXT.DEBUG_PRIOR_COMBATANT_NOT_FOUND);
				return;
			}
			debugLog(1, `${LOCALIZED_TEXT.DEBUG_CURRENT_ACTOR_TURN(currentActor.name)}`);
			// Ensure current combatant is alchemist
			const alchemistCheck = isAlchemist(currentActor);
			if (alchemistCheck.qualifies) {
				// Delete temp items
				await deleteTempItems(currentActor);
			}
		}
    }
});

// Hook for combat end to remove temp items
Hooks.on("deleteCombat", async (combat) => {
	
	//only run as GM
	if (game.user.isGM) {

		// Get Setting to see if we are removing items at start of turn
		if (getSetting("removeTempItemsAtEndCombat", true)) {
			// Make surre combat object exists
			if (!combat) {
				debugLog(2, LOCALIZED_TEXT.DEBUG_NO_COMBAT_FOUND);
				return;
			}

			debugLog(1, LOCALIZED_TEXT.DEBUG_COMBAT_ENDED);

			// Iterate through all combatants in the combat encounter
			for (const combatant of combat.combatants) {
				const actor = combatant.actor;
				// Make sure they exist and are a character
				if (!actor || actor.type !== 'character') {
					debugLog(1, LOCALIZED_TEXT.DEBUG_COMBATANT_ACTOR_NOTVALID(combatant.name));
					continue;
				}
				// Perform cleanup of temporary Quick Alchemy items created during combat
				await deleteTempItems(actor);
				await deleteTempItems(actor, true);
			}
		}
	}
});

/*
	renderChatMessage Hook for .roll-attack and .use-consumable buttons
*/
Hooks.on("renderChatMessage", (message, html) => {
	// Handle "Roll Attack" button functionality
    html.find(".roll-attack").on("click", async (event) => {
        const itemUuid = event.currentTarget.dataset.uuid;
        const actorId = event.currentTarget.dataset.actorId;
        const itemId = event.currentTarget.dataset.itemId;

        const actor = game.actors.get(actorId);
        const item = actor?.items.get(itemId);

        if (!actor || !item) {
            debugLog(3, LOCALIZED_TEXT.DEBUG_ACTOR_ITEM_NOTFOUND);
            return;
        }

        // Ensure a target is selected
        const target = game.user.targets.first();
        if (!target) {
            ui.notifications.error(LOCALIZED_TEXT.QUICK_ALCHEMY_PLEASE_TARGET);
            return;
        }

        // Roll the attack with the appropriate MAP modifier
        game.pf2e.rollActionMacro({
            actorUUID: actor.uuid,
            type: "strike",
            itemId: item.id,
            slug: item.slug,
        });
    });
	
	// Handle "Use" button functionality for consumables
    html.find('.use-consumable').on('click', async (event) => {
        const button = event.currentTarget;
        const itemId = button.dataset.itemId;
        const actorId = button.dataset.actorId;

        const actor = game.actors.get(actorId);
        if (!actor) {
            debugLog(2, LOCALIZED_TEXT.DEBUG_ACTOR_NOTFOUND);
            return;
        }

        const item = actor.items.get(itemId);
        if (!item) {
           debugLog(2, LOCALIZED_TEXT.DEBUG_ITEM_NOTFOUND);
            return;
        }

        try {
            if (item.type === "consumable") {
                // Use the `consume()` method
                await item.consume();
               debugLog(LOCALIZED_TEXT.DEBUG_ITEM_CONSUMED(item.name));
            } else {
                debugLog(2, LOCALIZED_TEXT.DEBUG_ITEM_NOT_CONSUNMED(item.name));
            }
        } catch (error) {
            debugLog(3, LOCALIZED_TEXT.DEBUG_FAILED_USE_ITEM(error.message), error);
        }
    });
});

/*
	renderChatMessage Hook for collapsable messages
*/
Hooks.on("renderChatMessage", (message, html) => {
	let messageHook = `${LOCALIZED_TEXT.DEBUG_LOG_MESSAGE_HOOK_FROM} ${message.speaker?.alias || message.flavor || "Unknown"}`;
	
	// Process only messages with the alias "Quick Alchemy"
    if (message.speaker.alias !== "Quick Alchemy") {
        messageHook = `${messageHook} ${LOCALIZED_TEXT.DEBUG_SKIP_NONALCHEMY_MESSAGE}`;
		debugLog(messageHook);
        return;
    }
    
	// Check if Workbench is installed and its collapse setting is enabled
    const isWorkbenchInstalled = game.modules.get("xdy-pf2e-workbench")?.active;
    const workbenchCollapseEnabled = isWorkbenchInstalled
        ? game.settings.get("xdy-pf2e-workbench", "autoCollapseItemChatCardContent")
        : false;
    messageHook = `${messageHook}\n -> ${LOCALIZED_TEXT.DEBUG_WORKBENCH_INSTALLED} ${isWorkbenchInstalled}`;
    messageHook = `${messageHook}\n -> ${LOCALIZED_TEXT.DEBUG_WORKBENCH_COLLAPSE_ENABLED} ${workbenchCollapseEnabled}`;

    // Check collapse setting
    const collapseChatDesc = getSetting("collapseChatDesc");
    messageHook = `${messageHook}\n -> ${LOCALIZED_TEXT.DEBUG_COLLAPSE_ENABLED} ${collapseChatDesc}`;

    // If Workbench is managing the collapsible content, skip your logic
    if (workbenchCollapseEnabled === "collapsedDefault" || workbenchCollapseEnabled === "nonCollapsedDefault") {
        messageHook = `${messageHook}\n -> ${LOCALIZED_TEXT.DEBUG_SKIPPING_COLLAPSE_FUNC}`;
		debugLog(messageHook);
        return;
    }

    // Add collapsible functionality only if your module's setting is enabled
    if (collapseChatDesc) {
	messageHook = `${messageHook}\n -> ${LOCALIZED_TEXT.DEBUG_ADDING_COLLAPSE_FUNC}`;

        // Collapse the content by default
        html.find('.collapsible-content').each((_, element) => {
            element.style.display = 'none';
        });

        // Handle toggle icon click
        html.find('.toggle-icon').on('click', (event) => {
            debugLog(LOCALIZED_TEXT.DEBUG_TOGGLE_ICON_CLICKED);
            const toggleIcon = event.currentTarget;
            const collapsibleContent = toggleIcon.closest('.collapsible-message')?.querySelector('.collapsible-content');

            if (!collapsibleContent) {
                debugLog(2, LOCALIZED_TEXT.DEBUG_NO_COLLAPSABLE_FOUND);
				debugLog(messageHook);
                return;
            }

            // Toggle visibility
            const isHidden = collapsibleContent.style.display === 'none' || collapsibleContent.style.display === '';
            collapsibleContent.style.display = isHidden ? 'block' : 'none';

            // Toggle icon state
            toggleIcon.classList.toggle('fa-eye', !isHidden);
            toggleIcon.classList.toggle('fa-eye-slash', isHidden);
            debugLog(LOCALIZED_TEXT.DEBUG_TOGGLE_ICON_UPDATED);
        });
    } else {
        messageHook = `${messageHook}\n -> ${LOCALIZED_TEXT.DEBUG_COLLAPSE_DISABLED_SKIP}`;
    }
	debugLog(messageHook);
});

Hooks.on("ready", () => {
  console.log("%cPF2e Alchemist Remaster Duct Tape (QuickAlchemy.js) loaded", "color: aqua; font-weight: bold;");
  // Attach function to the global window object
  window.qaCraftAttack = qaCraftAttack;
});
	
	/*
		Function to clear temporary items from inventory
	*/
	async function deleteTempItems(actor, endTurn = false){
		debugLog(LOCALIZED_TEXT.DEBUG_DELETE_TEMP_ITEMS(actor.name, endTurn));
		
		let quickAlchemyItems = [];
		// See if we are deleting Quick Vials (at enf of alchemist turn)
		 if (endTurn) {
			// Get Quick Vial Items (ensure slug exists)
			quickAlchemyItems = Array.from(actor.items.values()).filter(item =>
				(item.system.slug && item.system.slug.startsWith("quick-vial")) || 
				(item.name && item.name.includes("(*Poisoned)"))
			);
			debugLog(`quickAlchemyItems: `,quickAlchemyItems);
		} else {
			// Get consumables created with Quick Alchemy (ensure name exists)
			quickAlchemyItems = Array.from(actor.items.values()).filter(item =>
				item.name && (item.name.endsWith("(*Temporary)") || item.name.includes("(*Poisoned)"))
			);
		}
		
		const removedItems = []; // Collect list of removed items
		for (const item of quickAlchemyItems) {
			try {
				removedItems.push(item.name);
				await item.delete();
				debugLog(LOCALIZED_TEXT.DEBUG_LOG_REMOVED(item.name,actor.name));
			} catch (err) {
				debugLog(LOCALIZED_TEXT.DEBUG_FAILED_REMOVE_FROM_ACTOR(item.name,actor.name), err);
			}
		}

		// Send a single chat message summarizing removed items
		if (removedItems.length > 0) {
			if (getSetting("createRemovedTempItemsMsg")){
			
				const messageContent = `
					${LOCALIZED_TEXT.QUICK_ALCHEMY_MSG_ITEMS_REMOVED(actor.name)}
					<ul>${removedItems.map(name => `<li>${name}</li>`).join('')}</ul>
				`;
				ChatMessage.create({
					user: game.user.id,
					speaker: { alias: `Quick Alchemy` },
					content: messageContent
				});
			}
		}
	}
	
	// Function to determine size of the actor
	async function getActorSize(actor){
		// Access the size of the actor
		const creatureSize = await actor.system.traits.size.value;
		debugLog(LOCALIZED_TEXT.DEBUG_CREATURE_SIZE(creatureSize));
		return creatureSize;
	}
	
	
	// Function to send a message with a link to use a consumable item
	async function sendConsumableUseMessage(itemUuid) {
		const item = await fromUuid(itemUuid);
		if (!item) {
			ui.notifications.warn(LOCALIZED_TEXT.DEBUG_ITEM_NOTFOUND);
			return;
		}

		const actor = item.actor;
		if (!actor) {
			ui.notifications.warn(LOCALIZED_TEXT.DEBUG_ACTOR_NOT_ASSOC_ITEM);
			return;
		}

		const collapseChatDesc = getSetting("collapseChatDesc");
		const itemName = item.name;
		const itemImg = item.img || "path/to/default-image.webp";
		const itemDescription = item.system?.description?.value || LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC;
		const itemId = item.id; // Add item ID for tracking
		
		const content = `
        <div class="pf2e chat-card item-card">
            <header class="card-header flexrow">
                <h3 class="chat-portrait-text-size-name-pf2e">
                    <img src="${itemImg}" alt="${itemName}" width="36" height="36" class="chat-portrait-image-size-name-pf2e">
                    ${itemName}
                </h3>
            </header>

            ${collapseChatDesc ? `
                <div class="collapsible-message">
                    <i class="fas fa-eye toggle-icon" style="cursor: pointer;"></i>
                    <div class="collapsible-content" style="display: none;">
                        <div class="card-content">
                            <p>${itemDescription}</p>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="card-content">
                    <p>${itemDescription}</p>
                </div>
            `}

            <div class="card-buttons">
                <button type="button" class="use-consumable" data-item-id="${item.id}" data-actor-id="${actor.id}">
                    ${LOCALIZED_TEXT.BTN_USE}
                </button>
            </div>
        </div>
    `;

		// Create the chat message
		ChatMessage.create({
			user: game.user.id,
			speaker: { alias: "Quick Alchemy", actor: actor.id }, // Ensure the actor ID is available in speaker
			content: content,
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
		const content = LOCALIZED_TEXT.QUICK_ALCHEMY_ALREADY_CONSUMED_MSG;

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
		debugLog(LOCALIZED_TEXT.DEBUG_ATTEMPT_FETCH_ITEM_UUID(itemUuid));

		// Fetch the item (weapon) from the provided full UUID
		const item = await fromUuid(itemUuid);
		if (!item) {
			ui.notifications.error(LOCALIZED_TEXT.DEBUG_ITEM_NOTFOUND);
			debugLog(3,LOCALIZED_TEXT.DEBUG_FETCH_ITEM_UUID_FAIL(itemUuid));
			return;
		}

		// Fetch the actor associated with the item
		if (!actor) {
			const actor = item.actor;
		}
		if (!actor) {
			ui.notifications.error(LOCALIZED_TEXT.DEBUG_ACTOR_NOT_ASSOC_ITEM);
			return;
		}

		// Construct the chat message content with buttons for attack rolls
		const content = `
			<p><strong>${actor.name} ${LOCALIZED_TEXT.QUICK_ALCHEMY_CREATED_QV_MSG}</strong></p>
			<div class="collapsible-message">
				<i class="fas fa-eye toggle-icon"></i>
				<div class="collapsible-content" style="display: none;">
					<p>${item.system.description.value || LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC}</p>
				</div>
			</div>
			<script>
			  const toggleIcon = document.querySelector('.collapsible-message .toggle-icon');
			  const collapsibleContent = document.querySelector('.collapsible-message .collapsible-content');
			  
			  toggleIcon.addEventListener('click', () => {
				const isHidden = collapsibleContent.style.display === 'none';
				collapsibleContent.style.display = isHidden ? 'block' : 'none';
				toggleIcon.classList.toggle('fa-eye', !isHidden);
				toggleIcon.classList.toggle('fa-eye-slash', isHidden);
			  });
			</script>
			<button class="roll-attack" data-uuid="${itemUuid}" data-actor-id="${actor.id}" data-item-id="${item.id}" data-map="0" style="margin-top: 5px;">Roll Attack</button>
		`;

		// Send the message to chat
		ChatMessage.create({
			user: game.user.id,
			speaker: ChatMessage.getSpeaker({ actor: actor }),
			content: content,
		});
	}

	// Function to send a message with a link to roll an attack with a weapon
	async function sendWeaponAttackMessage(itemUuid) {
		// Log the UUID for debugging purposes
		debugLog(LOCALIZED_TEXT.DEBUG_ATTEMPT_FETCH_ITEM_UUID(itemUuid));

		// Fetch the item (weapon) from the provided full UUID
		const item = await fromUuid(itemUuid);
		if (!item) {
			ui.notifications.error(LOCALIZED_TEXT.DEBUG_ITEM_NOTFOUND);
			debugLog(3, LOCALIZED_TEXT.DEBUG_FETCH_ITEM_UUID_FAIL(itemUuid));
			return;
		}

		// Ensure the item is a weapon
		if (item.type !== "weapon") {
			ui.notifications.error(LOCALIZED_TEXT.NOTIF_ITEM_NOT_WEAPON);
			return;
		}
		
		// Fetch the actor associated with the item
		const actor = item.actor;
		if (!actor) {
			ui.notifications.error(LOCALIZED_TEXT.DEBUG_ACTOR_NOT_ASSOC_ITEM);
			debugLog(3, LOCALIZED_TEXT.DEBUG_ACTOR_NOT_ASSOC_ITEM, item);
			return;
		}

		// Check if description collapsing is enabled
		const collapseChatDesc = getSetting("collapseChatDesc");

		// Construct the chat message content
		const itemName = item.name;
		const itemImg = item.img || "path/to/default-image.webp";
		const itemDescription = item.system?.description?.value || LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC;
		const content = `
			<div class="pf2e chat-card item-card" data-actor-id="${actor.id}" data-item-id="${item.id}" data-source="weapon">
				<header class="card-header flexrow">
					<h3 class="chat-portrait-text-size-name-pf2e">
						<img src="${itemImg}" alt="${itemName}" width="36" height="36" class="chat-portrait-image-size-name-pf2e">
						${itemName}
					</h3>
				</header>

				${collapseChatDesc ? `
					<div class="collapsible-message">
						<i class="fas fa-eye toggle-icon" style="cursor: pointer;"></i>
						<div class="collapsible-content" style="display: none;">
							<div class="card-content"><p>${itemDescription}</p></div>
						</div>
					</div>
				` : `
					<div class="card-content">${itemDescription}</div>
				`}

				<div class="card-buttons">
					<button type="button" class="roll-attack" data-uuid="${itemUuid}" data-actor-id="${actor.id}" data-item-id="${item.id}" data-map="0">
						${LOCALIZED_TEXT.BTN_ROLL_ATK}
					</button>
				</div>
			</div>
		`;

		// Send the message to chat
		ChatMessage.create({
			user: game.user.id,
			speaker: { alias: "Quick Alchemy" },
			content: content,
		});
		
	}

	// Function to equip an item by slug
	async function equipItemBySlug(slug,actor) {
		debugLog(`equipItemBySlug(${slug}, ${actor.name})`);
		
		if (!actor) {
			const actor = canvas.tokens.controlled[0]?.actor;
			if (!actor) {
				debugLog(3,LOCALIZED_TEXT.DEBUG_NO_ACTOR_SELECTED);
				return;
			}
		}

		const item = await actor.items.find((i) => i.slug === slug);
		if (!item) {
			debugLog(LOCALIZED_TEXT.DEBUG_ITEM_NOTFOUND);
			return;
		}

		await item.update({
			"system.equipped.carryType": "held",
			"system.equipped.handsHeld": "1",
		});

		ui.notifications.info(LOCALIZED_TEXT.NOTIF_ITEM_EQUIPPED(item.name));
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
				debugLog(LOCALIZED_TEXT.DEBUG_DELETING_NOQTY_ITEM(itemsToDelete.length));
		} else {
			debugLog(LOCALIZED_TEXT.DEBUG_NO_INFUSED_ITEM_ZERO_QTY);
		}
	}
	
	/* 	
		Function to craft "Healing Quick Vial" from the module compendium  
		and add "(*Temporary)" to the end of the name and custom flag
	*/
	async function craftHealingVial(selectedItem, selectedActor) {
		// Define the slug for the healing quick vial
		const healingSlug = "healing-quick-vial";
		const alchemyMode = getSetting("enableSizeBasedAlchemy", "disabled");
		
		// Get actor size to use for new item size
		const actorSize = await getActorSize(selectedActor);
		
		// Check if the item already exists in the actor's inventory
		const existingItem = selectedActor.items.find(item => 
			item.slug === healingSlug && 
			item.system.ductTaped === true
		);

		if (existingItem) {
			// Item exists, increase its quantity
			const newQuantity = existingItem.system.quantity + 1;
			await existingItem.update({ "system.quantity": newQuantity });
			debugLog(LOCALIZED_TEXT.DEBUG_INCREASE_ITEM_QTY(existingItem.name,newQuantity));
			sendConsumableUseMessage(existingItem.uuid);
			return;
		} else {	
		
			// Item does not exist, retrieve from compendium
			const compendium = game.packs.get("pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items");
			if (!compendium) {
				debugLog(3,LOCALIZED_TEXT.DEBUG_COMPENDIUM_NOTFOUND);
				return;
			}

			try {
				// Find the item in the compendium
				const compendiumIndex = await compendium.getIndex();
				const healingItemEntry = compendiumIndex.find(entry => entry.name === "Healing Quick Vial");
				if (!healingItemEntry) {
					debugLog(3, LOCALIZED_TEXT.DEBUG_HEALING_VIAL_NOTFOUND);
					return;
				}

				// Get the full item document from the compendium
				const healingItem = await compendium.getDocument(healingItemEntry._id);

				// Clone the item to make modifications
				const modifiedItem = healingItem.toObject();
				
				// Add custom module tags
				modifiedItem.system.ductTaped = true; 
				modifiedItem.system.publication.authors = "TheJoester";
				modifiedItem.system.publication.license = "ORC";
				modifiedItem.system.publication.title = "PF2e Alchemist Remaster Duct Tape"; 

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
						debugLog(LOCALIZED_TEXT.DEBUG_ACTOR_NOT_TINY);
					} else { 
						modifiedItem.system.size = actorSize; // Adjust size if necessary
					}
				}

				// Add the item to the actor's inventory
				const createdItem = await selectedActor.createEmbeddedDocuments("Item", [modifiedItem]);
				debugLog(`Crafted `, createdItem);
				const createdItemUuid = createdItem[0].uuid; //`Actor.${selectedActor.id}.Item.${createdItem[0].id}`;
				debugLog(`createdItemUuid: ${createdItemUuid}`);
				sendConsumableUseMessage(createdItemUuid);
			} catch (error) {
				debugLog(3, LOCALIZED_TEXT.DEBUG_ERR_FETCH_HEAL_VIAL_COMPENDIUM, error);
			}
		}
	}
	
	/* 	
		Function to craft Quick Vial using Quick Alchemy and add  
		"(*Temporary)" to the end of the name and custom tag to 
		any item created with this Quick Alchmy macro so that it 
		can be removed at the end of the turn and ensured that 
		when attacking it is using the same item.
	*/
	async function craftVial(selectedItem, selectedActor, selectedType = "acid", specialIngredient = "none") {
		debugLog(`${LOCALIZED_TEXT.DEBUG_SELECTED_VIAL}: ${selectedItem?.name || LOCALIZED_TEXT.DEBUG_NO_NAME}`); // Selected Vial: 
		debugLog(`${LOCALIZED_TEXT.DEBUG_SELECTED_ACTOR}: ${selectedActor?.name || LOCALIZED_TEXT.DEBUG_NO_NAME}`); // Selected acrtor: 
		
		if (!selectedItem || !selectedActor) {
			debugLog(3, LOCALIZED_TEXT.DEBUG_INVALID_ACTOR_ITEM);
			return;
		}
		let newItemSlug = "";
		
		const alchemyMode = getSetting("enableSizeBasedAlchemy","disabled");
		
		// Get actor size to use for new item size
		const actorSize = await getActorSize(selectedActor);
		
		// Check if the item exists in inventory, has an asterisk, and is infused
		const itemExists = selectedActor.items.find((item) => 
			item.system.ductTaped === true &&
			item.name.endsWith(`(${selectedType})(*Temporary)`) && 
			item.system.traits?.value?.includes("infused")
		);
		
		if (itemExists) { // Item exists increase quantity
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
					modifiedItem.system.damage.critDamageType = selectedType;
				} else {
					debugLog(LOCALIZED_TEXT.DEBUG_ITEM_NO_DMG_PROPERTY);
				}					
			}
			
			// Replace materials if selected
			if (specialIngredient !== "none"){
				modifiedItem.system.traits.value.push(specialIngredient);
				modifiedItem.system.material.grade = "standard";
				modifiedItem.system.material.type = specialIngredient;
			}
			
			// Add custom module tags
			modifiedItem.system.ductTaped = true; 
			modifiedItem.system.publication.authors = "TheJoester";
			modifiedItem.system.publication.license = "ORC";
			modifiedItem.system.publication.title = "PF2e Alchemist Remaster Duct Tape module";
			modifiedItem.system.publication.remaster = true;
			
			// Get slug for returning
			newItemSlug = modifiedItem.system.slug;
			
			// Append "(*Temporary)" to the name for visual identification
			if (!modifiedItem.name.endsWith(`(${selectedType})(*Temporary)`)) {
				modifiedItem.name = `Quick Vial (${selectedType})(*Temporary)`;
			}

			// If we are using size based quick alchemy, modify size
			if (alchemyMode !== "disabled") { 
				if (alchemyMode === "tinyOnly" && actorSize !== "tiny") { 
					debugLog(LOCALIZED_TEXT.DEBUG_ACTOR_NOT_TINY);
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
			debugLog(LOCALIZED_TEXT.DEBUG_CREATED_ITEM_QA, createdItem);
		}
		debugLog(`Returning ${newItemSlug}`);
		return newItemSlug; // return slug
	}
	
	/* 	
		Function to craft item using Quick Alchemy and add  
		"(*Temporary)" to the end of the name and a custom
		tag "ductTapped" to any item created with this 
		Quick Alchmy macro so that it can be removed at the 
		end of the turn and ensured that when attacking it is 
		using the same item.
	*/
	async function craftItem(selectedItem, selectedActor, count = 1) {
		debugLog(`${LOCALIZED_TEXT.DEBUG_SELECTED_ITEM}: ${selectedItem?.name || LOCALIZED_TEXT.DEBUG_NO_NAME}`);
		debugLog(`${LOCALIZED_TEXT.DEBUG_SELECTED_ACTOR}: ${selectedActor?.name || LOCALIZED_TEXT.DEBUG_NO_NAME}`);
		
		const alchemyMode = getSetting("enableSizeBasedAlchemy","disabled");
		
		if (!selectedItem || !selectedActor) {
			debugLog(3, LOCALIZED_TEXT.DEBUG_INVALID_ACTOR_ITEM);
			return;
		}

		// Get actor size to use for new item size
		const actorSize = await getActorSize(selectedActor);

		// Check if the item exists in inventory, has an asterisk, and is infused
		const itemExists = selectedActor.items.find((item) => 
			item.slug === selectedItem?.slug &&
			item.system.ductTaped === true &&
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
			// Add custom module tags
			modifiedItem.system.ductTaped = true; 
			modifiedItem.system.publication.authors = "TheJoester";
			modifiedItem.system.publication.license = "ORC";
			modifiedItem.system.publication.title = "PF2e Alchemist Remaster Duct Tape module";
			modifiedItem.system.publication.remaster = true;
			// Add Infused trait
			modifiedItem.system.traits.value.push("infused");
			// Append "(*Temporary)" to the name for visual identification
			if (!modifiedItem.name.endsWith("(*Temporary)")) {
				modifiedItem.name += " (*Temporary)";
			}

			// If we are using size based quick alchemy, modify size
			if (alchemyMode !== "disabled") { 
				if (alchemyMode === "tinyOnly" && actorSize !== "tiny") { 
					debugLog(LOCALIZED_TEXT.DEBUG_ACTOR_NOT_TINY);
				} else { 
					modifiedItem.system.size = actorSize; // Adjust size if necessary
				}
			}
			
			// Create the items for the actor
			const createdItem = await selectedActor.createEmbeddedDocuments("Item", [modifiedItem]);
			debugLog(LOCALIZED_TEXT.DEBUG_CREATED_ITEM_QA, createdItem);
		}
		return selectedItem?.slug;
	}
	
	/*
		Function to get count of versatile vials in actor's inventory
	*/
	export function getVersatileVialCount(actor) {
		// Verify valid actor passed
		if (!actor || !actor.items) {
			debugLog(3, LOCALIZED_TEXT.DEBUG_NO_VALID_ACTOR_GETVVC);
			return 0; // Return 0 instead of undefined for better consistency
		}

		// Get count of versatile-vial items
		const totalVialCount = actor.items
			.filter(item => item.slug === "versatile-vial")
			.reduce((count, vial) => count + (vial.system.quantity || 0), 0)
		;

		return totalVialCount;
	}
	
	/*
		Function to consume a versatile vial when crafting with quick alchemy
	*/
	async function consumeVersatileVial(actor, slug, count = 1){
		if (!actor) {
			debugLog(3,LOCALIZED_TEXT.DEBUG_ACTOR_NOTFOUND);
			return false;
		}
		
		// If we are crafting a veratile vial, Quick Vial, or Healing Vial do not consume, return true
	if (slug.startsWith("versatile-vial") || slug.startsWith("quick-vial") || slug.startsWith("healing-quick-vial")){
			debugLog(LOCALIZED_TEXT.DEBUG_CRAFT_ITEM_NO_VIAL(slug));
			return true;
		}
		
		// Find versatile-vial in inventory
		const regularVial = actor.items.find(item => item.slug === "versatile-vial");

		// Consume versatile vial
		if (regularVial && regularVial.system.quantity >= count) {
			await regularVial.update({ "system.quantity": regularVial.system.quantity - count });
			debugLog(`${LOCALIZED_TEXT.DEBUG_CONSUMED_NUM_VV(count)} ${regularVial.name}`);
			return true;
		}

		// No vial available to consume
		debugLog(LOCALIZED_TEXT.NOTIF_NO_VIAL_CONSUME);
		ui.notifications.warn(LOCALIZED_TEXT.NOTIF_NO_VIAL_CONSUME);
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
			debugLog(`${LOCALIZED_TEXT.DEBUG_NO_FORMULA_FOUND_TYPE} ${type || 'all'}`);
			return;
		}

		// Prepare progress bar dialog
		let progress = 0;
		const total = formulas.length;

		const progressDialog = new foundry.applications.api.DialogV2({
			window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY },
			content: `
				<div>
					<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_PROCESSING_MSG(formulaCount)}</p>
					<progress id="progress-bar" value="0" max="${total}" style="width: 100%;"></progress>
				</div>
			`,
			buttons: [
				{
					action: "noop",
					label: LOCALIZED_TEXT.OK,
					icon: "",
					callback: () => {},
					disabled: true
				}
			],
			close: () => {}
		});
		progressDialog.render(true);

		// Arrays to store entry objects
		const weaponEntries = [];
		const consumableEntries = [];

		// Gather entries in respective arrays
		let listProcessedFormulas = "";
		for (let [index, formula] of formulas.entries()) {
			const entry = await fromUuid(formula.uuid);

			// Update progress
			progress++;
			const progressBar = document.getElementById("progress-bar");
			if (progressBar) progressBar.value = progress;

			// Check if entry is null
			if (entry != null) {
				listProcessedFormulas = `${listProcessedFormulas} slug: ${entry.slug} | uuid: ${entry.uuid} |`;

				if (entry.slug === "versatile-vial") {
					// do nothing 
					listProcessedFormulas = `${listProcessedFormulas} | skipping`;
				} else if (entry.type === "weapon") {
					weaponEntries.push(entry);
					listProcessedFormulas = `${listProcessedFormulas} added to weaponEntries`;
				} else if (entry.type === "consumable") {
					consumableEntries.push(entry);
					listProcessedFormulas = `${listProcessedFormulas} added to consumableEntries`;
				} else {
					//otherEntries.push(entry);
					listProcessedFormulas = `${listProcessedFormulas} ignoring.`;
				}
			} else { // entry is null
				listProcessedFormulas = `${listProcessedFormulas} entry ${formula.uuid} is null`;
			}
			listProcessedFormulas = `${listProcessedFormulas}\n`;
		}
		debugLog(`Processed Formulas:\n${listProcessedFormulas}`);

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
		};

		sortEntries(weaponEntries);
		sortEntries(consumableEntries);

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
		if (!type) {
			debugLog(3, LOCALIZED_TEXT.DEBUG_NO_TYPE_PASSED);
			return { filteredEntries: [] };
		}
		debugLog(`${LOCALIZED_TEXT.DEBUG_FILTERING_BY_TYPE}: ${type}`);

		// Get known formulas
		const formulas = actor?.system.crafting?.formulas || [];
		const formulaCount = formulas.length;

		if (!formulas.length) {
			debugLog(`${LOCALIZED_TEXT.DEBUG_NO_FORMULA_ACTOR}: ${actor.name}`);
			return { filteredEntries: [] };
		}

		// Prepare progress bar dialog
		let progress = 0;
		const total = formulas.length;

		const progressDialog = new foundry.applications.api.DialogV2({
			window: { title: "Quick Alchemy" },
			content: `
				<div>
					<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_PROCESSING_MSG(formulaCount)}</p>
					<progress id="progress-bar" value="0" max="${total}" style="width: 100%;"></progress>
				</div>
			`,
			buttons: [
				{
					action: "noop",
					label: LOCALIZED_TEXT.OK,
					icon: "",
					callback: () => {},
					disabled: true
				}
			],
			close: () => {}
		});
		progressDialog.render(true);

		// Arrays to store entry objects
		const filteredEntries = [];

		// Gather entries in respective arrays
		let listProcessedFormulas = "";
		for (let [index, formula] of formulas.entries()) {
			const entry = await fromUuid(formula.uuid);

			// Update progress
			progress++;
			const progressBar = document.getElementById("progress-bar");
			if (progressBar) progressBar.value = progress;

			// Check if entry is null
			if (entry != null) {
				listProcessedFormulas = `${listProcessedFormulas} slug: ${entry.slug} | uuid: ${entry.uuid} | `;
				if (entry.slug === "versatile-vial") {
					// do nothing
					listProcessedFormulas = `${listProcessedFormulas} skipping`;
				} else if (entry.type === type) {
					filteredEntries.push(entry);
					listProcessedFormulas = `${listProcessedFormulas} added to filteredEntries`;
				}
			} else { // entry is null
				listProcessedFormulas = `${listProcessedFormulas} entry ${formula.uuid} is null`;
			}
			listProcessedFormulas = `${listProcessedFormulas}\n`;
		}
		debugLog(`Processed Formulas:\n${listProcessedFormulas}`);

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
	async function handleCrafting(uuid, actor, quickVial = false, doubleBrew = false, attack = false, selectedType = "acid", specialIngredient ="none"){
	debugLog(`handleCrafting(${uuid}, ${actor.name}, ${quickVial}, ${doubleBrew}, ${attack}, ${selectedType}, ${specialIngredient}) called.`);
		// Make sure uuid was passed
		if (uuid === "none") {
			debugLog(LOCALIZED_TEXT.DEBUG_NO_ITEM_SELECTED_CRAFTING);
			return;
		}
		
		/*
			Helper function to insert slight delay to avoid
			'This action no longer exists!' error. 
		*/
		async function delayedRollActionMacro(actor, initialItem, maxAttempts = 5, delay = 200) {
			let attempts = 0;

			while (attempts < maxAttempts) {
				const item = actor.items.get(initialItem?.id);
				if (item) {
					debugLog(`Item found on attempt ${attempts + 1}. Rolling strike.`);
					game.pf2e.rollActionMacro({
						actor: actor,
						type: "strike",
						item: item,
						itemId: item.id,
						slug: item.slug,
					});
					return;
				}

				attempts++;
				debugLog(`Attempt ${attempts}: Item not found, retrying in ${delay}ms...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}

			debugLog(`Failed to find item after ${maxAttempts} attempts.`);
		}
		
		// Get Selected Item Object from uuid
		const selectedItem = await fromUuid(uuid);
		if (!selectedItem) return;
		// Check if crafting Quick Vial
		let newItemSlug = "";
		if (quickVial) {
			newItemSlug = await craftVial(selectedItem, actor, selectedType, specialIngredient);
		} else {
			newItemSlug = await craftItem(selectedItem, actor, selectedType);
		}
		debugLog(`newItemSlug: ${newItemSlug}`);
		
		const temporaryItem = actor.items.find(item =>
			item.slug === newItemSlug &&
			item.name.endsWith("(*Temporary)")
		);
		
		if (!temporaryItem) {
			debugLog(LOCALIZED_TEXT.DEBUG_FAILED_FIND_TEMP_ITEM);
			return;
		}

		const vialConsumed = await consumeVersatileVial(actor, temporaryItem.slug, 1);
		if (!vialConsumed) {
			debugLog(LOCALIZED_TEXT.NOTIF_NO_VIAL_AVAIL);
			ui.notifications.error(LOCALIZED_TEXT.NOTIF_NO_VIAL_AVAIL);
			return;
		}
		debugLog(`equipItemBySlug(${temporaryItem.slug}, ${actor.name})`);
		const newUuid = await equipItemBySlug(temporaryItem.slug, actor);
		if (!newUuid) {
			debugLog(3, `${LOCALIZED_TEXT.NOTIF_FAILED_EQUIP_ITEM} slug: ${temporaryItem.slug}`);
			ui.notifications.error(LOCALIZED_TEXT.NOTIF_FAILED_EQUIP_ITEM);
			return;
		}
		
		const sendMsg = async (itemType, uuid, actor) => {
			debugLog(`sendMsg => itemType: ${itemType} | newUuid: ${newUuid} | actor: ${actor.name}`);
			
			// Do not send if setting is disabled
			const msgSetting = getSetting("sendAtkToChat");
			if (!msgSetting) return;
			
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
					debugLog(LOCALIZED_TEXT.DEBUG_UNKNOWN_ITEM_TYPE);
			}
		}
		
		const formattedUuid = `Actor.${actor.id}.Item.${newUuid}`;
		debugLog(`formattedUuid: ${formattedUuid}`);
		
		// Determine behavior based on parameters
		if (doubleBrew) {
			// Send message to chat based on item type
			debugLog(`${LOCALIZED_TEXT.DEBUG_DB_ENABLED_SEND_CHAT} | newUuid: ${formattedUuid} | actor: `, actor);
			await sendMsg(temporaryItem.type, formattedUuid, actor);
		} else if (attack) {
			if (getSetting("sendAtkToChat")) await sendMsg(temporaryItem.type, formattedUuid, actor);
			debugLog(`temporaryItem.id: ${temporaryItem.id} | temporaryItem.slug: ${temporaryItem.slug}`);
			await delayedRollActionMacro(actor, temporaryItem);
		} else {
			// Send message to chat based on item type
			await sendMsg(temporaryItem.type, formattedUuid, actor);
		}
	};

	/*
		Function to process craft button
	*/
	async function craftButton(actor, itemUuid, dbItemUuid, itemType, selectedType = "acid", specialIngredient = "none"){
		const selectedUuid = itemUuid;
		const dbSelectedUuid = dbItemUuid;
		debugLog(`craftButton() - Item Selection: ${selectedUuid}`);
		debugLog(`craftButton() - itemType: ${itemType} | selectedType: ${selectedType} | specialIngredient: ${specialIngredient}`);
		debugLog(`craftButton() - Double Brew Selection: ${dbSelectedUuid}`);
		
		// Check if we are making Quick Vial
		if (itemType === 'vial'){
			debugLog(`handleCrafting=> uuid: ${selectedUuid} | itemTye: ${itemType} | actor: ${actor.name} | selectedType: ${selectedType}`);
			await handleCrafting(selectedUuid, actor, true, false, false, selectedType, specialIngredient);
			debugLog(`Double Brew: handleCrafting=> uuid: ${dbSelectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
			if (dbSelectedUuid == selectedUuid) { // We are creating another Quick Vial
				await handleCrafting(dbSelectedUuid, actor, true, true, false, selectedType, specialIngredient);
			} else {
				await handleCrafting(dbSelectedUuid, actor, false, true, false, selectedType);
			}
		} else {
			debugLog(`handleCrafting=> uuid: ${selectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
			await handleCrafting(selectedUuid, actor, false, false, false, selectedType);
			debugLog(`handleCrafting=> uuid: ${dbSelectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
			await handleCrafting(dbSelectedUuid, actor, false, true, false, selectedType);
		}
	}

	/*
		Function to process craft and attack button
	*/
	async function craftAttackButton(actor, itemUuid, dbItemUuid, itemType, selectedType = "acid", specialIngredient ="none"){
		const selectedUuid = itemUuid; 
		const dbSelectedUuid = dbItemUuid;
		debugLog(`craftAttackButton() - Item Selection: ${selectedUuid}`);
		debugLog(`craftAttackButton() - itemType: ${itemType} | selectedType: ${selectedType} | specialIngredient: ${specialIngredient}`);
		debugLog(`craftAttackButton() - Double Brew Selection: ${dbSelectedUuid}`);
		
		// Check if we are making Quick Vial
		if (itemType === 'vial'){
			debugLog(`handleCrafting=> uuid: ${selectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
			await handleCrafting(selectedUuid, actor, true, false, true, selectedType, specialIngredient);
			debugLog(`Double Brew: handleCrafting=> uuid: ${dbSelectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
			if (dbSelectedUuid == selectedUuid) { // We are creating another Quick Vial
				await handleCrafting(dbSelectedUuid, actor, true, true, false, selectedType, specialIngredient);
			} else {
				await handleCrafting(dbSelectedUuid, actor, false, true, false, selectedType, specialIngredient);
			}
		} else {
			debugLog(`handleCrafting=> uuid: ${selectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
			await handleCrafting(selectedUuid, actor, false, false, true, selectedType, specialIngredient);
			debugLog(`handleCrafting=> uuid: ${dbSelectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
			await handleCrafting(dbSelectedUuid, actor, false, true, false, selectedType, specialIngredient);
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
		let consumeVialButtons = {};
		let newItemSlug = "";
		let selectedType = "acid"; // default to acid
		let specialIngredient = "none";
		// Get uuid of vial dependant on if actor is toxicologist
		let uuid = hasFeat(actor, "toxicologist") ? poisonVialId || acidVialId : acidVialId;
		
		// Check type of item 
		if (itemType === 'vial') {
			
			// Make Sure target is selected
			const target = game.user.targets.size > 0 ? [...game.user.targets][0] : null;
			if (!target) {
				ui.notifications.error(LOCALIZED_TEXT.NOTIF_PLEASE_TARGET);
				qaDialog(actor);
				return;
			}
			
			// Make sure module compendium is available 
			const compendium = game.packs.get("pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items");
			if (!compendium) {
				debugLog(3,LOCALIZED_TEXT.DEBUG_COMPENDIUM_NOTFOUND);
				return;
			}
			
			// Get vial item from uuid of Quick Vial item from module compendium
			const item = await fromUuid(uuid);
			if (!item) {
				debugLog(3, `${LOCALIZED_TEXT.DEBUG_NO_QV_ITEM_FOUND} ${uuid}`);
				return;
			}
			debugLog(`actor: ${actor.name} |itemType: ${itemType} | uuid: ${uuid} | item name: ${item.name}`);
			
			/*
				Helper function to determine damage type based on target 
				resistances, immunities, and weaknesses
			*/
			async function getBestDamageType(target) {
				// Ensure the target and syntheticActor exist
				if (!target?.document?.delta?.syntheticActor?.system?.attributes) {
					debugLog(LOCALIZED_TEXT.DEBUG_TARGET_ATTRIB_NOT_FOUND);
					return "poison"; // Default to poison
				}

				// Extract the syntheticActor and its attributes
				const attributes = target.document.delta.syntheticActor.system.attributes;

				// Helper function to get the value from arrays of resistances and weaknesses
				const getValue = (arr, type) => arr.find(entry => entry.type === type)?.value || 0;

				// Calculate damage type effectiveness
				const poisonModifier = getValue(attributes.weaknesses || [], "poison") - getValue(attributes.resistances || [], "poison");
				const acidModifier = getValue(attributes.weaknesses || [], "acid") - getValue(attributes.resistances || [], "acid");
				let bestDamageType = "poison"; // Default to poison

				// Check immunities
				const immunities = attributes.immunities || [];
				if (immunities.some(imm => imm.type === "poison")) {
					bestDamageType = "acid";
					if (game.user.isGM) debugLog(LOCALIZED_TEXT.DEBUG_TARGET_IMMUNE_POISON);
				} else if (immunities.some(imm => imm.type === "acid")) {
					bestDamageType = "poison";
					if (game.user.isGM) debugLog(LOCALIZED_TEXT.DEBUG_TARGET_IMMUNE_ACID);
				} else if (acidModifier > poisonModifier) {
					bestDamageType = "acid";
					if (game.user.isGM) debugLog(`${LOCALIZED_TEXT.DEBUG_ACID_MORE_EFFECTIVE} : ${LOCALIZED_TEXT.DEBUG_POISON_MODIFIER} = ${poisonModifier}, ${LOCALIZED_TEXT.DEBUG_ACID_MODIFIER} = ${acidModifier}`);
				} else {
					bestDamageType = "poison";
				if (game.user.isGM) debugLog(`${LOCALIZED_TEXT.DEBUG_POISON_MORE_EFFECTIVE}: ${LOCALIZED_TEXT.DEBUG_POISON_MODIFIER} = ${poisonModifier}, ${LOCALIZED_TEXT.DEBUG_ACID_MODIFIER} = ${acidModifier}`);
				}
				debugLog(`${LOCALIZED_TEXT.DEBUG_BEST_DMG_TYPE}: ${bestDamageType}`);
				return bestDamageType;
			}
			
			// If actor has chirurgeon feat
			if (hasFeat(actor, "chirurgeon")) {
				const userConfirmed = await foundry.applications.api.DialogV2.confirm({
						content: `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_CRAFT_HEALING_VIAL}</p>`,
						window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_CHIRURGEON },
						rejectClose: false,
						modal: true
					});

					if (userConfirmed) {
						newItemSlug = await craftHealingVial(item, actor);
					return;
				}
			}
			
			//	Check if actor has bomber Feat		
			if (hasFeat(actor, "bomber")) {
				debugLog(`feat 'bomber' detected.`);

				// Prompt for damage type
				selectedType = await foundry.applications.api.DialogV2.prompt({
					window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_FIELD_VIAL_BOMBER },
					content: `
						<form>
							<div class="form-group" style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;">
								<label for="damage-type">${LOCALIZED_TEXT.DMG_TYPE}:</label>
								<select id="damage-type" name="damage-type">
									<option value="acid">${LOCALIZED_TEXT.ACID}</option>
									<option value="cold">${LOCALIZED_TEXT.COLD}</option>
									<option value="electricity">${LOCALIZED_TEXT.ELECTRICITY}</option>
									<option value="fire">${LOCALIZED_TEXT.FIRE}</option>
								</select>
							</div>
						</form>
					`,
					ok: {
						label: LOCALIZED_TEXT.OK,
						callback: (event, button, dialog) => button.form.elements["damage-type"].value
					}
				});

				// Prompt for special ingredient
				if (hasFeat(actor, "advanced-vials-bomber")) {
					debugLog(`feat 'advanced-vials-bomber' detected.`);
					specialIngredient = await foundry.applications.api.DialogV2.prompt({
						window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_ADV_VIAL_BOMBER },
						content: `
							<form>
								<div class="form-group" style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;">
									<label for="special-ingredient">${LOCALIZED_TEXT.SPECIAL_INGREDIENT}:</label>
									<select id="special-ingredient" name="special-ingredient">
										<option value="none">${LOCALIZED_TEXT.NONE}</option>
										<option value="adamantine">${LOCALIZED_TEXT.ADAMANTINE}</option>
										<option value="cold-iron">${LOCALIZED_TEXT.COLD_IRON}</option>
										<option value="dawnsilver">${LOCALIZED_TEXT.DAWNSILVER}</option>
									</select>
								</div>
							</form>
						`,
						ok: {
							label: LOCALIZED_TEXT.ADD,
							callback: (event, button, dialog) => button.form.elements["special-ingredient"].value
						}
					});
				}
			}
	
			// Check if the actor has the Toxicologist feat
			if (hasFeat(actor, "toxicologist")) {
				selectedType = "poison"; // change default to poison
				debugLog(LOCALIZED_TEXT.DEBUG_TOXICOLOGIST_FEAT_DETECTED(selectedType));
				
				/*
					Helper Function to create injury poison
				*/
				async function craftInjuryPoison(actor, selectedType) {
					
					// Get list of weapons and ammunition, exclude bombs or vials
					const weapons = actor.items.filter(i => 
						(i.type === "weapon") &&
						!["bomb", "vial"].includes(i.system.category) &&
						// !i.system.traits?.value?.includes("alchemical") &&
						["piercing", "slashing"].includes(i.system.damage?.damageType)
					);

					if (weapons.length === 0) {
						debugLog(LOCALIZED_TEXT.DEBUG_NO_VALID_WEAPON_POISON);
						return;
					}
					
					// Let the player select a weapon
					const selectedWeapon = await new Promise((resolve) => {
						new foundry.applications.api.DialogV2({
							window: { title: LOCALIZED_TEXT.INJURY_POISON },
							content: `
								<form>
									<div class="form-group">
										<label for="weapon">${LOCALIZED_TEXT.SELECT_WEAPON}:</label>
										<select id="weapon" name="weapon">
											${weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("")}
										</select>
									</div>
									<br>
								</form>
							`,
							buttons: [
								{
									action: "attack",
									label: LOCALIZED_TEXT.CRAFT_APPLY_ATTACK,
									icon: `systems/pf2e/icons/actions/ThreeActions.webp`,
									callback: (event, button, dialog) => {
										const id = button.form.elements.weapon.value;
										resolve(weapons.find(w => w.id === id));
									}
								},
								{
									action: "back",
									label: LOCALIZED_TEXT.BACK,
									icon: "fas fa-arrow-left",
									callback: () => {
										displayCraftingDialog(actor, itemType);
										resolve(null);
									}
								}
							],
							default: "attack"
						}).render(true);
					});


					if (!selectedWeapon) {
						debugLog(LOCALIZED_TEXT.DEBUG_NO_WPN_SELECTED_POISON);
						return;
					}
					
					// Get Player level to determin stats
					const playerLevel = actor.level || 1; 
					// Calculate initial damage dice (how many dice)
					const initialDamageDice = playerLevel >= 18 ? 4 : playerLevel >= 12 ? 3 : playerLevel >= 4 ? 2 : 1;
					// Calculate persistent damage based on actor level
					const persistentDamage = playerLevel >= 18 ? 4 : playerLevel >= 12 ? 3 : playerLevel >= 4 ? 2 : 1;

					// Create a temporary copy of the weapon with poison damage added
					const tempWeapon = duplicate(selectedWeapon);
					tempWeapon.name = `${selectedWeapon.name} (*Poisoned)`;

					// Check for feat advanced-vials-toxicologist to add persistent damage
					if (hasFeat(actor, "advanced-vials-toxicologist")) {
						// Append poison and persistent damages
						tempWeapon.system.damage.persistent = {
							type: selectedType,
							number: persistentDamage,
						};
					}
					
					// Add Poison Damage
					tempWeapon.system.property1 = {
						value: "Quick Vial Poison",
						damageType: selectedType, 
						dice: initialDamageDice,
						die: "d6",
						critDamageType: selectedType,
						critDice: initialDamageDice * 2,
						critDie: "d6",
					};
										
					tempWeapon.system.reload = {
						consume: true,
					};
										
					// Mark the temporary weapon as temporary
					tempWeapon.flags = tempWeapon.flags || {};
					tempWeapon.flags.pf2e = tempWeapon.flags.pf2e || {};
					tempWeapon.flags.pf2e.temporary = true;
					tempWeapon.flags.pf2e.sourceWeapon = selectedWeapon.id;
					
					// Add custom module tags
					tempWeapon.system.ductTaped = true; 
					tempWeapon.system.publication.authors = "TheJoester";
					tempWeapon.system.publication.license = "ORC";
					tempWeapon.system.publication.title = "PF2e Alchemist Remaster Duct Tape module";
					tempWeapon.system.publication.remaster = true;
					
					tempWeapon.system.traits?.value.push("infused", "poison", "injury");
					tempWeapon.system.traits.value = tempWeapon.system.traits.value.filter(trait => trait !== "acid");
					
					// Add the temporary weapon to the actor
					const createdWeapon = await actor.createEmbeddedDocuments("Item", [tempWeapon]);
					
					if (createdWeapon.length > 0) {
						debugLog(`${LOCALIZED_TEXT.DEBUG_CREATED_TEMP_POISONED_WPN}: ${createdWeapon[0].name}`);
						try {
							// Call the rollActionMacro method for the temporary weapon
							game.pf2e.rollActionMacro({
								actorUUID: `Actor.${actor.id}`,
								type: "strike",
								itemId: createdWeapon[0].id,
								item: createdWeapon[0],
								slug: tempWeapon.system.slug,
							});
						} catch (err) {
							debugLog(3,LOCALIZED_TEXT.DEBUG_ERR_ATK_TEMP_WPN, err);
							ui.notifications.error(LOCALIZED_TEXT.NOTIF_FAIL_ATK_TEMP_POISONED_WPN);
						}
					} else {
						debugLog(LOCALIZED_TEXT.DEBUG_FAIL_TEMP_POISONED_WPN);
					}
					
				}
				
				// Prompt for injury poison or Quick Vial bomb
				const isInjuryPoison = await new Promise((resolve) => {
					new foundry.applications.api.DialogV2({
						window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_TOXICOLOGIST_OPTIONS },
						content: `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_APPLY_INJURY_POISON}</p>`,
						buttons: [
							{
								action: "yes",
								label: LOCALIZED_TEXT.INJURY_POISON,
								callback: () => resolve(true)
							},
							{
								action: "no",
								label: LOCALIZED_TEXT.QUICK_VIAL_BOMB,
								callback: () => resolve(false)
							},
							{
								action: "back",
								label: LOCALIZED_TEXT.BACK,
								icon: "fas fa-arrow-left",
								callback: () => {
									qaDialog(actor);
									resolve(null);
								}
							}
						],
						default: "no"
					}).render(true);
				});
				
				// See if we are changing damage type 
				selectedType = await getBestDamageType(target); // Default to poison
				uuid = selectedType === "poison" ? poisonVialId : selectedType === "acid" ? acidVialId : poisonVialId;

				debugLog(`selectedType: ${selectedType} | uuid: ${uuid}`);
				
				if (isInjuryPoison) {
					debugLog(LOCALIZED_TEXT.DEBUG_CREATE_INJURY_POISON);
					
					// Check for Advanced Vials feat
					const hasAdvancedVials = hasFeat(actor, "advanced-vials-toxicologist");
					debugLog(LOCALIZED_TEXT.DEBUG_ADV_VIAL_FEAT);
					 
					craftInjuryPoison(actor, selectedType);
					return;
				} 
			}
			
			// Check if actor has mutagenist feat
			if (hasFeat(actor, "advanced-vials-mutagenist")) {
				debugLog(LOCALIZED_TEXT.DEBUG_ADV_VIAL_MUT_FEAT);
				async function applyEffectFromCompendium(actor) {
					// Define the exact effect UUID
					const effectUUID = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.0Zpa9OfNcTUlNc2t";

					// Get the effect document from the compendium
					const effect = await fromUuid(effectUUID);

					if (!effect) {
						debugLog(3, LOCALIZED_TEXT.DEBUG_FAIL_EFFECT_COMPENDIUM);
						return;
					}

					// Apply the effect to the actor
					const newEffect = duplicate(effect.toObject());
					await actor.createEmbeddedDocuments("Item", [newEffect]);

					debugLog(`Applied effect "${newEffect.name}" to ${actor.name}`);
					ui.notifications.info(LOCALIZED_TEXT.NOTIF_APPLY_EFFECT_ACTOR(newEffect.name,actor.name));
				}

				// Setup dialog
				let promptConsumeVial = await new Promise((resolve) => {
					const buttons = [
						{
							action: "qv",
							label: LOCALIZED_TEXT.QUICK_VIAL,
							icon: "pf2-icon D",
							callback: async () => {
								await applyEffectFromCompendium(actor);
								resolve("qv");
							}
						}
					];

					if (getVersatileVialCount(actor) >= 1) {
						buttons.push({
							action: "vv",
							label: LOCALIZED_TEXT.VERSATILE_VIAL,
							icon: "pf2-icon A",
							callback: async () => {
								let selectedSlug = "none";
								await consumeVersatileVial(actor, selectedSlug);
								await applyEffectFromCompendium(actor);
								resolve("vv");
							}
						});
					}

					buttons.push({
						action: "no",
						label: LOCALIZED_TEXT.BTN_NO,
						icon: "fas fa-times",
						callback: () => resolve(null)
					});

					new foundry.applications.api.DialogV2({
						window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_MUTAGENIST_OPTIONS },
						content: `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_CONSUME_VIAL}</p>`,
						buttons,
						default: "qv"
					}).render(true);
				});

				
			}
			
			debugLog(`uuid: ${uuid}`);
			// Build HTML Content
			let content = `<form>
				<div>
					<select id="item-selection" name="item-selection" style="display: none;">
						<option value="${uuid}">Quick Vial</option>
					</select>
				</div>`;

			if (doubleBrewFeat) {
				const vialCount = getVersatileVialCount(actor);
				if (vialCount >= 2) {
					const { weaponOptions, consumableOptions } = await processFormulasWithProgress(actor);
					content += `
							<h3>${LOCALIZED_TEXT.DOUBLE_BREW_FEAT}</h3>
							<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_QV_DB_PROMPT}</p>
							<div>
								<label for="db-item-selection">${LOCALIZED_TEXT.QUICK_ALCHEMY_CHOOSE_ITEM}:</label>
								<select id="db-item-selection" name="db-item-selection">
									<option value="none">${LOCALIZED_TEXT.NONE}</option>
									<option value="${uuid}">${LOCALIZED_TEXT.QUICK_VIAL}</option>
									${weaponOptions}
									${consumableOptions}
								</select>
							</div>
						<br/>`;
				}
			}
			
			content += `</form>`;

			const buttons = [
				{
					action: "craftAttack",
					label: "Craft and Attack",
					icon: "fas fa-bomb",
					callback: async (event, button, dialog) => {
						if (!actor) {
							debugLog(LOCALIZED_TEXT.DEBUG_ACTOR_NOTFOUND);
							return;
						}

						const target = game.user.targets.size > 0 ? [...game.user.targets][0] : null;
						if (!target) {
							ui.notifications.error(LOCALIZED_TEXT.NOTIF_PLEASE_TARGET);
							displayCraftingDialog(actor, 'vial');
							return;
						}

						if (hasFeat(actor, "toxicologist")) selectedType = await getBestDamageType(target);

						selectedUuid = button.form.elements["item-selection"]?.value || "none";
						dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";

						debugLog(`selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
						craftAttackButton(actor, selectedUuid, dbSelectedUuid, itemType, selectedType, specialIngredient);
					}
				},
				{
					action: "craft",
					label: "Craft",
					icon: "fas fa-hammer",
					callback: async (event, button, dialog) => {
						if (!actor) {
							debugLog(LOCALIZED_TEXT.DEBUG_ACTOR_NOTFOUND);
							return;
						}

						selectedUuid = button.form.elements["item-selection"]?.value || "none";
						dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";

						debugLog(`selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
						craftButton(actor, selectedUuid, dbSelectedUuid, itemType, selectedType, specialIngredient);
					}
				},
				{
					action: "back",
					label: LOCALIZED_TEXT.BACK,
					icon: "fas fa-arrow-left",
					callback: () => qaDialog(actor)
				}
			];

			new foundry.applications.api.DialogV2({
				window: {
					title: "Quick Alchemy",
					width: 450
				},
				content,
				buttons,
				default: "craftvial",
				render: (html) => {
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
			}).render(true);

		/*
			We are crafting Weapon or Consumable
		*/
		} else if(itemType == "healing-bomb") {
			debugLog("Wants to make ahealing bomb");
		} else { 
				
			let options = "";
			// Get list of filtered entries
			const { filteredEntries } = await processFilteredFormulasWithProgress(actor, itemType);
			options = filteredEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");

			// Build main content with initial item selection
			let content = `
				<form>
					<div>
						<h3>${LOCALIZED_TEXT.QUICK_ALCHEMY_SELECT_ITEM_TYPE(itemType)}:</h3>
						<select id="item-selection" name="item-selection" style="display: inline-block;margin-top: 5px; overflow-y: auto;">${options}</select>
						<br/><br/>
					</div>
			`;

			// If actor has double brew feat
			if (doubleBrewFeat) {
				// Check that actor has versatile vials
				const vialCount = getVersatileVialCount(actor);
				if (vialCount > 1) { // Make sure we have enough versatile vials
					const { weaponOptions, consumableOptions } = await processFormulasWithProgress(actor);
					content += `
						<form>
							<h3>${LOCALIZED_TEXT.DOUBLE_BREW_FEAT}</h3>
							<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_DB_PROMPT}</p>
							<div>
								<label for="db-item-selection">${LOCALIZED_TEXT.QUICK_ALCHEMY_CHOOSE_ITEM}:</label>
								<select id="db-item-selection" name="db-item-selection">
									<option value="none">${LOCALIZED_TEXT.NONE}</option>
									${weaponOptions}
									${consumableOptions}
								</select>
							</div>
						<br/>
					`;
				} else { // we will only prompt to make another vial
					if (!isArchetype) { // do not show for Archetype
						content += `
							<form>
								<div>
									<h3>${LOCALIZED_TEXT.DOUBLE_BREW_FEAT}</h3>
									<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_DB_CRAFT_VV(vialCount)}</p>
									<label for="db-item-selection">${LOCALIZED_TEXT.DOUBLE_BREW}:</label>
									<select id="db-item-selection" name="db-item-selection">
										<option value="none">${LOCALIZED_TEXT.NONE}</option>
										<option value="Compendium.pf2e.equipment-srd.Item.ljT5pe8D7rudJqus">Versatile Vial</option>
									</select>
								</div>
							</form><br/>
						`;
					}
				}
			}
			content += `</form>`;
			const buttons = [];

			// Weapon Buttons
			if (itemType === 'weapon') {
				buttons.push({
					action: "craftAttack",
					label: LOCALIZED_TEXT.CRAFT_ATTACK,
					icon: "fas fa-bomb",
					callback: async (event, button, dialog) => {
						if (!actor) {
							debugLog(LOCALIZED_TEXT.DEBUG_ACTOR_NOTFOUND);
							return;
						}

						// Ensure user has target
						const target = game.user.targets.size > 0 ? [...game.user.targets][0] : null;
						if (!target) {
							ui.notifications.error(LOCALIZED_TEXT.NOTIF_PLEASE_TARGET);
							displayCraftingDialog(actor, 'weapon');
							return;
						}

						selectedUuid = button.form.elements["item-selection"]?.value || "none";
						dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";

						debugLog(`selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);

						craftAttackButton(actor, selectedUuid, dbSelectedUuid, itemType);
					}
				});
			}

			// Shared Craft Button
			buttons.push({
				action: "craft",
				label: LOCALIZED_TEXT.CRAFT,
				icon: "fas fa-hammer",
				callback: async (event, button, dialog) => {
					if (!actor) {
						ui.notifications.error(LOCALIZED_TEXT.DEBUG_ACTOR_NOTFOUND);
						return;
					}

					// Perform actions with the actor
					selectedUuid = button.form.elements["item-selection"]?.value || "none";
					dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";

					debugLog(`selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
					craftButton(actor, selectedUuid, dbSelectedUuid, itemType);
				}
			});

			// Back button
			buttons.push({
				action: "back",
				label: LOCALIZED_TEXT.BACK,
				icon: "fas fa-arrow-left",
				callback: () => qaDialog(actor)
			});

			// Show dialog
			new foundry.applications.api.DialogV2({
				window: {
					title: "Quick Alchemy",
					width: 450
				},
				content,
				buttons,
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
			}).render(true);
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
		debugLog(`${LOCALIZED_TEXT.DEBUG_VV_COUNT} ${actor.name}: ${vialCount}`);

		let content = "";
		const buttons = [];

		if (vialCount < 1) {
			content = `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_VV}</p>`;
			if (!isArchetype) content += `${LOCALIZED_TEXT.QUICK_ALCHEMY_10_MIN}<br/><br/>`;

			buttons.push({
				action: "ok",
				label: LOCALIZED_TEXT.OK,
				icon: "fas fa-check",
				callback: () => {} // just closes
			}, {
				action: "vial",
				label: LOCALIZED_TEXT.QUICK_VIAL,
				icon: "fas fa-vial",
				callback: () => displayCraftingDialog(actor, 'vial')
			}, {
				action: "healing-bomb",
				label: LOCALIZED_TEXT.HEALING_BOMB,
				icon: "fas fa-hospital",
				callback: () => displayCraftingDialog(actor, 'healing-bomb')
			});

		} else {
			content = `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_PROMPT_TYPE}</p>`;

			buttons.push({
				action: "weapon",
				label: LOCALIZED_TEXT.WEAPON,
				icon: "fas fa-bomb",
				callback: () => displayCraftingDialog(actor, 'weapon')
			}, {
				action: "consumable",
				label: LOCALIZED_TEXT.CONSUMABLE,
				icon: "fas fa-flask",
				callback: () => displayCraftingDialog(actor, 'consumable')
			}, {
				action: "vial",
				label: LOCALIZED_TEXT.QUICK_VIAL,
				icon: "fas fa-vial",
				callback: () => displayCraftingDialog(actor, 'vial')
			}, {
				action: "healing-bomb",
				label: LOCALIZED_TEXT.HEALING_BOMB,
				icon: "fas fa-hospital",
				callback: () => displayCraftingDialog(actor, 'healing-bomb')
			});
		}

		new foundry.applications.api.DialogV2({
			window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_PROMPT_ITEM_TYPE },
			content,
			buttons,
			default: "vial"
		}).render(true);
	}
	
	/*
		Main crafting function
	*/
	async function qaCraftAttack() {
		
		// Check if a token is selected, if not default to game.user.character
		// If both do not exist display message to select token
		let actor;
		const token = canvas.tokens.controlled[0];
		if (token) {
			actor = token.actor;
		} else {
			// No token selected, fallback to the user's selected character
			actor = game.user.character;
		}
		if (!actor) {
			// Neither a token nor a selected character exists
			ui.notifications.error(LOCALIZED_TEXT.NOTIF_SELECT_TOKEN_FIRST);
			return;
		}
		
		// Make sure selected token is an alchemist or has archetype
		const alchemistCheck = isAlchemist(actor);
		if (!alchemistCheck.qualifies) {
			debugLog(LOCALIZED_TEXT.DEBUG_CHARACTER_NOT_ALCHEMIST(actor.name));
			ui.notifications.warn(LOCALIZED_TEXT.NOTIF_SELECT_ALCHEMIST);
			return;
		} 
		
		// Check if character is archetype for features. 
		isArchetype = alchemistCheck.isArchetype;
		
		// Delete any items with "infused" tag and 0 qty
		await clearInfused(actor);
		
		qaDialog(actor);

	}