import { debugLog, getSetting, hasFeat, isAlchemist } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";

let isArchetype = false;
const acidVialId = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.9NXufURxsBROfbz1";
const poisonVialId = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.LqZyfGxtRGXEpzZq";
const qaDescCache = new Map(); // uuid -> enriched HTML

// Prefer actor's hydrated crafting item; fall back to UUID lookups
async function qaGetItemForFormula(actor, uuid) {
	try {
		if (!uuid) return null;

		// PF2E crafting cache (when hydrated)
		const formulas = actor?.system?.crafting?.formulas ?? [];
		const f = formulas.find(x => x?.uuid === uuid);
		if (f?.item) return f.item;

		// Fast sync, then async load if evicted
		let doc = fromUuidSync(uuid);
		if (doc) return doc;

		doc = await fromUuid(uuid);
		return doc ?? null;
	} catch (err) {
		debugLog(3, `qaGetItemForFormula() | ${err?.message ?? err}`);
		return null;
	}
}

// Warm the cache for a list of entries before showing the dialog
async function qaPrimeDescCache(actor, entries) {
	try {
		const tasks = entries.map(async (e) => {
			const uuid = e?.uuid;
			if (!uuid || qaDescCache.has(uuid)) return;

			const item = await qaGetItemForFormula(actor, uuid);
			const raw  = item?.system?.description?.value ?? "";
			if (!raw) return;

			const html = await TextEditor.enrichHTML(raw, {
				async: true,
				secrets: game.user.isGM,
				relativeTo: item ?? undefined,
				rollData: item?.getRollData?.() ?? {}
			});
			qaDescCache.set(uuid, html);
		});
		await Promise.allSettled(tasks);
	} catch (err) {
		debugLog(3, `qaPrimeDescCache() | ${err?.message ?? err}`);
	}
}

// Hook for combat turn change to remove temp items on start of turn
Hooks.on("combatTurnChange", async (combat, prior, current) => {

	//only run as GM
	if (game.user.isGM) {
		// Get Setting to see if we are removing Quick Vials at start of turn
		if (getSetting("removeTempItemsAtTurnChange", true)) {

			//get previous combatant - check for Quick Vials
			const priorCombatant = combat.combatants.get(prior.combatantId)
			if (!priorCombatant) {
				debugLog("No valid prior combatant found during combatTurnChange.");
			} else {
				const priorActor = priorCombatant.actor;
				if (!priorActor || priorActor.type !== 'character') {
					debugLog("No valid prior combatant found during combatTurnChange.");
				}
				const alchemistCheck = isAlchemist(priorActor);
				if (!alchemistCheck.qualifies) {
					debugLog(`Prior combatant ${priorActor.name} is not an alchemist`);
				} else {
					debugLog(`"End of ${priorActor.name}'s turn, deleting Quick Vials and poisoned items.`);
					await deleteTempItems(priorActor, true); // Delete Quick Vials
				}
			}

			// Get the combatant whose turn it is
			const currentCombatant = combat.combatants.get(current.combatantId);

			// Make sure there is a current combatant
			if (!currentCombatant) {
				debugLog(2, "No valid prior combatant found during combatTurnChange.");
				return;
			}
			//Get current combatant actor
			const currentActor = currentCombatant.actor;
			// Make sure the actor exists and is a character
			if (!currentActor || currentActor.type !== 'character') {
				debugLog(1, "No valid prior combatant found during combatTurnChange.");
				return;
			}
			debugLog(1, `${currentActor.name}'S turn`);
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
				debugLog(2, "No combat found during deleteCombat hook.");
				return;
			}

			debugLog(1, "Combat ended. Cleaning up items for combatants in Combat.");

			// Iterate through all combatants in the combat encounter
			for (const combatant of combat.combatants) {
				const actor = combatant.actor;
				// Make sure they exist and are a character
				if (!actor || actor.type !== 'character') {
					debugLog(1, `Actor associated with combatant ${combatant.name} not valid`);
					continue;
				}
				// Perform cleanup of temporary Quick Alchemy items created during combat
				await deleteTempItems(actor);
				await deleteTempItems(actor, true);
			}
		}
	}
});

//	renderChatMessage Hook for .roll-attack and .use-consumable buttons
Hooks.on("renderChatMessage", (message, html) => {
	
	// Handle "Roll Attack" button functionality
	html.find(".roll-attack").on("click", async (event) => {
		const itemUuid = event.currentTarget.dataset.uuid;
		const actorId = event.currentTarget.dataset.actorId;
		const itemId = event.currentTarget.dataset.itemId;

		const actor = game.actors.get(actorId);
		const item = actor?.items.get(itemId);

		if (!actor || !item) {
			debugLog(3, "Actor or item not found.");
			return;
		}

		// Ensure a target is selected
		const target = game.user.targets.first();
		if (!target) {
			ui.notifications.error(LOCALIZED_TEXT.QUICK_ALCHEMY_PLEASE_TARGET);
			return;
		}
		
		// Check if we are using a Healing Bomb
		const isHealingBomb = item.slug?.startsWith("healing-bomb");
		if (isHealingBomb) {
			actor.rollOptions.all["healing-bomb-ardt-attack"] = true;
			debugLog(`renderChatMessage isHealingBomb: ${isHealingBomb}`);
		}	

		// Roll the attack with the appropriate MAP modifier
		game.pf2e.rollActionMacro({
			actorUUID: actor.uuid,
			type: "strike",
			itemId: item.id,
			slug: item.slug
		});
	});

	// Handle "Use" button functionality for consumables
	html.find('.use-consumable').on('click', async (event) => {
		const button = event.currentTarget;
		const itemId = button.dataset.itemId;
		const actorId = button.dataset.actorId;

		const actor = game.actors.get(actorId);
		if (!actor) {
			debugLog(2, "Actor not found.");
			return;
		}

		const item = actor.items.get(itemId);
		if (!item) {
			debugLog(2, "Item not found.");
			return;
		}

		try {
			if (item.type === "consumable") {
				// Use the `consume()` method
				await item.consume();
				debugLog(`${item.name} consumed.`);
			} else {
				debugLog(2, `${item.name} cannot be consumed.`);
			}
		} catch (error) {
			debugLog(3, `Failed to use the item: ${error.message} `, error);
		}
	});
});

//	renderChatMessage Hook for collapsable messages
Hooks.on("renderChatMessage", (message, html) => {
	let messageHook = `Hook called for message from ${message.speaker?.alias || message.flavor || "Unknown"}`;

	// Process only messages with the alias "Quick Alchemy"
	if (message.speaker.alias !== "Quick Alchemy") {
		messageHook = `${messageHook} \n -> Skipping non-Quick Alchemy message.`;
		debugLog(messageHook);
		return;
	}

	// Check if Workbench is installed and its collapse setting is enabled
	const isWorkbenchInstalled = game.modules.get("xdy-pf2e-workbench")?.active;
	const workbenchCollapseEnabled = isWorkbenchInstalled
		? game.settings.get("xdy-pf2e-workbench", "autoCollapseItemChatCardContent")
		: false;
	messageHook = `${messageHook}\n -> PF2e Workbench installed: ${isWorkbenchInstalled}`;
	messageHook = `${messageHook}\n -> Workbench collapse setting enabled: ${workbenchCollapseEnabled}`;

	// Check collapse setting
	const collapseChatDesc = getSetting("collapseChatDesc");
	messageHook = `${messageHook}\n -> Collapse setting enabled: ${collapseChatDesc}`;

	// If Workbench is managing the collapsible content, skip logic
	if (workbenchCollapseEnabled === "collapsedDefault" || workbenchCollapseEnabled === "nonCollapsedDefault") {
		messageHook = `${messageHook}\n -> Skipping collapsible functionality due to Workbench setting.`;
		debugLog(messageHook);
		return;
	}

	// Add collapsible functionality only if module's setting is enabled
	if (collapseChatDesc) {
		messageHook = `${messageHook}\n -> Adding collapsible functionality.`;

		// Collapse the content by default
		html.find('.collapsible-content').each((_, element) => {
			element.style.display = 'none';
		});

		// Handle toggle icon click
		html.find('.toggle-icon').on('click', (event) => {
			debugLog("Toggle icon clicked.");
			const toggleIcon = event.currentTarget;
			const collapsibleContent = toggleIcon.closest('.collapsible-message')?.querySelector('.collapsible-content');

			if (!collapsibleContent) {
				debugLog(2, "No collapsible content found.");
				debugLog(messageHook);
				return;
			}

			// Toggle visibility
			const isHidden = collapsibleContent.style.display === 'none' || collapsibleContent.style.display === '';
			collapsibleContent.style.display = isHidden ? 'block' : 'none';

			// Toggle icon state
			toggleIcon.classList.toggle('fa-eye', !isHidden);
			toggleIcon.classList.toggle('fa-eye-slash', isHidden);
			debugLog("Toggle icon classes updated");
		});
	} else {
		messageHook = `${messageHook}\n -> Collapsible functionality disabled; skipping.`;
	}
	debugLog(messageHook);
});

//	Hook for item use chat messages
Hooks.on("renderChatMessage", async (message, html, data) => {
	debugLog("renderChatMessage hook triggered", message);
	html.find('.use-consumable').on('click', async (event) => {
		// Only act on item use messages
		const item = await fromUuid(message?.flags?.pf2e?.origin?.uuid ?? "");
		if (!item || item.type !== "consumable") return;

		// Only act on items with the "coagulant" trait
		const traits = item.system.traits?.value ?? [];
		if (!traits.includes("coagulant")) return;

		// Don't do anything if the flavor text is already present
		const existing = html.find(".card-header .card-flavor");
		if (existing.length && existing.text().includes("Coagulant Immunity")) return;

		// Inject our link under the item title
		const flavor = document.createElement("div");
		flavor.classList.add("card-flavor");
		flavor.innerHTML = `If the target has <strong><a data-uuid="Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.coagulant-immunity-id">Coagulant Immunity</a></strong>, this healing has no effect.`;

		html.find(".card-header").append(flavor);
	});
});

Hooks.on("ready", async () => {
	console.log("%cPF2e Alchemist Remaster Duct Tape QuickAlchemy.js loaded", "color: aqua; font-weight: bold;");
	
	//	Preload compendium
	try {
		await game.packs.get("pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items")?.getDocuments();
		debugLog(1, "Preloaded compendium: alchemist-duct-tape-items");
	} catch (err) {
		debugLog(3, "Error preloading compendium alchemist-duct-tape-items: ", err);
	}
	
	// Attach function to the global window object
	window.qaCraftAttack = qaCraftAttack;
	
	// Show the selected formula's description in the dialog
	window.qaShowFormulaDescription = async function(uuid, descEl) {
		try {
			descEl ??= document.querySelector("#qa-desc");
			if (!descEl || !uuid) return;

			// Instant if cached
			const cached = qaDescCache.get(uuid);
			if (cached) { descEl.innerHTML = cached; return; }

			descEl.innerHTML = `<em>${LOCALIZED_TEXT.QUICK_ALCHEMY_LOADING ?? "Loading..."}</em>`;

			const actor = window.qaCurrentActorForQA ?? null;
			const item  = await qaGetItemForFormula(actor, uuid);
			const raw   = item?.system?.description?.value ?? `<em>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC}</em>`;

			const html  = await TextEditor.enrichHTML(raw, {
				async: true,
				secrets: game.user.isGM,
				relativeTo: item ?? undefined,
				rollData: item?.getRollData?.() ?? {}
			});

			qaDescCache.set(uuid, html);
			descEl.innerHTML = html;
		} catch (err) {
			debugLog(3, `qaShowFormulaDescription() | ${err?.message ?? err}`);
		}
	};
	
});

//	function to close popup from rollActionMacro
function closeAttackPopouts(){
	for (const app of Object.values(ui.windows)) {
		const id = app._element?.[0]?.id ?? "";
		if (id.startsWith("AttackPopout-") && app.options?.type === "strike") {
			// DEBUG
			debugLog(1, `[Healing Bomb] Closing attack popout: ${id}`);
			app.close();
		}
	}
}

//	Function to clear temporary items from inventory
async function deleteTempItems(actor, endTurn = false) {
	debugLog(`deleteTempItems() | Deleting temp items for ${actor.name}, Quick Vials = ${endTurn}`);

	let quickAlchemyItems = [];
	// See if we are deleting Quick Vials (at enf of alchemist turn)
	if (endTurn) {
		// Get Quick Vial Items (ensure slug exists)
		quickAlchemyItems = Array.from(actor.items.values()).filter(item =>
			(item.system.slug && item.system.slug.startsWith("quick-vial")) ||
			(item.name && item.name.includes("(*Poisoned)"))
		);
		debugLog(`deleteTempItems() | quickAlchemyItems: `, quickAlchemyItems);
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
			debugLog(`deleteTempItems() | Removed ${item.name} from ${actor.name}.`);
		} catch (err) {
			debugLog(`deleteTempItems() | Failed to remove ${item.name} from ${actor.name}: `, err);
		}
	}

	// Send a single chat message summarizing removed items
	if (removedItems.length > 0) {
		if (getSetting("createRemovedTempItemsMsg")) {

			const messageContent = `
					${LOCALIZED_TEXT.QUICK_ALCHEMY_MSG_ITEMS_REMOVED(actor.name)}
					<ul>${removedItems.map(name => `<li>${name}</li>`).join('')}</ul>
				`;
			ChatMessage.create({
				user: game.user.id,
				speaker: { alias: LOCALIZED_TEXT.QUICK_ALCHEMY },
				content: messageContent
			});
		}
	}
}

// Function to determine size of the actor
async function getActorSize(actor) {
	// Access the size of the actor
	const creatureSize = await actor.system.traits.size.value;
	debugLog(`getActorSize() | The size of the creature is ${creatureSize}`);
	return creatureSize;
}

// Function to send a message with a link to use a consumable item
async function sendConsumableUseMessage(itemUuid) {
	const item = await fromUuid(itemUuid);
	if (!item) {
		ui.notifications.warn(LOCALIZED_TEXT.NOTIF_ITEM_NOTFOUND);
		return;
	}

	const actor = item.actor;
	if (!actor) {
		ui.notifications.warn(LOCALIZED_TEXT.NOTIF_ACTOR_NOT_ASSOC_ITEM);
		return;
	}
	
	// If item has coagulant trait
	const traits = item.system.traits?.value ?? [];
	const slug = item.slug ?? "";
	const showCoagulantNote = (slug === "healing-quick-vial-temp" || traits.includes("coagulant"));
	let coagulantLink = "";
	if (showCoagulantNote) {
		const enrichedLink = await TextEditor.enrichHTML(
			"This applies @UUID[Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.htVOAKfVmVYafFrQ]{Coagulant Immunity} for 10 minutes, If the target is already under the effect of <strong>Coagulant Immunity</strong>, this healing has no effect.",
			{ async: true }
		);
		coagulantLink = `<div class="card-flavor">${enrichedLink}</div>`;
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
			
			${coagulantLink}

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
		speaker: { alias: LOCALIZED_TEXT.QUICK_ALCHEMY, actor: actor.id }, // Ensure the actor ID is available in speaker
		content: content,
	});
}

//	Function to send "Already consumed" chat message
function sendAlreadyConsumedChat() {
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
		speaker: { alias: LOCALIZED_TEXT.QUICK_ALCHEMY },
		content: content,
	});
}

//	Function to create chat message after creating Versatile Vial prompting to 
//	attack or open QuickAlchemy dialog
async function sendVialAttackMessage(itemUuid, actor) {
	
	// DEBUG: Log the UUID
	debugLog(`sendVialAttackMessage() | Attempting to fetch item with UUID: ${itemUuid}`);

	// Fetch the item (weapon) from the provided full UUID
	const item = await fromUuid(itemUuid);
	if (!item) {
		ui.notifications.error(LOCALIZED_TEXT.NOTIF_ITEM_NOTFOUND);
		debugLog(3, `sendVialAttackMessage() | Failed to fetch item with UUID ${itemUuid}`);
		return;
	}

	// Fetch the actor associated with the item
	if (!actor) {
		const actor = item.actor;
	}
	if (!actor) {
		ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOT_ASSOC_ITEM);
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
			<button class="roll-attack" data-uuid="${itemUuid}" data-actor-id="${actor.id}" data-item-id="${item.id}" data-map="0" style="margin-top: 5px;">${LOCALIZED_TEXT.BTN_ROLL_ATK}</button>
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
	debugLog(`sendWeaponAttackMessage() | Attempting to fetch item with UUID: ${itemUuid}`);

	// Fetch the item (weapon) from the provided full UUID
	const item = await fromUuid(itemUuid);
	if (!item) {
		ui.notifications.error(LOCALIZED_TEXT.NOTIF_ITEM_NOTFOUND);
		debugLog(3, `sendWeaponAttackMessage() | Failed to fetch item with UUID ${itemUuid}`);
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
		ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOT_ASSOC_ITEM);
		debugLog(3, "sendWeaponAttackMessage() | No actor associated with this item: ", item);
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
		speaker: { alias: LOCALIZED_TEXT.QUICK_ALCHEMY },
		content: content,
	});

}

// Function to equip an item by slug
async function equipItemBySlug(slug, actor) {
	debugLog(`equipItemBySlug() | slug: ${slug}, actor:${actor.name}`);

	if (!actor) {
		const actor = canvas.tokens.controlled[0]?.actor;
		if (!actor) {
			debugLog(3, "equipItemBySlug() | No actor selected.");
			return;
		}
	}

	const item = actor.items.find((i) => i.slug === slug && i.system?.ductTaped === true);
	if (!item) {
		debugLog("equipItemBySlug() | Item not found.");
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
		debugLog(`clearInfused() | Deleting ${itemsToDelete.length} infused items with quantity 0.`);
		for (let item of itemsToDelete) {
			await item.delete();
		}
		debugLog(`clearInfused() | Deleting ${itemsToDelete.length} infused items with quantity 0.`);
	} else {
		debugLog("clearInfused() | No infused items with quantity 0 found.");
	}
}
 	
//	Function to craft "Healing Quick Vial" from the module compendium and add 
//	"(*Temporary)" to the end of the name and custom flag
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
		debugLog(`craftHealingVial() | Increased quantity of ${existingItem.name} to ${newQuantity}`);
		sendConsumableUseMessage(existingItem.uuid);
		return;
	} else {

		// Item does not exist, retrieve from compendium
		const compendium = game.packs.get("pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items");
		if (!compendium) {
			debugLog(3, "craftHealingVial() | Compendium not found.");
			return;
		}

		try {
			// Find the item in the compendium
			const compendiumIndex = await compendium.getIndex();
			const healingItemEntry = compendiumIndex.find(entry => entry.system.slug === "healing-quick-vial-temp");
			if (!healingItemEntry) {
				debugLog(3, "craftHealingVial() | Healing Quick Vial not found in compendium.");
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

			// Add Coagulant trait unless we have Advanced Vials Chirurgeon Feat
			
			const advVials = hasFeat(selectedActor, "advanced-vials-chirurgeon");
			if (!advVials){
				// Add the "coagulant" trait if not already present
				if (!modifiedItem.system.traits.value.includes("coagulant")) {
					modifiedItem.system.traits.value.push("coagulant");
				}
			} 
			
			// Rename the item
			modifiedItem.name += " (*Temporary)";

			// If we are using size based quick alchemy, modify size
			if (alchemyMode !== "disabled") {
				if (alchemyMode === "tinyOnly" && actorSize !== "tiny") {
					debugLog("craftHealingVial() | tinyOnly enabled | Actor is not tiny.");
				} else {
					modifiedItem.system.size = actorSize; // Adjust size if necessary
				}
			}

			// Add the item to the actor's inventory
			const createdItem = await selectedActor.createEmbeddedDocuments("Item", [modifiedItem]);
			debugLog(`craftHealingVial() | Crafted `, createdItem);
			const createdItemUuid = createdItem[0].uuid; //`Actor.${selectedActor.id}.Item.${createdItem[0].id}`;
			debugLog(`craftHealingVial() | createdItemUuid: ${createdItemUuid}`);
			sendConsumableUseMessage(createdItemUuid);
		} catch (error) {
			debugLog(3, "craftHealingVial() | Error retrieving Healing Quick Vial from compendium: ", error);
		}
	}
}

//	Function to craft Quick Vial using Quick Alchemy and add "(*Temporary)" 
//	to the end of the name and custom tag to any item created with this 
//	Quick Alchmy macro so that it can be removed at the end of the turn 
//	and ensured that when attacking it is using the same item.
async function craftVial(selectedItem, selectedActor, selectedType = "acid", specialIngredient = "none") {
	debugLog(`craftVial() | Selected Vial: ${selectedItem?.name} || No Name}`); // Selected Vial: 
	debugLog(`craftVial() | Selected Actor: ${selectedActor?.name} || No Name}`); // Selected acrtor: 

	if (!selectedItem || !selectedActor) {
		debugLog(3, "craftVial() | Invalid item or actor provided.");
		return;
	}
	let newItemSlug = "";

	const alchemyMode = getSetting("enableSizeBasedAlchemy", "disabled");

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
				debugLog("craftVial() | Item does not have a damage property to update.");
			}
		}

		// Replace materials if selected
		if (specialIngredient !== "none") {
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
				debugLog("craftVial() | tinyOnly enabled | Actor is not tiny.");
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
		debugLog("craftVial() | Created item with Quick Alchemy: ", createdItem);
	}
	debugLog(`craftVial() | Returning ${newItemSlug}`);
	return newItemSlug; // return slug
}

//	Function to craft item using Quick Alchemy and add "(*Temporary)" to the 
//	end of the name and a custom tag "ductTapped" to any item created with this 
//	Quick Alchmy macro so that it can be removed at the end of the turn and 
//	ensured that when attacking it is using the same item.
async function craftItem(selectedItem, selectedActor, count = 1) {
	debugLog(`craftItem() | Selected Item: ${selectedItem?.name} || No Name}`);
	debugLog(`craftItem() | Selected Actor: ${selectedActor?.name} || No Name}`);

	const alchemyMode = getSetting("enableSizeBasedAlchemy", "disabled");

	if (!selectedItem || !selectedActor) {
		debugLog(3, "craftItem() | Invalid item or actor provided.");
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
				debugLog("craftItem() | tinyOnly enabled | Actor is not tiny.");
			} else {
				modifiedItem.system.size = actorSize; // Adjust size if necessary
			}
		}

		// Create the items for the actor
		const createdItem = await selectedActor.createEmbeddedDocuments("Item", [modifiedItem]);
		debugLog("craftItem() | Created item with Quick Alchemy: ", createdItem);
	}
	return selectedItem?.slug;
}

//	Function to get count of versatile vials in actor's inventory
export function getVersatileVialCount(actor) {
	// Verify valid actor passed
	if (!actor || !actor.items) {
		debugLog(3, "getVersatileVialCount() | Error: no valid actor passed");
		return 0; // Return 0 instead of undefined for better consistency
	}

	// Get count of versatile-vial items
	const totalVialCount = actor.items
		.filter(item => item.slug === "versatile-vial")
		.reduce((count, vial) => count + (vial.system.quantity || 0), 0);
	return totalVialCount;
}

//	Function to consume a versatile vial when crafting with quick alchemy
async function consumeVersatileVial(actor, slug, count = 1) {
	if (!actor) {
		debugLog(3, "consumeVersatileVial(): Actor not found.");
		return false;
	}

	// If we are crafting a veratile vial, Quick Vial, or Healing Vial do not consume, return true
	if (slug.startsWith("versatile-vial") || slug.startsWith("quick-vial") || slug.startsWith("healing-quick-vial")) {
		debugLog(`consumeVersatileVial() | Crafted item with slug ${slug} without consuming vial.`);
		return true;
	}

	// Find versatile-vial in inventory
	const regularVial = actor.items.find(item => item.slug === "versatile-vial");

	// Consume versatile vial
	if (regularVial && regularVial.system.quantity >= count) {
		await regularVial.update({ "system.quantity": regularVial.system.quantity - count });
		debugLog(`consumeVersatileVial() | Consumed ${count} versatile vial(s): ${regularVial.name}`);
		return true;
	}

	// No vial available to consume
	debugLog("consumeVersatileVial(): No versatile vials available to consume.");
	ui.notifications.warn(LOCALIZED_TEXT.NOTIF_NO_VIAL_CONSUME);
	return false;
}

//	Function to process formulas with a progress bar
async function processFormulasWithProgress(actor) {
	// Get known formulas
	const formulas = actor?.system.crafting?.formulas || [];
	const formulaCount = formulas.length;

	if (!formulaCount) {
		debugLog(`processFormulasWithProgress() | No formulas available for actor ${actor?.name ?? "Unknown"}`);
		return { weaponOptions: "", consumableOptions: "" };
	}

	// Prepare progress bar dialog
	let progress = 0;
	const total = formulas.length;

	const progressDialog = new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY },
		classes: ["quick-alchemy-dialog"],
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
		try {
			const entry = fromUuidSync(formula.uuid);

			// Update progress
			progress++;
			const progressBar = document.getElementById("progress-bar");
			if (progressBar) progressBar.value = progress;

			// Check if entry is null
			if (!entry) {
				listProcessedFormulas = `-> ${listProcessedFormulas} entry ${formula.uuid} is null\n`;
				continue;
			}

			const itemSlug = entry.slug ?? entry.system?.slug ?? entry.name ?? "";
			listProcessedFormulas = `-> ${listProcessedFormulas} slug: ${itemSlug} | uuid: ${entry.uuid} |`;

			// Skip versatile vial
			if (itemSlug === "versatile-vial") {
				listProcessedFormulas = `-> ${listProcessedFormulas} skipping\n`;
				continue;
			}

			// Pull traits (lowercased); works with indexed docs
			const traitsRaw =
				entry?.system?.traits?.value ??
				entry?.traits?.value ??
				entry?._source?.system?.traits?.value ??
				[];
			const traits = Array.isArray(traitsRaw) ? traitsRaw.map(t => String(t).toLowerCase()) : [];
			const isAlchemical = traits.includes("alchemical");

			// For Double Brew, include ONLY alchemical weapons/consumables
			if (entry.type === "weapon") {
				if (!isAlchemical) {
					listProcessedFormulas = `-> ${listProcessedFormulas} skipped (weapon not alchemical)\n`;
					continue;
				}
				weaponEntries.push(entry);
				listProcessedFormulas = `-> ${listProcessedFormulas} added to weaponEntries\n`;
			} else if (entry.type === "consumable") {
				if (!isAlchemical) {
					listProcessedFormulas = `-> ${listProcessedFormulas} skipped (consumable not alchemical)\n`;
					continue;
				}
				consumableEntries.push(entry);
				listProcessedFormulas = `-> ${listProcessedFormulas} added to consumableEntries\n`;
			} else {
				// not a weapon/consumable
				listProcessedFormulas = `-> ${listProcessedFormulas} ignoring.\n`;
			}
		} catch (err) {
			debugLog(3, `processFormulasWithProgress() | error at i=${index}, uuid=${formula?.uuid}: ${err?.message ?? err}`);
			continue; // don’t let one item kill the whole run
		}
	}

	debugLog(`processFormulasWithProgress() | Processed Formulas:\n${listProcessedFormulas}`);

	// Close progress dialog
	progressDialog.close();

	// Sort entries by name then level (ignoring text in parentheses)
	const sortEntries = (entriesToSort) => {
		entriesToSort.sort((a, b) => {
			const nameA = a.name.replace(/\s*\(.*?\)/g, "").trim();
			const nameB = b.name.replace(/\s*\(.*?\)/g, "").trim();
			const nameComparison = nameA.localeCompare(nameB);
			if (nameComparison !== 0) return nameComparison;
			const levelA = a.system.level?.value || 0;
			const levelB = b.system.level?.value || 0;
			return levelB - levelA;
		});
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

//	Function to process FILTERED formulas with a progress bar
async function processFilteredFormulasWithProgress(actor, type, slug) {
	if (!type) {
		debugLog(3, "processFilteredFormulasWithProgress(): No type passed");
		return { filteredEntries: [] };
	}
	debugLog(`processFilteredFormulasWithProgress(} | Filtering by type: ${type}`);

	// Get known formulas
	const formulas = actor?.system.crafting?.formulas || [];
	const formulaCount = formulas.length;

	// make sure there are formulas
	if (!formulas.length) {
		debugLog(`processFilteredFormulasWithProgress() | No formulas available for actor ${actor.name}`);
		return { filteredEntries: [] };
	}

	// Progress bar dialog
	let progress = 0;
	const total = formulas.length;
	const progressDialog = new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY },
		classes: ["quick-alchemy-dialog"],
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
				callback: () => { },
				disabled: true
			}
		],
		close: () => { }
	});
	progressDialog.render(true);

	// Arrays to store entry objects
	const filteredEntries = [];

	// Gather entries in respective arrays
	//let listProcessedFormulas = "";
	for (let [index, formula] of formulas.entries()) {
		try {
			const entry = fromUuidSync(formula.uuid);

			// Update progress
			progress++;
			const progressBar = document.getElementById("progress-bar");
			if (progressBar) progressBar.value = progress;

			// Skip null or partial entries safely
			if (!entry) {
				debugLog(`  --> entry is null for uuid=${formula.uuid} — skipping`);
				continue;
			}

			// compute once per entry (BEFORE any logs/use)
			const itemSlug = entry.slug ?? entry.system?.slug ?? entry.name ?? "";
			const traitsRaw =
				entry?.system?.traits?.value ??
				entry?.traits?.value ??
				entry?._source?.system?.traits?.value ??
				[];
			const traits = Array.isArray(traitsRaw) ? traitsRaw.map(t => String(t).toLowerCase()) : [];
			const isAlchemical = traits.includes("alchemical");
			
			//listProcessedFormulas = `-> ${listProcessedFormulas} slug: ${entry.slug} | uuid: ${entry.uuid}`;

			// Skip Versatile Vials
			if (itemSlug === "versatile-vial") {
				// do nothing
				//listProcessedFormulas = `-> ${listProcessedFormulas} skipped (versatile-vial)`;
				continue;
			}
			//	Check only food items for Wandering Chef dedication
			if (type === "food") {
				const tags = entry.system?.traits?.otherTags ?? [];
				if (tags.includes("alchemical-food")) {
					if (slug) {
						if (entry.slug.toLowerCase().includes(slug.toLowerCase())) {
							filteredEntries.push(entry);
							//listProcessedFormulas = `-> ${listProcessedFormulas} added to filteredEntries (food match)`;
						}
						continue;
					}
					filteredEntries.push(entry);
					//listProcessedFormulas = `-> ${listProcessedFormulas} added to filteredEntries (food match)`;
				}
			} else if (entry.type === type) {
				// Require the "alchemical" trait when selecting weapons or consumables
				const requireAlchemical = type === "weapon" || type === "consumable";
				if (requireAlchemical && !isAlchemical) {
					//listProcessedFormulas = `-> ${listProcessedFormulas} skipped (not alchemical)`;
					debugLog(`  --> SKIP (not alchemical) slug=${itemSlug} | traits=[${traits.join(",")}]`);
					continue;
				}

				if (slug) {
					if (itemSlug.toLowerCase().includes(slug.toLowerCase())) {
						filteredEntries.push(entry);
						//listProcessedFormulas = `-> ${listProcessedFormulas} added to filteredEntries`;
						debugLog(`  --> ADD (slug match) ${itemSlug}`);
					}
					continue;
				}

				filteredEntries.push(entry);
				//listProcessedFormulas = `-> ${listProcessedFormulas} added to filteredEntries`;
				debugLog(`  --> ADD ${itemSlug}`);
			} else { // entry is null
				//listProcessedFormulas = `-> ${listProcessedFormulas} entry ${formula.uuid} is null`;
			}
		} catch (err) {
			debugLog(3, `  --> error at i=${index}, uuid=${formula?.uuid}: ${err?.message ?? err}`);
			continue; // don’t let a bad record stall the run
		}
	}

	// debugLog(`processFilteredFormulasWithProgress() | Processed Formulas:\n${listProcessedFormulas}`);

	// Close progress dialog
	progressDialog.close();

	// Return categorized entries
	debugLog(`processFilteredFormulasWithProgress() | Returning filteredEntries: `, filteredEntries);

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

	// TEMP DEBUG
	debugLog(`processFilteredFormulasWithProgress() | result count=${filteredEntries.length} | slugs=[${filteredEntries.map(i => i.slug ?? i.system?.slug ?? i.name).join(",")}]`);
	return { filteredEntries };

	// Close progress dialog - just in case
	progressDialog.close();
}

//	Function to process Filtered inventory with progress bar
async function processFilteredInventoryWithProgress(actor, type, slug) {
	if (!type) {
		debugLog(3, "processFilteredInventoryWithProgress() | No type passed!");
		return { filteredEntries: [] };
	}
	debugLog(`processFilteredInventoryWithProgress() | Filtering by type: ${type}`);

	const filteredEntries = [];

	const inventory = actor?.inventory?.contents;
	const inventoryCount = inventory.length;

	if (!inventoryCount) {
		debugLog(`processFilteredInventoryWithProgress() | No inventory found for ${actor.name}`);
		return { filteredEntries: [] };
	}

	// Prepare progress bar dialog
	let progress = 0;
	const total = inventoryCount;
	var listProcessedInventory = "";

	const progressDialog = new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY },
		classes: ["quick-alchemy-dialog"],
		content: `
				<div>
					<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_PROCESSING_MSG(inventoryCount)}</p>
					<progress id="progress-bar" value="0" max="${total}" style="width: 100%;"></progress>
				</div>
			`,
		buttons: [
			{
				action: "noop",
				label: LOCALIZED_TEXT.OK,
				icon: "",
				callback: () => { },
				disabled: true
			}
		],
		close: () => { }
	});
	progressDialog.render(true);
	const progressBar = document.getElementById("progress-bar");

	for (let item of inventory) {
		// Update progress
		progress++;
		if (progressBar) progressBar.value = progress;

		if (item.type === type) {
			if (slug) {
				if (item.slug.toLowerCase().includes(slug.toLowerCase())) {
					listProcessedInventory = `${listProcessedInventory} added to filteredEntries`;
					filteredEntries.push(item);
				}
				continue;
			}
		}
		else {
			listProcessedInventory = `${listProcessedInventory} skipping`;
		}
	}

	debugLog(`processFilteredInventoryWithProgress() | Processed Items:\n${listProcessedInventory}`);

	// Close progress dialog
	progressDialog.close();

	// Return categorized entries
	debugLog(`processFilteredInventoryWithProgress() | Returning filteredEntries: `, filteredEntries);

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

//	Helper function for craftButton() and craftAttackButton()
async function handleCrafting(uuid, actor, { quickVial = false, doubleBrew = false, attack = false, selectedType = "acid", specialIngredient = "none", sendChat = true }) {
	debugLog(`handleCrafting(${uuid}, ${actor.name}, ${quickVial}, ${doubleBrew}, ${attack}, ${selectedType}, ${specialIngredient}, ${sendChat}) called.`);
	// Make sure uuid was passed
	if (uuid === "none") {
		debugLog("handleCrafting() | No item selected for crafting.");
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
				debugLog(`handleCrafting() | Item found on attempt ${attempts + 1}. Rolling strike.`);
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
			debugLog(`handleCrafting() | Attempt ${attempts} | Item not found, retrying in ${delay}ms...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}

		debugLog(`handleCrafting() | Failed to find item after ${maxAttempts} attempts.`);
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
	debugLog(`handleCrafting() | newItemSlug: ${newItemSlug}`);

	const temporaryItem = actor.items.find(item =>
		item.slug === newItemSlug &&
		item.name.endsWith("(*Temporary)")
	);

	if (!temporaryItem) {
		debugLog("handleCrafting() | Failed to find temporary item created by Quick Alchemy.");
		return;
	}

	const vialConsumed = await consumeVersatileVial(actor, temporaryItem.slug, 1);
	if (!vialConsumed) {
		debugLog("handleCrafting() | No versatile vials available.");
		ui.notifications.error(LOCALIZED_TEXT.NOTIF_NO_VIAL_AVAIL);
		return;
	}
	debugLog(`handleCrafting() | equipItemBySlug(${temporaryItem.slug}, ${actor.name})`);
	const newUuid = await equipItemBySlug(temporaryItem.slug, actor);
	if (!newUuid) {
		debugLog(3, `handleCrafting() | Failed to equip item with slug: ${temporaryItem.slug}`);
		ui.notifications.error(LOCALIZED_TEXT.NOTIF_FAILED_EQUIP_ITEM);
		return;
	}

	const sendMsg = async (itemType, uuid, actor) => {
		debugLog(`handleCrafting() | sendMsg => itemType: ${itemType} | newUuid: ${newUuid} | actor: ${actor.name} | sendChat: ${sendChat}`);

		// Do not send if setting is disabled
		const msgSetting = getSetting("sendAtkToChat") && sendChat;
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
				debugLog("handleCrafting() |Unknown item type for crafting.");
		}
	}

	const formattedUuid = `Actor.${actor.id}.Item.${newUuid}`;
	debugLog(`handleCrafting() |formattedUuid: ${formattedUuid}`);

	// Determine behavior based on parameters
	if (doubleBrew) {
		// Send message to chat based on item type
		debugLog(`handleCrafting() | Double Brew enabled, sending item to chat only | newUuid: ${formattedUuid} | actor: `, actor);
		await sendMsg(temporaryItem.type, formattedUuid, actor);
	} else if (attack) {
		if (getSetting("sendAtkToChat")) await sendMsg(temporaryItem.type, formattedUuid, actor);
		debugLog(`handleCrafting() | temporaryItem.id: ${temporaryItem.id} | temporaryItem.slug: ${temporaryItem.slug}`);
		await delayedRollActionMacro(actor, temporaryItem);
	} else {
		// Send message to chat based on item type
		await sendMsg(temporaryItem.type, formattedUuid, actor);
	}
	return temporaryItem;
};

//	Function to process craft button
async function craftButton(actor, itemUuid, dbItemUuid, itemType, {selectedType = "acid", specialIngredient = "none", sendMsg = true} = {}) {
	const selectedUuid = itemUuid;
	const dbSelectedUuid = dbItemUuid;
	debugLog(`craftButton() | Item Selection: ${selectedUuid}`);
	debugLog(`craftButton() | itemType: ${itemType} | selectedType: ${selectedType} | specialIngredient: ${specialIngredient} | sendMsg: ${sendMsg}`);
	debugLog(`craftButton() | Double Brew Selection: ${dbSelectedUuid}`);
	var temporaryItem = null;

	// Check if we are making Quick Vial
	if (itemType === 'vial') {
		debugLog(`craftButton() | handleCrafting=> uuid: ${selectedUuid} | itemTye: ${itemType} | actor: ${actor.name} | selectedType: ${selectedType}`);
		temporaryItem = await handleCrafting(selectedUuid, actor, { quickVial: true, doubleBrew: false, attack: false, selectedType: selectedType, specialIngredient: specialIngredient, sendChat: sendMsg});
		debugLog(`craftButton() | Double Brew: handleCrafting=> uuid: ${dbSelectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
		if (dbSelectedUuid == selectedUuid) { // We are creating another Quick Vial
			await handleCrafting(dbSelectedUuid, actor, { quickVial: true, doubleBrew: true, attack: false, selectedType: selectedType, specialIngredient: specialIngredient, sendChat: sendMsg});
		} else {
			await handleCrafting(dbSelectedUuid, actor, { quickVial: false, doubleBrew: true, attack: false, selectedType: selectedType, sendChat: sendMsg});
		}
	} else {
		debugLog(`craftButton() | handleCrafting=> uuid: ${selectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
		temporaryItem = await handleCrafting(selectedUuid, actor, { quickVial: false, doubleBrew: false, attack: false, selectedType: selectedType, sendChat: sendMsg});
		debugLog(`craftButton() | handleCrafting=> uuid: ${dbSelectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
		await handleCrafting(dbSelectedUuid, actor, { quickVial: false, doubleBrew: true, attack: false, selectedType: selectedType, sendChat: sendMsg});
	}
	return temporaryItem;
}

//	Function to process craft and attack button
async function craftAttackButton(actor, itemUuid, dbItemUuid, itemType, selectedType = "acid", specialIngredient = "none") {
	const selectedUuid = itemUuid;
	const dbSelectedUuid = dbItemUuid;
	debugLog(`craftAttackButton() | Item Selection: ${selectedUuid}`);
	debugLog(`craftAttackButton() | itemType: ${itemType} | selectedType: ${selectedType} | specialIngredient: ${specialIngredient}`);
	debugLog(`craftAttackButton() | Double Brew Selection: ${dbSelectedUuid}`);

	// Check if we are making Quick Vial
	if (itemType === 'vial') {
		debugLog(`craftAttackButton() | handleCrafting=> uuid: ${selectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
		await handleCrafting(selectedUuid, actor, { quickVial: true, doubleBrew: false, attack: true, selectedType: selectedType, specialIngredient: specialIngredient});
		debugLog(`craftAttackButton() | Double Brew: handleCrafting=> uuid: ${dbSelectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
		if (dbSelectedUuid == selectedUuid) { // We are creating another Quick Vial
			await handleCrafting(dbSelectedUuid, actor, { quickVial: true, doubleBrew: true, attack: false, selectedType: selectedType, specialIngredient: specialIngredient});
		} else {
			await handleCrafting(dbSelectedUuid, actor, { quickVial: false, doubleBrew: true, attack: false, selectedType: selectedType, specialIngredient: specialIngredient});
		}
	} else {
		debugLog(`craftAttackButton() | handleCrafting=> uuid: ${selectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
		await handleCrafting(selectedUuid, actor, { quickVial: false, doubleBrew: false, attack: true, selectedType: selectedType, specialIngredient: specialIngredient});
		debugLog(`craftAttackButton() | handleCrafting=> uuid: ${dbSelectedUuid} | actor: ${actor.name} | selectedType: ${selectedType}`);
		await handleCrafting(dbSelectedUuid, actor, { quickVial: false, doubleBrew: true, attack: false, selectedType: selectedType, specialIngredient: specialIngredient});
	}
}

//	Function to process crafting healing bomb
async function craftHealingBomb(actor, elixirUuid) {
	debugLog(`craftHealingBomb() | Item Selection: ${elixirUuid}`);
	var healingSlug = "healing-bomb";
	var elixir = await fromUuid(elixirUuid);
	if (!elixir) {
		debugLog(`craftHealingBomb() | Actor not found`);
		ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
		return;
	}
	const elixirStrength = elixir.slug.split("-").at(-1).toLowerCase();
	debugLog(`craftHealingBomb() | elixirStrength: ${elixirStrength}`);

	// Get base item from compendium
	const compendium = game.packs.get("pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items");
	if (!compendium) {
		debugLog(3, "craftHealingBomb() | Compendium not found.");
		return;
	}

	try {
		async function throwBomb(createdItem) {
			debugLog("craftHealingBomb() | throwBomb() - Item Selection: ", createdItem);
			const createdItemUuid = createdItem.uuid; //`Actor.${selectedActor.id}.Item.${createdItem[0].id}`;
			await createdItem.update({
				"system.equipped.carryType": "held",
				"system.equipped.handsHeld": "1",
			});
			sendWeaponAttackMessage(createdItemUuid);
		}

		// Find the item in the compendium
		const compendiumIndex = await compendium.getIndex();
		const healingItemEntry = compendiumIndex.find(entry => entry.system.slug === "healing-bomb-ardt");
		if (!healingItemEntry) {
			debugLog(3, "craftHealingBomb() | Healing Quick Vial not found in compendium.");
			return;
		}

		// Get the full item document from the compendium
		const healingItem = await compendium.getDocument(healingItemEntry._id);
		// Check if the item already exists in the actor's inventory
		const existingItem = actor.items.find(item =>
			item.slug === healingSlug &&
			item.system.ductTaped === true &&
			item.name.includes(`(${elixirStrength.charAt(0).toUpperCase() + elixirStrength.slice(1)})`) &&
			((item.system.traits?.value?.includes("infused") && elixir.system.traits?.value?.includes("infused")) ||
				(!item.system.traits?.value?.includes("infused") && !elixir.system.traits?.value?.includes("infused")))
		);

		if (existingItem) {
			// Item exists, increase quantity of existing infused item
			const newQty = existingItem.system.quantity + 1;
			await existingItem.update({ "system.quantity": newQty });
			await throwBomb(existingItem);
			return;
		}

		// Clone the item to make modifications
		const modifiedItem = healingItem.toObject();

		// Rename the item
		modifiedItem.name += ` (${elixirStrength.charAt(0).toUpperCase() + elixirStrength.slice(1)}) (*Temporary)`;
		modifiedItem.name += ` ${elixir.system.traits.value.includes("infused") ? "(Infused)" : ""}`;

		// Add custom module tags
		modifiedItem.system.ductTaped = true;
		modifiedItem.system.publication.authors = "Panda";
		modifiedItem.system.publication.license = "ORC";
		modifiedItem.system.publication.title = "PF2e Alchemist Remaster Duct Tape";

		modifiedItem.system.damage.die = "d6";
		// Adjust Quick Vial Level
		switch (elixirStrength) {
			case "minor":
				modifiedItem.system.level.value = 1;
				modifiedItem.system.damage.dice = 1;
				modifiedItem.system.splashDamage.value = 1;
				modifiedItem.system.bonus.value = 1;
				break;
			case "lesser":
				modifiedItem.system.level.value = 5;
				modifiedItem.system.damage.dice = 3;
				modifiedItem.system.damage.modifier = 6;
				modifiedItem.system.splashDamage.value = 3;
				modifiedItem.system.bonus.value = 1;
				break;
			case "moderate":
				modifiedItem.system.level.value = 9;
				modifiedItem.system.damage.dice = 5;
				modifiedItem.system.damage.modifier = 12;
				modifiedItem.system.splashDamage.value = 5;
				modifiedItem.system.bonus.value = 2;
				break;
			case "greater":
				modifiedItem.system.level.value = 13;
				modifiedItem.system.damage.dice = 7;
				modifiedItem.system.damage.modifier = 18;
				modifiedItem.system.splashDamage.value = 7;
				modifiedItem.system.bonus.value = 2;
				break;
			case "major":
				modifiedItem.system.level.value = 15;
				modifiedItem.system.damage.dice = 8;
				modifiedItem.system.damage.modifier = 21;
				modifiedItem.system.splashDamage.value = 8;
				modifiedItem.system.bonus.value = 3;
				break;
			case "true":
				modifiedItem.system.level.value = 19;
				modifiedItem.system.damage.dice = 10;
				modifiedItem.system.damage.modifier = 27;
				modifiedItem.system.splashDamage.value = 10;
				modifiedItem.system.bonus.value = 3;
				break;
			default:
				debugLog(3, "craftHealingBomb() | Healing Quick Vial not found in compendium.");
				return;
		}

		if (elixir.system.traits.value.includes("infused")) {
			modifiedItem.system.traits.value.push("infused"); // Add infused trait
		}

		const newQty = elixir.system.quantity - 1;
		if (newQty <= 0) {
			await elixir.delete();
		} else {
			await elixir.update({ "system.quantity": newQty });
		}

		// // Add the item to the actor's inventory
		const createdItem = await actor.createEmbeddedDocuments("Item", [modifiedItem]);
		debugLog(`craftHealingBomb() | Crafted `, createdItem);
		await throwBomb(createdItem[0]);

	} catch (error) {
		debugLog(3, "craftHealingBomb() | Error retrieving Healing Quick Vial from compendium: ", error);
	}
}

//	Function to display Double Brew content in dialogs
function getDoubleBrewFormContent({ actor, doubleBrewFeat, isArchetype }) {
	let content = "";

	if (!doubleBrewFeat) return content;

	const vialCount = getVersatileVialCount(actor);
	if (vialCount > 1) {
		// Return a promise for async processing of formulas
		return processFormulasWithProgress(actor).then(({ weaponOptions, consumableOptions }) => {
			return `
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
				<br/>`;
		});
	} else if (!isArchetype) {
		// Static option to create a versatile vial
		content = `
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
			</form><br/>`;
	}

	return Promise.resolve(content); // Always return a Promise for consistency
}

//	Function to display healing bomb dialog
async function displayHealingBombDialog(actor, alreadyCrafted = false, elixir = null) {
	async function displayInventorySelectDialog(actor, filteredEntries) {
		debugLog(`displayInventorySelectDialog() | actor: ${actor.name}`);
		var options = filteredEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");
		let content = `
						<form>
							<div>
								<h3 style="text-align:center;padding-bottom:10px;">${LOCALIZED_TEXT.HEALING_BOMB_SELECT_INVENTORY}</h3>
								<select id="item-selection" name="item-selection" style="display: inline-block;margin-top: 5px; overflow-y: auto;">${options}</select>
								<br/><br/>
							</div>
						</form>`;

		const buttons = [
			{
				action: "crafthealingbomb",
				label: LOCALIZED_TEXT.HEALING_BOMB_CRAFT,
				icon: "fas fa-hammer",
				callback: async (event, button, dialog) => {
					if (!actor) {
						debugLog(`displayHealingBombDialog() | Actor not found.`);
						return;
					}
					var selectedUuid = button.form.elements["item-selection"]?.value || "none";
					craftHealingBomb(actor, selectedUuid);
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
				title: LOCALIZED_TEXT.HEALING_BOMB,
				// width: 450
			},
			classes: ["quick-alchemy-dialog"],
			content,
			buttons,
			default: "crafthealingbomb",
			render: (html) => {
				html.find('button:contains("Craft")').css({
					width: "100px",
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

	debugLog(`displayHealingBombDialog() |  actor: ${actor.name}`);
	if (!alreadyCrafted) {
		// Build main content 
		let content = `
						<form>
							<div>
								<h3 style="text-align:center;padding-bottom:10px;">${LOCALIZED_TEXT.HEALING_BOMB_SELECT_CRAFT_INVENTORY}</h3>
								<br/><br/>
							</div>
						</form>`;

		const buttons = [
			{
				action: "craft",
				label: LOCALIZED_TEXT.CRAFT,
				icon: "fas fa-hammer",
				callback: async (event, button, dialog) => {
					if (!actor) {
						debugLog(`displayHealingBombDialog() |  Actor not found`);
						return;
					}
					displayCraftingDialog(actor, "healing-bomb");
				}
			},
			{
				action: "inventory",
				label: LOCALIZED_TEXT.INVENTORY,
				icon: "fas fa-hammer",
				callback: async (event, button, dialog) => {
					if (!actor) {
						debugLog(`displayHealingBombDialog() |  Actor not found`);
						return;
					}
					debugLog(actor);
					const { filteredEntries } = await processFilteredInventoryWithProgress(actor, "consumable", "elixir-of-life");
					await displayInventorySelectDialog(actor, filteredEntries);
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
				title: LOCALIZED_TEXT.HEALING_BOMB,
				// width: 450
			},
			classes: ["quick-alchemy-dialog"],
			content,
			buttons,
			default: "inventory",
			render: (html) => {
				html.find('button:contains("Inventory")').css({
					width: "100px",
					height: "40px",
					fontSize: "14px"
				});
				html.find('button:contains("Craft")').css({
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
		return;
	} else {
		if (!elixir) {
			const { filteredEntries } = await processFilteredInventoryWithProgress(actor, "consumable", "elixir-of-life");
			await displayInventorySelectDialog(actor, filteredEntries);
		} else {
			await craftHealingBomb(actor, elixir.uuid);
		}
	}
}

//	Function to display crafting dialog
async function displayCraftingDialog(actor, itemType) {

/*
	========== HELPER FUNCTIONS ==========
*/
	
	// Helper Function: build the <select> drop-down list dialog content for itemType = "food" or weapon/consumable
	async function qaBuildCraftingContent({ actor, itemType, entries, showDesc, descStyle }) {
		try {
			const options = entries.map(e => `<option value="${e.uuid}">${e.name}</option>`).join("");

			let initialDesc = "";
			if (showDesc && entries.length) {
				const initialUuid = entries[0]?.uuid ?? "";
				if (initialUuid) {
					const cached = qaDescCache.get(initialUuid);
					if (cached) {
						initialDesc = cached;
					} else {
						const initialItem = await qaGetItemForFormula(actor, initialUuid);
						const initialRaw  = initialItem?.system?.description?.value ?? `<em>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC}</em>`;
						initialDesc = await TextEditor.enrichHTML(initialRaw, {
							async: true,
							secrets: game.user.isGM,
							relativeTo: initialItem ?? undefined,
							rollData: initialItem?.getRollData?.() ?? {}
						});
						qaDescCache.set(initialUuid, initialDesc);
					}
				}
			}

			const content = `
				<form>
					${descStyle}
					<div class="qa-wrapper" style="min-width: 300px; max-width: 720px; width: 100%;">
						<h3>${LOCALIZED_TEXT.QUICK_ALCHEMY_SELECT_ITEM_TYPE(itemType)}:</h3>
						<select id="item-selection" name="item-selection"
								onchange="qaShowFormulaDescription(this.value)"
								style="display: inline-block; margin-top: 5px; overflow-y: auto; width: 100%;">${options}</select>
						<br/><br/>
						${showDesc ? `
							<hr/>
							<div id="qa-desc" class="editor-content" style="max-height: 40vh; overflow: auto; padding: .5em; border: 1px solid var(--color-border-light-primary); border-radius: 6px;">
								${initialDesc}
							</div>
						` : ""}
					</div>
				</form>
			`;
			return content;
		} catch (err) {
			debugLog(3, `qaBuildCraftingContent() | ${err?.message ?? err}`);
			return `<form><div class="qa-wrapper"><em>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC}</em></div></form>`;
		}
	}

	// Helper Function: render buttons 
	function qaAddCraftingButtons(html) {
		try {
			html.find('button:contains("Craft")').css({ width: "100px", height: "40px", fontSize: "14px" });
			html.find('button:contains("Attack")').css({ height: "40px", fontSize: "14px" });
			html.find('button:contains("Back")').css({ width: "50px", height: "40px", fontSize: "14px" });
		} catch (e) {
			debugLog(3, `qaAddCraftingButtons() | ${e?.message ?? e}`);
		}
	}

	// Helper Function: wrapper for DialogV2 call
	async function qaOpenCraftingDialog({ title, content, buttons, def = "craft" }) {
		return new foundry.applications.api.DialogV2({
			window: { title },
			classes: ["quick-alchemy-dialog"],
			content,
			buttons,
			default: def,
			render: qaAddCraftingButtons
		}).render(true);
	}
/*
	========== END HELPER FUNCTIONS ==========
*/

	debugLog(`displayCraftingDialog() | actor: ${actor.name} | itemType: ${itemType}`);

	// Check if actor has double brew feat
	const { isArchetype } = isAlchemist(actor);
	const doubleBrewFeat = hasFeat(actor, "double-brew");
	debugLog(`displayCraftingDialog() | doubleBrewFeat: ${doubleBrewFeat}`);
	let content = ``;
	let options = "";
	let selectedUuid = "";
	let dbSelectedUuid = "";
	let craftItemButtons = {};
	let consumeVialButtons = {};
	let newItemSlug = "";
	let selectedType = "acid"; // default to acid
	let specialIngredient = "none";
	// get show formula description setting
	const showDesc = game.settings.get("pf2e-alchemist-remaster-ducttape", "showFormulaDescription");
	//	Description Style
	const descStyle = `
		<style>
			.quick-alchemy-dialog .qa-wrapper {
				width: 600px;           
				max-height: 800px;
				overflow-y: auto;
				padding-right: 1em;
			}
			.quick-alchemy-dialog .qa-wrapper select {
				width: 100%;
			}
			.quick-alchemy-dialog #qa-desc {
				max-height: 800px;
				overflow: auto;
				padding: .5em;
				border: 1px solid var(--color-border-light-primary);
				border-radius: 6px;
			}
			
			.quick-alchemy-dialog #qa-desc img { max-width: 100%; height: auto; }
			.quick-alchemy-dialog #qa-desc table { width: 100%; display: block; overflow: auto; }
			.quick-alchemy-dialog #qa-desc pre, 
			.quick-alchemy-dialog #qa-desc code { white-space: pre-wrap; word-break: break-word; }
		</style>`;
	
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
			debugLog(3, "displayCraftingDialog() | Compendium not found.");
			return;
		}

		// Get vial item from uuid of Quick Vial item from module compendium
		const item = await fromUuid(uuid);
		if (!item) {
			debugLog(3, `displayCraftingDialog() | No item found for quick vial using UUID: ${uuid}`);
			return;
		}
		debugLog(`displayCraftingDialog() | actor: ${actor.name} |itemType: ${itemType} | uuid: ${uuid} | item name: ${item.name}`);

		//	Helper function to determine damage type based on target 
		//	resistances, immunities, and weaknesses
		async function getBestDamageType(target) {
			// Ensure the target and syntheticActor exist
			if (!target?.document?.delta?.syntheticActor?.system?.attributes) {
				debugLog(`displayCraftingDialog() | Target or synthetic actor attributes not found.`);
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
				if (game.user.isGM) debugLog(`getBestDamageType() | Target is immune to poison selecting acid damage. | Poison Modifier = ${poisonModifier} | Acid Modifier = ${acidModifier}`);
			} else {
				bestDamageType = "poison";
				if (game.user.isGM) debugLog(`getBestDamageType() | Poison is more effective | Poison Modifier = ${poisonModifier}, Acid Modifier = ${acidModifier}`);
			}
			debugLog(`getBestDamageType() | Best damage type determined: ${bestDamageType}`);
			return bestDamageType;
		}

		// If actor has chirurgeon feat
		if (hasFeat(actor, "chirurgeon")) {
			const userConfirmed = await foundry.applications.api.DialogV2.confirm({
				content: `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_CRAFT_HEALING_VIAL}</p>`,
				window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_CHIRURGEON },
				classes: ["quick-alchemy-dialog"],
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
		debugLog(`displayCraftingDialog() | Feat 'bomber' detected.`);

			// Prompt for damage type
			selectedType = await foundry.applications.api.DialogV2.prompt({
				window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_FIELD_VIAL_BOMBER },
				classes: ["quick-alchemy-dialog"],
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
				debugLog(`displayCraftingDialog() | Feat 'advanced-vials-bomber' detected.`);
				specialIngredient = await foundry.applications.api.DialogV2.prompt({
					window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_ADV_VIAL_BOMBER },
					classes: ["quick-alchemy-dialog"],
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
			debugLog(`displayCraftingDialog() | Toxicologist feat detected | vial damage type changed to ${selectedType}`);

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
					debugLog(`craftInjuryPoison() | No valid weapons available to apply poison.`);
					return;
				}

				// Let the player select a weapon
				const selectedWeapon = await new Promise((resolve) => {
					new foundry.applications.api.DialogV2({
						window: { title: LOCALIZED_TEXT.INJURY_POISON },
						classes: ["quick-alchemy-dialog"],
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
					debugLog(`craftInjuryPoison() | No weapon selected for poison application.`);
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
						debugLog(3, `craftInjuryPoison() | Error performing attack roll with temporary weapon:`, err);
						ui.notifications.error(LOCALIZED_TEXT.NOTIF_FAIL_ATK_TEMP_POISONED_WPN);
					}
				} else {
					debugLog(`craftInjuryPoison() | Failed to create temporary poisoned weapon.`);
				}
			}

			// Prompt for injury poison or Quick Vial bomb
			const isInjuryPoison = await new Promise((resolve) => {
				new foundry.applications.api.DialogV2({
					window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_TOXICOLOGIST_OPTIONS },
					classes: ["quick-alchemy-dialog"],
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

			debugLog(`displayCraftingDialog() | selectedType: ${selectedType} | uuid: ${uuid}`);

			if (isInjuryPoison) {
				debugLog(`displayCraftingDialog() | Creating vial as an injury poison.`);

				craftInjuryPoison(actor, selectedType);
				return;
			}
		}

		// Check if actor has mutagenist feat
		if (hasFeat(actor, "advanced-vials-mutagenist")) {
			debugLog(`displayCraftingDialog() | Advanced Vials Mutagenist feat detected!`);
			async function applyEffectFromCompendium(actor) {
				// Define the exact effect UUID
				const effectUUID = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.0Zpa9OfNcTUlNc2t";

				// Get the effect document from the compendium
				const effect = await fromUuid(effectUUID);

				if (!effect) {
					debugLog(3, "displayCraftingDialog() | Failed to retrieve effect from compendium.");
					return;
				}

				// Apply the effect to the actor
				const newEffect = duplicate(effect.toObject());
				await actor.createEmbeddedDocuments("Item", [newEffect]);

				debugLog(1, `displayCraftingDialog() | Applied effect "${newEffect.name}" to ${actor.name}`);
				ui.notifications.info(LOCALIZED_TEXT.NOTIF_APPLY_EFFECT_ACTOR(newEffect.name, actor.name));
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
					classes: ["quick-alchemy-dialog"],
					content: `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_CONSUME_VIAL}</p>`,
					buttons,
					default: "qv"
				}).render(true);
			});


		}

		debugLog(`displayCraftingDialog() | uuid: ${uuid}`);
		// Build HTML Content
		let content = `<form>
				<div>
					<select id="item-selection" name="item-selection" style="display: none;">
						<option value="${uuid}">Quick Vial</option>
					</select>
				</div>`;
		
		// Show Double Brew content (if applicable)
		const doubleBrewContent = await getDoubleBrewFormContent({ actor, doubleBrewFeat, isArchetype });
		content += doubleBrewContent;

		content += `</form>`;

		const buttons = [
			{
				action: "craftAttack",
				label: LOCALIZED_TEXT.CRAFT_ATTACK,
				icon: "fas fa-bomb",
				callback: async (event, button, dialog) => {
					if (!actor) {
						debugLog(`displayCraftingDialog() | Actor not found`);
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

					debugLog(`displayCraftingDialog() | selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
					craftAttackButton(actor, selectedUuid, dbSelectedUuid, itemType, selectedType, specialIngredient);
				}
			},
			{
				action: "craft",
				label: LOCALIZED_TEXT.CRAFT,
				icon: "fas fa-hammer",
				callback: async (event, button, dialog) => {
					if (!actor) {
						debugLog(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
						return;
					}

					selectedUuid = button.form.elements["item-selection"]?.value || "none";
					dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";

					debugLog(`displayCraftingDialog() | selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
					craftButton(actor, selectedUuid, dbSelectedUuid, itemType, { selectedType: selectedType, specialIngredient: specialIngredient });
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
				title: LOCALIZED_TEXT.QUICK_ALCHEMY,
				// width: 450
			},
			classes: ["quick-alchemy-dialog"],
			content,
			buttons,
			default: "craftAttack",
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

	} else if (itemType === "healing-bomb") { //	We are crafting Healing Bomb
		
		// Get list of filtered entries
		const { filteredEntries } = await processFilteredFormulasWithProgress(actor, "consumable", "elixir-of-life");
		options = filteredEntries.map(entry => `<option value="${entry.uuid}">${entry.name}</option>`).join("");

		let content = `
			<form>
				<div style="min-width: 300px; max-height: 70vh; overflow-y: auto; padding-right: 1em;">
					<h3>${LOCALIZED_TEXT.QUICK_ALCHEMY_SELECT_ITEM_TYPE("Elixir of Life")}:</h3>
					<select id="item-selection" name="item-selection" style="display: inline-block;margin-top: 5px; overflow-y: auto;">${options}</select>
					<br/><br/>
		`;

		debugLog(`displayCraftingDialog() | ${actor.name} wants to make a healing bomb`);
		
		// Show Double Brew content (if applicable)
		const doubleBrewContent = await getDoubleBrewFormContent({ actor, doubleBrewFeat, isArchetype });
		content += doubleBrewContent;
		content += `</div></form>`;

		const buttons = [{
			action: "craft",
			label: LOCALIZED_TEXT.CRAFT,
			icon: "fas fa-hammer",
			callback: async (event, button, dialog) => {
				if (!actor) {
					ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
					return;
				}
				selectedUuid = button.form.elements["item-selection"]?.value || "none";
				dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";
				
				var temporaryitem = await craftButton(actor, selectedUuid, dbSelectedUuid, itemType, {sendMsg: false});
				displayHealingBombDialog(actor, true, temporaryitem);
			}
		},
		{
			action: "back",
			label: LOCALIZED_TEXT.BACK,
			icon: "fas fa-arrow-left",
			callback: () => qaDialog(actor)
		}];

		// Show dialog
		new foundry.applications.api.DialogV2({
			window: {
				title: LOCALIZED_TEXT.QUICK_ALCHEMY,
				// width: 450
			},
			classes: ["quick-alchemy-dialog"],
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
		
	//	We are crafting alchemical-food items
	} else {
		
		// Get list of alchemical entries matching itemType
		const { filteredEntries } = await processFilteredFormulasWithProgress(actor, itemType);
		debugLog(`displayCraftingDialog() | filteredEntries: ${filteredEntries}`);
		
		window.qaCurrentActorForQA = actor;	// let the updater know which actor to use
		await qaPrimeDescCache(actor, filteredEntries);	// warm description cache for all options
		
		// Build Content
		const content = await qaBuildCraftingContent({
			actor,
			itemType,
			entries: filteredEntries,
			showDesc,
			descStyle
		});

		let buttons = [];

		if (itemType === "food") { // Build food buttons
		
			// Build Food buttons 
			buttons = [
				{
					action: "craft",
					label: LOCALIZED_TEXT.CRAFT,
					icon: "fas fa-hammer",
					callback: async (event, button, dialog) => {
						if (!actor) {
							ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
							return;
						}
						selectedUuid = button.form.elements["item-selection"]?.value || "none";
						dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";
						debugLog(`displayCraftingDialog() | selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
						craftButton(actor, selectedUuid, dbSelectedUuid, itemType);
					}
				},
				{
					action: "Cancel",
					label: LOCALIZED_TEXT.BTN_CANCEL,
					icon: "fa-solid fa-xmark",
					callback: (_event, _button, dialog) => dialog.close()
				}
			];

		} else { // Build Weapons/Consumables buttons

			// Attack button if itemType === "weapon"
			if (itemType === "weapon") {
				buttons.push({
					action: "craftAttack",
					label: LOCALIZED_TEXT.CRAFT_ATTACK,
					icon: "fas fa-bomb",
					callback: async (event, button, dialog) => {
						if (!actor) {
							debugLog(`displayCraftingDialog() | Actor not found.`);
							return;
						}
						const target = game.user.targets.size > 0 ? [...game.user.targets][0] : null;
						if (!target) {
							ui.notifications.error(LOCALIZED_TEXT.NOTIF_PLEASE_TARGET);
							displayCraftingDialog(actor, "weapon");
							return;
						}
						selectedUuid = button.form.elements["item-selection"]?.value || "none";
						dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";
						debugLog(`displayCraftingDialog() | selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
						craftAttackButton(actor, selectedUuid, dbSelectedUuid, itemType);
					}
				});
			}

			//Craft Button
			buttons.push({ 
				action: "craft",
				label: LOCALIZED_TEXT.CRAFT,
				icon: "fas fa-hammer",
				callback: async (event, button, dialog) => {
					if (!actor) {
						ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
						return;
					}
					selectedUuid = button.form.elements["item-selection"]?.value || "none";
					dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";
					debugLog(`displayCraftingDialog() | selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
					craftButton(actor, selectedUuid, dbSelectedUuid, itemType);
				}
			});

			// Back Button
			buttons.push({
				action: "back",
				label: LOCALIZED_TEXT.BACK,
				icon: "fas fa-arrow-left",
				callback: () => qaDialog(actor)
			});

		}
		
		// show crafting Dialog
		await qaOpenCraftingDialog({
			title: LOCALIZED_TEXT.QUICK_ALCHEMY,
			content,
			buttons,
			def: "craft"
		});
	}
}

//	Function to display Quick Alchemy Dialog
async function qaDialog(actor) {

	//	First we will check how many versatile vials actor has,
	//	if they have none we will prompt them to search for 10
	//	minutes, unless they are archetype. 
	
	const vialCount = getVersatileVialCount(actor);
	debugLog(`qaDialog() | Versatile Vial count for ${actor.name}: ${vialCount}`);

	let content = "";
	const buttons = [];

	if (vialCount < 1) {
		content += `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_VV}</p>`;
		if (!isArchetype) content += `${LOCALIZED_TEXT.QUICK_ALCHEMY_10_MIN}<br/><br/>`;

		buttons.push({
			action: "ok",
			label: LOCALIZED_TEXT.OK,
			icon: "fas fa-check",
			callback: () => { } // just closes
		}, {
			action: "vial",
			label: LOCALIZED_TEXT.QUICK_VIAL,
			icon: "fas fa-vial",
			callback: () => displayCraftingDialog(actor, 'vial')
		});
		
		// Add Healing Bomb button if actor has feat
		if (hasFeat(actor, "healing-bomb")){
			buttons.push({
				action: "healing-bomb",
				label: LOCALIZED_TEXT.HEALING_BOMB,
				icon: "fas fa-hospital",
				callback: () => displayHealingBombDialog(actor)
			});
		}
		
		// Help Button
		if (getSetting("showQuickAlchemyHelp")){
			buttons.push({
				action: "help",
				label: ``,
				icon: "fas fa-book-open",
				callback: async () => {
					const uuid = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-journal.JournalEntry.wrCXMx4U8bqUaG51";
					const journal = await fromUuid(uuid);
					if (journal?.sheet) journal.sheet.render(true);
					else ui.notifications.warn("Journal entry not found.");
				}
			});
		}
	} else {
		content += `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_PROMPT_TYPE}</p>`;

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
		});
		// Add Healing Bomb button if actor has feat
		if (hasFeat(actor, "healing-bomb")){
			buttons.push({
				action: "healing-bomb",
				label: LOCALIZED_TEXT.HEALING_BOMB,
				icon: "fas fa-hospital",
				callback: () => displayHealingBombDialog(actor)
			});
		}
		// Help Button
		if (getSetting("showQuickAlchemyHelp")){
			buttons.push({
				action: "help",
				label: ``,
				icon: "fas fa-book-open",
				callback: async () => {
					const uuid = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-journal.JournalEntry.wrCXMx4U8bqUaG51";
					const journal = await fromUuid(uuid);
					if (journal?.sheet) journal.sheet.render(true);
					else ui.notifications.warn("Journal entry not found.");
				}
			});
		}
	}

	new foundry.applications.api.DialogV2({
		window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY_PROMPT_ITEM_TYPE },
		content,
		buttons,
		classes: ["quick-alchemy-dialog"],
		default: "vial",
		render: (app, html) => {
			const link = html[0].querySelector("#qa-help-link");
			if (!link) return;

			link.addEventListener("click", async () => {
				const uuid = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-journal.JournalEntry.wrCXMx4U8bqUaG51";
				const journal = await fromUuid(uuid);
				if (journal?.sheet) journal.sheet.render(true);
				else ui.notifications.warn("Journal entry not found from UUID.");
			});
		}

	}).render(true);
}

//	Main crafting function
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

	//	Check for Wandering Chef dedication
	if (hasFeat(actor, "wandering-chef-dedication")) {
		debugLog(1,`${actor.name} has Wandering Chef Dedication — skipping to food crafting dialog.`);
		return displayCraftingDialog(actor, "food");
	}
	
	//	Make sure selected token is an alchemist or has archetype
	const alchemistCheck = isAlchemist(actor);
	if (!alchemistCheck.qualifies) {
		debugLog(`qaCraftAttack() | Selected Character ( ${actor.name} ) is not an Alchemist - Ignoring`);
		ui.notifications.warn(LOCALIZED_TEXT.NOTIF_SELECT_ALCHEMIST);
		return;
	}

	// Check if character is archetype for features. 
	isArchetype = alchemistCheck.isArchetype;

	// Delete any items with "infused" tag and 0 qty
	await clearInfused(actor);

	qaDialog(actor);

}