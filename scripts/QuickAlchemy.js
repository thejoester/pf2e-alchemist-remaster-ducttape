import { debugLog, getSetting, hasFeat, isAlchemist } from './settings.js';
import { getAlchIndex, setAlchIndex, qaGetIndexEntry } from "./AlchIndex.js";
import { LOCALIZED_TEXT } from "./localization.js";

let isArchetype = false;
let QA_TEXT_EDITOR;	// v13 Text editor
const acidVialId = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.9NXufURxsBROfbz1";
const poisonVialId = "Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.LqZyfGxtRGXEpzZq";

// simple HTML escaper for names
const qaEscape = (s) => String(s ?? "")
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;")
	.replace(/'/g, "&#39;");

Hooks.once("init", () => {
	// v13 text editor
	QA_TEXT_EDITOR = foundry.applications.ux.TextEditor.implementation;

});

//	DialogV2 opener
async function qaOpenDialogV2(opts) {
	const D2 = foundry.applications.api.DialogV2;
	return await D2.wait(opts);
}

// 	Clamp an ApplicationV2/DialogV2 window width (V13-safe) and also cap inner content.
function qaClampDialog(dialog, maxPx = 820) {
	try {
		const host = dialog?.element;
		if (!host) return;
		
		const w = Math.min(maxPx, Math.floor(window.innerWidth * 0.8));

		host.style.setProperty("--app-min-width", "320px");
		host.style.setProperty("--app-max-width", `${w}px`);
		host.style.setProperty("--app-width", `${w}px`);
		host.style.setProperty("--app-grow", "0"); // prevent stretching to full width
		host.style.setProperty("--app-padding", "12px");

		// Fallback inline width for older builds
		host.style.width = `min(80vw, ${w}px)`;
		host.style.maxWidth = `${w}px`;

		// Ask the framework to reposition with this width
		if (typeof dialog.setPosition === "function") {
			const pos = dialog.setPosition({ width: w }) || {};
			const width = pos.width ?? w;
			const left = Math.max(0, (window.innerWidth - width) / 2);
			dialog.setPosition({ left });
		}

		// Also cap the inner content so it never stretches
		const root = host.shadowRoot ?? host; 
		const content = root.querySelector(".window-content, .content, form");
		if (content) {
			content.style.maxWidth = "100%";
			content.style.width = "100%";
			content.style.margin = "0 auto";
			content.style.boxSizing = "border-box";
		}
		const wrap = root.querySelector(".qa-wrapper");
		if (wrap) {
			wrap.style.maxWidth = "100%";
			wrap.style.width = "100%";
			wrap.style.margin = "0";
			wrap.style.boxSizing = "border-box";
		}	
	} catch (err) {
		debugLog(3, `qaClampDialog() | ${err?.message ?? err}`);
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

//	Hook for item use chat messages with coagulant trait
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
	
	/*
	//	Preload compendium
	try {
		await game.packs.get("pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items")?.getDocuments();
		debugLog(1, "Preloaded compendium: alchemist-duct-tape-items");
	} catch (err) {
		debugLog(3, "Error preloading compendium alchemist-duct-tape-items: ", err);
	}
	*/
	
	// Attach function to the global window object
	window.qaCraftAttack = qaCraftAttack;
	
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
	debugLog(`sendConsumableUseMessage(${itemUuid}) called`);
	const NS = "pf2e-alchemist-remaster-ducttape";
	let item = null;
	let name = "";
	let img = "";
	let description = "";
	let actor = null;
	let traits = [];

	// Branch: Compendium UUID - pulling from index
	if (itemUuid.startsWith("Compendium.")) {
		debugLog(`sendConsumableUseMessage() | Pulling from index`);
		const idx = game.settings.get(NS, "alchIndex") || {};
		const entry = idx.items?.[itemUuid] ?? null;

		if (entry) {
			name = entry.name ?? "(no name)";
			img = entry.img ?? "icons/svg/mystery-man.svg";
			description = entry.description ?? `<em>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC}</em>`;
			traits = entry.traits ?? [];
		} else {
			// fallback: actually load it
			item = await fromUuid(itemUuid);
			if (!item) {
				ui.notifications.warn(LOCALIZED_TEXT.NOTIF_ITEM_NOTFOUND);
				return;
			}
			name = item.name;
			img = item.img;
			description = item.system?.description?.value ?? "";
			traits = item.system?.traits?.value ?? [];
		}

	// Branch: Actor-owned item UUID
	} else if (itemUuid.startsWith("Actor.")) {
		debugLog(`sendConsumableUseMessage() | Pulling from item path`);
		item = fromUuidSync(itemUuid) ?? await fromUuid(itemUuid);
		if (!item) {
			ui.notifications.warn(LOCALIZED_TEXT.NOTIF_ITEM_NOTFOUND);
			return;
		}
		actor = item.actor ?? null;
		name = item.name;
		img = item.img;
		description = item.system?.description?.value ?? "";
		traits = item.system?.traits?.value ?? [];
	}

	// Extra: Coagulant note (same as before)
	const slug = item?.slug ?? "";
	const showCoagulantNote = (slug === "healing-quick-vial-temp" || traits.includes("coagulant"));
	let coagulantLink = "";
	if (showCoagulantNote) {
		const enrichedLink = await TextEditor.enrichHTML(
			"This applies @UUID[Compendium.pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items.Item.htVOAKfVmVYafFrQ]{Coagulant Immunity} for 10 minutes. " +
			"If the target is already under the effect of <strong>Coagulant Immunity</strong>, this healing has no effect.",
			{ async: true }
		);
		coagulantLink = `<div class="card-flavor">${enrichedLink}</div>`;
	}

	// Build Chat Content
	const collapseChatDesc = getSetting("collapseChatDesc");
	const itemId = item?.id ?? "";
	const actorId = actor?.id ?? "";

	const content = `
		<div class="pf2e chat-card item-card">
			<header class="card-header flexrow">
				<h3 class="chat-portrait-text-size-name-pf2e">
					<img src="${img}" alt="${name}" width="36" height="36" class="chat-portrait-image-size-name-pf2e">
					${name}
				</h3>
			</header>

			${coagulantLink}

			${collapseChatDesc ? `
				<div class="collapsible-message">
					<i class="fas fa-eye toggle-icon" style="cursor: pointer;"></i>
					<div class="collapsible-content" style="display: none;">
						<div class="card-content">
							<p>${description}</p>
						</div>
					</div>
				</div>
			` : `
				<div class="card-content">
					<p>${description}</p>
				</div>
			`}

			${actor ? `
				<div class="card-buttons">
					<button type="button" class="use-consumable" data-item-id="${itemId}" data-actor-id="${actorId}">
						${LOCALIZED_TEXT.BTN_USE}
					</button>
				</div>
			` : ""}
		</div>
	`;

	// Post Chat Message
	ChatMessage.create({
		user: game.user.id,
		speaker: { alias: LOCALIZED_TEXT.QUICK_ALCHEMY, actor: actor?.id ?? null },
		content
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

//	Function to create chat message after creating Quick Vial prompting to 
//	attack or open QuickAlchemy dialog
async function sendVialAttackMessage(itemUuid, actor) {
	
	//Log the UUID
	debugLog(`sendVialAttackMessage(${itemUuid}, actor) `);

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
			// ---------- INDEX FIRST, THEN ASYNC DOC FALLBACK ----------
			let entry = await qaGetIndexEntry(formula.uuid);

			if (!entry || !(entry?.traits?.length || entry?.system?.traits?.value?.length)) {
				try {
					entry = await fromUuid(formula.uuid);
				} catch (e) {
					debugLog(3, `processFormulasWithProgress() | fromUuid fallback failed for ${formula.uuid}: ${e?.message ?? e}`);
					entry = null;
				}
			}
			// ----------------------------------------------------------

			// Update progress
			progress++;
			const progressBar = document.getElementById("progress-bar");
			if (progressBar) progressBar.value = progress;

			// Check if entry is null
			if (!entry) {
				listProcessedFormulas += `\n-> entry ${formula.uuid} is null`;
				continue;
			}

			// Normalize slug to work for both index rows and full docs
			const itemSlug = entry?.slug ?? entry?.system?.slug ?? game?.pf2e?.system?.sluggify?.(entry?.name) ?? entry?.name ?? "";
			listProcessedFormulas += `\n-> slug: ${itemSlug} | uuid: ${entry.uuid ?? formula.uuid}`;

			// Skip versatile vial
			if (itemSlug === "versatile-vial") {
				listProcessedFormulas += ` | versatile-vial ... skipping`;
				continue;
			}

			// Pull traits (lowercased); support index rows (entry.traits) and full docs (system.traits.value)
			const traitsRaw =
				entry?.system?.traits?.value ??
				entry?.traits?.value ??			// some docs use this shape
				entry?.traits ??				// <- your AlchIndex rows store plain array here
				entry?._source?.system?.traits?.value ??
				[];
			const traits = Array.isArray(traitsRaw) ? traitsRaw.map(t => String(t).toLowerCase()) : [];
			const isAlchemical = traits.includes("alchemical");

			// For Double Brew, include ONLY alchemical weapons/consumables
			if (entry.type === "weapon") {
				if (!isAlchemical) {
					listProcessedFormulas += ` | skipped (weapon not alchemical)`;
					continue;
				}
				weaponEntries.push(entry);
				listProcessedFormulas += ` | added to weaponEntries`;
			} else if (entry.type === "consumable") {
				if (!isAlchemical) {
					listProcessedFormulas += ` | skipped (consumable not alchemical)`;
					continue;
				}
				consumableEntries.push(entry);
				listProcessedFormulas += ` | added to consumableEntries`;
			} else {
				// not a weapon/consumable
				listProcessedFormulas += ` | ignoring.`;
			}
		} catch (err) {
			debugLog(3, `\n -> processFormulasWithProgress() | error at i=${index}, uuid=${formula?.uuid}: ${err?.message ?? err}`);
			continue; // don’t let one item kill the whole run
		}
	}

	debugLog(`processFormulasWithProgress() | Processed Formulas:\n ${listProcessedFormulas}`);
	
	// Close progress dialog
	progressDialog.close();

	// Sort entries by name then level (ignoring text in parentheses)
	const sortEntries = (entriesToSort) => {
		entriesToSort.sort((a, b) => {
			const nameA = a.name.replace(/\s*\(.*?\)/g, "").trim();
			const nameB = b.name.replace(/\s*\(.*?\)/g, "").trim();
			const nameComparison = nameA.localeCompare(nameB);
			if (nameComparison !== 0) return nameComparison;
			const levelA = (a.system?.level?.value ?? a.level ?? 0);
			const levelB = (b.system?.level?.value ?? b.level ?? 0);
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
			let entry = await qaGetIndexEntry(formula.uuid);
			if (!entry || !(entry?.traits?.length || entry?.system?.traits?.value?.length)) {
				try {
					entry = await fromUuid(formula.uuid);
				} catch (e) {
					debugLog(3, `processFilteredFormulasWithProgress() | fromUuid fallback failed for ${formula.uuid}: ${e?.message ?? e}`);
					entry = null;
				}
			}

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
			const itemSlug = entry?.slug ?? entry?.system?.slug ?? entry?.name ?? "";
			const entryType = entry?.type ?? entry?.system?.type?.value ?? "";	
			const traitsRaw =
				entry?.system?.traits?.value ??
				entry?.traits?.value ??			// some docs
				entry?.traits ??				// ← your AlchIndex rows store plain array here
				entry?._source?.system?.traits?.value ??
				[];
			const traits = Array.isArray(traitsRaw) ? traitsRaw.map(t => String(t).toLowerCase()) : [];
			// debugLog(`${entry.name} traits = `, traits);
			const isAlchemical = traits.includes("alchemical");
			// debugLog(`isAlchemical = ${isAlchemical}`);
			
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
			} else if (entryType === type) {
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
		const levelA = (a.system?.level?.value ?? a.level ?? 0);
		const levelB = (b.system?.level?.value ?? b.level ?? 0);
		return levelB - levelA; // Otherwise, sort by item level descending
	});

	// TEMP DEBUG
	debugLog(`processFilteredFormulasWithProgress() | Returning ${filteredEntries.length} filteredEntries | slugs:\n ->[${filteredEntries.map(i => i.slug ?? i.system?.slug ?? i.name).join("\n ->")}]`);
	return { filteredEntries };

	// Close progress dialog - just in case
	progressDialog.close();
}

//	Function to process Filtered inventory with progress bar
//	This is to find Elixir of life to make Healing Bomb
async function processFilteredInventoryWithProgress(actor, type, slug) {
	
	//	Make sure type was passed
	if (!type) {
		debugLog(3, "processFilteredInventoryWithProgress() | No type passed!");
		return { filteredEntries: [] };
	}
	debugLog(`processFilteredInventoryWithProgress() | Filtering by type: ${type}`);

	const filteredEntries = [];
	const inventory = actor?.inventory?.contents;
	const inventoryCount = inventory.length;
	
	// Make sure there is inventory
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
					listProcessedInventory += `\n -> added ${item.slug} to filteredEntries`;
					filteredEntries.push(item);
				}
				continue;
			}
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
		const levelA = (a.system?.level?.value ?? a.level ?? 0);
		const levelB = (b.system?.level?.value ?? b.level ?? 0);
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
	debugLog(`elixir: `, elixir);
	if (!elixir) {
		debugLog(`craftHealingBomb() | Actor not found`);
		ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
		return;
	}
	const elixirStrength = (elixir.system?.slug ?? "").split("-").at(-1).toLowerCase();
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
		const compendiumIndex = await compendium.getIndex({ fields: ["system.slug"] });
		const healingItemEntry = compendiumIndex.find(e => e.system?.slug === "healing-bomb-ardt");
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
			<div>
				<h3>${LOCALIZED_TEXT.DOUBLE_BREW_FEAT}</h3>
				<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_DB_CRAFT_VV(vialCount)}</p>
				<label for="db-item-selection">${LOCALIZED_TEXT.DOUBLE_BREW}:</label>
				<select id="db-item-selection" name="db-item-selection">
					<option value="none">${LOCALIZED_TEXT.NONE}</option>
					<option value="Compendium.pf2e.equipment-srd.Item.ljT5pe8D7rudJqus">Versatile Vial</option>
				</select>
			</div>
			<br/>`;
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
								<h4 style="text-align:center;padding-bottom:10px;">${LOCALIZED_TEXT.HEALING_BOMB_SELECT_CRAFT_INVENTORY}</h4>
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
			/* v13-safe fallback tokens */
			:host, .quick-alchemy-dialog {
				--qa-border-color: var(--color-border,
					var(--color-border-light-primary, #6b7280)); /* fallback if theme var missing */
				--qa-card-bg: var(--app-background, transparent);
			}

			.quick-alchemy-dialog .qa-wrapper { width:100%; box-sizing:border-box; }
			.quick-alchemy-dialog .qa-wrapper select { width:100%; box-sizing:border-box; }

			/* card wrapper like v12 */
			.quick-alchemy-dialog .qa-card {
				border: 1px solid var(--qa-border-color);
				border-radius: 8px;
				padding: 10px;
				background: var(--qa-card-bg);
				box-sizing: border-box;
			}

			/* description box */
			.quick-alchemy-dialog #qa-desc {
				max-height: 40vh;
				overflow: auto;
				padding: .5em;
				border: 1px solid var(--qa-border-color);
				border-radius: 6px;
				box-sizing: border-box;
			}

			:where(.quick-alchemy-dialog) :where(#qa-desc) :where(.qa-desc-title) {
				font-size: 1.2em !important;     /* ~20% larger than body text */
				font-weight: 700 !important;      /* bold */
				line-height: 1.25 !important;
				text-decoration: underline !important;
				text-underline-offset: 2px !important;
				margin: 0 0 .4em 0 !important;    /* bit of spacing under the title */
				display: block !important;
			}

			.quick-alchemy-dialog #qa-desc img { max-width:100%; height:auto; }
			.quick-alchemy-dialog #qa-desc table { width:100%; display:block; overflow:auto; }
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
	
	} else if (itemType === "healing-bomb") { // We are crafting Healing Bomb
		
		// Get list of Elixir of Life formulas
		const { filteredEntries } = await processFilteredFormulasWithProgress(actor, "consumable", "elixir-of-life");
		const options = filteredEntries.map(e => `<option value="${e.uuid}">${e.name}</option>`).join("");
		
		debugLog(`displayCraftingDialog() | ${actor.name} wants to make a healing bomb`);

		// Build content (no description box for Healing Bomb)
		let content = `
			<form>
				${descStyle}
				<div class="qa-wrapper">
					<h3>${LOCALIZED_TEXT.QUICK_ALCHEMY_SELECT_ITEM_TYPE("Elixir of Life")}:</h3>
					<select id="item-selection" name="item-selection"
							style="display:inline-block;margin-top:5px;overflow-y:auto;width:100%;">
						${options}
					</select>
					<br/><hr/>
					${await getDoubleBrewFormContent({ actor, doubleBrewFeat, isArchetype })}
					<hr/>
				</div>
			</form>
		`;

		const buttons = [
			{
				action: "craft",
				label: LOCALIZED_TEXT.CRAFT,
				icon: "fas fa-hammer",
				callback: async (event, button, dialog) => {
					if (!actor) {
						ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
						return;
					}
					const selectedUuid   = button.form.elements["item-selection"]?.value || "none";
					const dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";

					const temporaryitem = await craftButton(actor, selectedUuid, dbSelectedUuid, itemType, { sendMsg: false });
					displayHealingBombDialog(actor, true, temporaryitem);
				}
			},
			{
				action: "back",
				label: LOCALIZED_TEXT.BACK,
				icon: "fas fa-arrow-left",
				callback: () => qaDialog(actor)
			}
		];

		// Show dialog
		await qaOpenDialogV2({
			window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY },
			classes: ["quick-alchemy-dialog"],
			content,
			buttons,
			default: "craft",
			render: (_event, dialog) => {
				try {
					// keep sizing consistent with the other branch
					if (typeof qaClampDialog === "function") qaClampDialog(dialog, 720);

					const host = dialog?.element;
					const root = host?.shadowRoot ?? host;
					if (!host || !root) return;

					// prevent inner wrapper from stretching beyond dialog
					const wrap = root.querySelector(".qa-wrapper");
					if (wrap) {
						wrap.style.maxWidth = "100%";
						wrap.style.width = "100%";
						wrap.style.margin = "0";
						wrap.style.boxSizing = "border-box";
					}

					// button sizing
					const craftBtn = root.querySelector('button[data-action="craft"]');
					const backBtn  = root.querySelector('button[data-action="back"]');
					if (craftBtn) {
						craftBtn.style.width = "100px";
						craftBtn.style.height = "40px";
						craftBtn.style.fontSize = "14px";
					}
					if (backBtn) {
						backBtn.style.width = "50px";
						backBtn.style.height = "40px";
						backBtn.style.fontSize = "14px";
					}
				} catch (err) {
					debugLog(3, `displayCraftingDialog() | heal-bomb render failed: ${err?.message ?? err}`);
				}
			}
		});
		
	} else { // food / consumable / weapon
		// Keep a handle for helpers that expect it
		window.qaCurrentActorForQA = actor;

		// Pull possible entries
		const { filteredEntries } = await processFilteredFormulasWithProgress(actor, itemType);
		debugLog(`displayCraftingDialog() | filteredEntries:`, filteredEntries);

		// Map for fast uuid -> entry lookup
		const entryMap = new Map(filteredEntries.map(e => [e.uuid, e]));

		// Build the <option>s
		const options = filteredEntries
			.map(e => `<option value="${e.uuid}">${e.name}</option>`)
			.join("");

		// Initial title + description (prefer the entry's baked text)
		let initialTitle = "";
		let initialDesc = "";

		if (showDesc && filteredEntries.length) {
			const firstUuid = filteredEntries[0].uuid;
			const first = entryMap.get(firstUuid);
			const name = first?.name ?? "";
			initialTitle = `<div class="qa-desc-title" style="font-size:1.2em;font-weight:700;line-height:1.25;text-decoration:underline;text-underline-offset:2px;margin:0 0 .4em 0;display:block;">${foundry.utils.escapeHTML(name)}</div>`;

			let html = null;

			try {
				// Pull from our index
				const idx = game.settings.get("pf2e-alchemist-remaster-ducttape", "alchIndex") ?? {};
				const entry = idx.items?.[firstUuid] ?? null;

				const raw =
					entry?.description ??
					first?.system?.description?.value ?? // safety if something slipped through
					`<em>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC} ${LOCALIZED_TEXT.QUICK_ALCHEMY_REOPEN_SHEET}</em>`;

				html = await QA_TEXT_EDITOR.enrichHTML(raw, {
					async: true,
					secrets: game.user.isGM,
					rollData: {}, // index entries don’t have getRollData
				});
			} catch (e) {
				debugLog(3, `initial enrich failed: ${e?.message ?? e}`);
			}

			initialDesc = html ?? `<em>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC}</em>`;
		}

		// Build dialog content (includes Double Brew for non-food)
		let content = `
			<form>
				${descStyle}
				<div class="qa-wrapper">
					<h3>${LOCALIZED_TEXT.QUICK_ALCHEMY_SELECT_ITEM_TYPE(itemType)}:</h3>
					<select id="item-selection" name="item-selection" style="display:inline-block;margin-top:5px;overflow-y:auto;width:100%;">
						${options}
					</select>
					<br/><br/>
					${showDesc ? `
						<hr/>
						<div id="qa-desc" class="editor-content"
							style="max-height:40vh;overflow:auto;padding:.5em;border:1px solid var(--color-border-light-primary);border-radius:6px;">
							${initialTitle}${initialDesc}
						</div>
					` : ""}
					<hr/>
					${itemType !== "food"
						? (await getDoubleBrewFormContent({ actor, doubleBrewFeat, isArchetype }))
						: ""
					}
					<hr/>
				</div>
			</form>
		`;

		// Buttons
		const buttons = [];
		if (itemType === "weapon") {
			buttons.push({
				action: "craftAttack",
				label: LOCALIZED_TEXT.CRAFT_ATTACK,
				icon: "fas fa-bomb",
				callback: async (event, button, dialog) => {
					if (!actor) return ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
					const target = game.user.targets.size > 0 ? [...game.user.targets][0] : null;
					if (!target) {
						ui.notifications.error(LOCALIZED_TEXT.NOTIF_PLEASE_TARGET);
						displayCraftingDialog(actor, "weapon");
						return;
					}
					const selectedUuid	= button.form.elements["item-selection"]?.value || "none";
					const dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";
					debugLog(`displayCraftingDialog() | selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
					craftAttackButton(actor, selectedUuid, dbSelectedUuid, itemType);
				}
			});
		}
		buttons.push({
			action: "craft",
			label: LOCALIZED_TEXT.CRAFT,
			icon: "fas fa-hammer",
			callback: async (event, button, dialog) => {
				if (!actor) return ui.notifications.error(LOCALIZED_TEXT.NOTIF_ACTOR_NOTFOUND);
				const selectedUuid	= button.form.elements["item-selection"]?.value || "none";
				const dbSelectedUuid = button.form.elements["db-item-selection"]?.value || "none";
				debugLog(`displayCraftingDialog() | selectedUuid: ${selectedUuid} | dbSelectedUuid: ${dbSelectedUuid}`);
				craftButton(actor, selectedUuid, dbSelectedUuid, itemType);
			}
		});
		buttons.push({
			action: "back",
			label: LOCALIZED_TEXT.BACK,
			icon: "fas fa-arrow-left",
			callback: () => qaDialog(actor)
		});

		// Open dialog and wire description updates (delegate on host)
		await qaOpenDialogV2({
			window: { title: LOCALIZED_TEXT.QUICK_ALCHEMY },
			classes: ["quick-alchemy-dialog"],
			content,
			buttons,
			default: "craft",
			render: (_event, dialog) => {
				try {
					if (typeof qaClampDialog === "function") qaClampDialog(dialog, 720);

					const host = dialog?.element;
					const root = host?.shadowRoot ?? host;
					if (!host || !root) return;

					// keep inner wrapper tight
					const wrap = root.querySelector(".qa-wrapper");
					if (wrap) {
						wrap.style.maxWidth = "100%";
						wrap.style.width = "100%";
						wrap.style.margin = "0";
						wrap.style.boxSizing = "border-box";
					}

					// resolve+render helper (entry → index → fallback)
					const renderDesc = async (uuid) => {
						if (!uuid) return;
						const descEl = root.querySelector("#qa-desc") || host.querySelector("#qa-desc");
						if (!descEl) return;

						// Avoid duplicate work
						if (descEl.dataset.uuid === uuid) return;
						descEl.dataset.uuid = uuid;

						// entry for name (comes from filteredEntries → entryMap)
						const entry = entryMap.get(uuid);
						const name  = entry?.name ?? "";

						// look up description from index
						let html = null;
						try {
							const idx = game.settings.get("pf2e-alchemist-remaster-ducttape", "alchIndex") ?? {};
							const ixEntry = idx.items?.[uuid] ?? null;

							const raw =
								ixEntry?.description ??
								`<em>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_DESC} ${LOCALIZED_TEXT.QUICK_ALCHEMY_REOPEN_SHEET}</em>`;

							html = await QA_TEXT_EDITOR.enrichHTML(raw, {
								async: true,
								secrets: game.user.isGM,
								rollData: {}, // index entries won’t have getRollData
							});
						} catch (e) {
							debugLog(3, `renderDesc enrich failed: ${e?.message ?? e}`);
						}

						// title inline style
						const titleInline =
							"font-size:1.2em;font-weight:700;line-height:1.25;text-decoration:underline;" +
							"text-underline-offset:2px;margin:0 0 .4em 0;display:block;";

						descEl.innerHTML = `${showDesc ? `<div class="qa-desc-title" style="${titleInline}">${foundry.utils.escapeHTML(name)}</div>` : ""}${html || ""}`;
					};


					// Initial paint
					requestAnimationFrame(() => {
						const select = root.querySelector("#item-selection") || host.querySelector("#item-selection");
						if (select) renderDesc(select.value);
					});

					// Delegate change on host to survive re-renders
					if (host._qaDelegatedChange) host.removeEventListener("change", host._qaDelegatedChange);
					host._qaDelegatedChange = (ev) => {
						const t = ev.target;
						if (t && t.id === "item-selection") renderDesc(t.value);
					};
					host.addEventListener("change", host._qaDelegatedChange, { passive: true });

					// button sizing
					const craftBtn  = root.querySelector('button[data-action="craft"]');
					const attackBtn = root.querySelector('button[data-action="craftAttack"]');
					const backBtn   = root.querySelector('button[data-action="back"]');
					if (craftBtn)  { craftBtn.style.width = "100px"; craftBtn.style.height = "40px"; craftBtn.style.fontSize = "14px"; }
					if (attackBtn) { attackBtn.style.height = "40px"; attackBtn.style.fontSize = "14px"; }
					if (backBtn)   { backBtn.style.width = "50px"; backBtn.style.height = "40px"; backBtn.style.fontSize = "14px"; }
				} catch (err) {
					debugLog(3, `displayCraftingDialog() | render (v13) failed: ${err?.message ?? err}`);
				}
			}
		});
	}

}

//	Function to display Quick Alchemy Dialog
async function qaDialog(actor) {
	window.qaCurrentActorForQA = actor;
	const vialCount = getVersatileVialCount(actor);
	debugLog(`qaDialog() | Versatile Vial count for ${actor.name}: ${vialCount}`);

	let content = "";
	const buttons = [];

	//	First we will check how many versatile vials actor has,
	//	if they have none we will prompt them to search for 10
	//	minutes, unless they are archetype. 
	if (vialCount < 1) { //	If vial count is less than 1
		content += `<p>${LOCALIZED_TEXT.QUICK_ALCHEMY_NO_VV}</p>`;
		if (!isArchetype) content += `${LOCALIZED_TEXT.QUICK_ALCHEMY_10_MIN}<br/><br/>`;

		// Buttons
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
	window.qaCurrentActorForQA = actor;
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