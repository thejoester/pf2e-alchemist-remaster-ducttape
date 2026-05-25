console.log("%cPF2e Alchemist Remaster Duct Tape | HealingBomb.js loaded","color: aqua; font-weight: bold;");
import { debugLog, hasFeat, getSetting } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";

// Creates a synthetic chat message for an errata-mode auto-hit Healing Bomb throw.
// item is optional; if omitted the first Healing Bomb on the actor is used.
export async function throwHealingBomb(actor, item = null) {
	if (!item) item = actor.items.find(i => i.name.includes("Healing Bomb"));
	if (!item) {
		ui.notifications.warn("No Healing Bomb item found on this actor.");
		return;
	}

	const targets = [...game.user.targets];
	if (targets.length === 0) {
		ui.notifications.warn(LOCALIZED_TEXT.HEALING_BOMB_NO_TARGET);
		return;
	}

	const targetToken = targets[0];
	const targetUuid = targetToken.document.uuid;

	// Range check: errata rules limit the throw to 20 feet. Warn in chat but allow anyway.
	let rangeWarning = "";
	const sourceToken = actor.getActiveTokens(true)[0];
	if (sourceToken) {
		const distance = canvas.grid.measurePath([sourceToken.center, targetToken.center]).distance;
		debugLog(1, `[Healing Bomb] Range check: ${Math.round(distance)} ft to ${targetToken.name}`);
		if (distance > 20) {
			rangeWarning = `<p class="ardt-range-warning">${LOCALIZED_TEXT.HEALING_BOMB_OUT_OF_RANGE}</p>`;
		}
	}

	// Build minimal PF2e-style chat card HTML so the renderChatMessage hook
	// can overwrite traits and inject healing buttons as normal.
	const content = `
		<header class="card-header flexrow">
			<img src="${item.img}" style="flex:0 0 36px;border:none;margin-right:5px" />
			<span class="flavor-text">
				<h4 class="action"><strong>${item.name}</strong></h4>
				<div class="traits"></div>
			</span>
		</header>
		${rangeWarning}
	`;

	debugLog(1, `[Healing Bomb] Errata throw: ${actor.name} -> ${targetToken.name} (${targetUuid})`);

	await ChatMessage.create({
		content,
		speaker: ChatMessage.getSpeaker({ actor }),
		flags: {
			pf2e: {
				origin: { uuid: `Actor.${actor.id}.Item.${item.id}` },
				context: {
					domains: ["healing-bomb-ardt-attack"],
					target: { token: targetUuid },
					outcome: "success"
				}
			}
		}
	});
}

// Hook to modify actor sheet buttons
Hooks.on("renderActorSheet", (app, html, data) => {
	const actor = app.actor;
	if (!actor) return;

	const useErrata = getSetting("healingBombPC2Errata");

	const $html = $(html);
	$html.find("ol.actions-list.item-list.directory-list.strikes-list>li").each((index, element) => {
		const name = $(element).find("section>h4.name>a").text();
		if (name.includes("Healing Bomb")) {
			if (useErrata) {
				// PC2 Errata: Healing Bomb is an Interact action - auto-hit, no Strike roll or MAP.
				// Remove damage/crit buttons and 2nd/3rd attack variants (MAP doesn't apply).
				$(element).find("button[data-action=strike-damage]").remove();
				$(element).find("button[data-action=strike-critical]").remove();
				$(element).find("[data-action=strike-attack][data-variant-index='1']").remove();
				$(element).find("[data-action=strike-attack][data-variant-index='2']").remove();
				// Relabel the first attack button from "Strike" to "Throw"
				$(element).find("button[data-action=strike-attack][data-variant-index='0'] span.name").text(LOCALIZED_TEXT.HEALING_BOMB_THROW);
				// Intercept all remaining strike-attack clicks (image div + first variant button)
				$(element).find("[data-action=strike-attack]").on("click", async (e) => {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					await throwHealingBomb(actor);
				});
			} else {
				// Original rules: strike roll required - remove only damage/crit buttons,
				// leave attack roll buttons untouched.
				$(element).find("button[data-action=strike-damage]").remove();
				$(element).find("button[data-action=strike-critical]").remove();
			}
		}
	});
});

// Hook to add healing buttons to chat message
Hooks.on('renderChatMessage', async (message, html) => {
	const origin = message.flags.pf2e?.origin?.uuid?.split(".");
	if (!origin || !message.flags.pf2e?.context?.domains?.includes("healing-bomb-ardt-attack")) return;
	debugLog(1, "[Healing Bomb] renderChatMessage triggered for ", game.user.name, " on message ", message.id);
	
	const actor = game.actors.get(origin[1]);
	const item = actor?.items.get(origin[3]);
	if (!actor || !item) return;

	// Close the Strike popout window if it's open
	for (const app of Object.values(ui.windows)) {
		const id = app._element?.[0]?.id ?? "";
		if (id.startsWith("AttackPopout-") && app.options?.type === "strike") {
			debugLog(1, `[Healing Bomb] Closing attack popout: ${id}`);
			app.close();
		}
	}

	const targetUuid = message.flags?.pf2e?.context?.target?.token ?? message.flags?.pf2e?.context?.target?.actor;
	const targetDoc = await fromUuid(targetUuid);
	const targetActor = targetDoc?.actor ?? targetDoc;
	const token = targetDoc?.isToken ? targetDoc : targetActor?.getActiveTokens()[0];
	if (!targetActor) return;
	
	const isGM = game.user.isGM;
	const isTargetOwner = targetDoc?.testUserPermission?.(game.user, "OWNER") ?? false;
	const healDisabled = isGM || isTargetOwner ? "" : "disabled";
	const splashDisabled = isGM ? "" : "disabled";
	const failDisabled = isGM || isTargetOwner ? "" : "disabled";

	const outcome = message.flags.pf2e?.context?.outcome;
	const $html = $(html);

	// Setup localization for trait tags
	const tagHealing = game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.HEALING_BOMB_TRAIT_HEALING");
	const tagManipulate = game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.HEALING_BOMB_TRAIT_MANIPULATE");
	const tagAlchemical = game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.HEALING_BOMB_TRAIT_ALCHEMICAL");
	const tagConsumable = game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.HEALING_BOMB_TRAIT_CONSUMABLE");
	const tagSplash = game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.HEALING_BOMB_TRAIT_SPLASH");
	const tagRangeInc30 = game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.HEALING_BOMB_TRAIT_RANGE30");

	// Overwrite traits
	$html.find("header>span.flavor-text>h4.action>strong").text(LOCALIZED_TEXT.HEALING_BOMB_TITLE);
	$html.find("header>span.flavor-text>div.traits").html(`
		<span class="tag" data-slug="healing">${tagHealing}</span>
		<span class="tag" data-slug="manipulate">${tagManipulate}</span>
		<span class="tag tag_alt" data-slug="alchemical">${tagAlchemical}</span>
		<span class="tag tag_alt" data-slug="consumable">${tagConsumable}</span>
		<span class="tag tag_alt" data-slug="splash">${tagSplash}</span>
		<span class="tag tag_secondary" data-slug="range-increment-30">${tagRangeInc30}</span>
	`);
	$html.find("div.message-content").addClass("pf2e chat-card");

	// Construct healing buttons
	let healingButtons = `<section class="card-buttons">`;

	if (outcome === "success" || outcome === "criticalSuccess") {
		const isChirurgeon = hasFeat(actor, "greater-field-discovery-chirurgeon") && item.system.traits.value.includes("infused");
		const splash = parseInt(item.system.splashDamage.value || 0);
		const formula = `${item.system.damage.dice}${item.system.damage.die} + ${item.system.damage.modifier}`;

		if (isChirurgeon) {
			const dieSize = parseInt(item.system.damage.die.replace("d", ""));
			const maxHeal = item.system.damage.dice * dieSize + item.system.damage.modifier;
			healingButtons += `<button type="button" class="success" ${healDisabled} data-action="apply-healing-bomb" data-target="${targetUuid}" data-heal="${maxHeal}" data-splash="${splash}">${LOCALIZED_TEXT.HEALING_BOMB_BUTTON_CHIRURGEON}</button>`;
			healingButtons += `<button type="button" class="splash" ${splashDisabled} data-action="apply-splash-only" data-target="${targetUuid}" data-splash="${splash}">${LOCALIZED_TEXT.HEALING_BOMB_BUTTON_SPLASH}</button>`;
		} else {
			healingButtons += `<button type="button" class="success" ${healDisabled} data-action="roll-healing-bomb" data-target="${targetUuid}" data-formula="${formula}" data-splash="${splash}">${LOCALIZED_TEXT.HEALING_BOMB_BUTTON_HEAL}</button>`;
			healingButtons += `<button type="button" class="splash" ${splashDisabled} data-action="apply-splash-only" data-target="${targetUuid}" data-splash="${splash}">${LOCALIZED_TEXT.HEALING_BOMB_BUTTON_SPLASH}</button>`;
		}
	} else if (outcome === "failure") {
		const splash = parseInt(item.system.splashDamage.value || 0);
		healingButtons += `<button type="button" class="failure" ${failDisabled} data-action="apply-failure-healing" data-target="${targetUuid}" data-splash="${splash}">${LOCALIZED_TEXT.HEALING_BOMB_BUTTON_FAILURE}</button>`;

	}

	healingButtons += `</section>`;

	// Inject buttons into correct part of the message
	if (message.isReroll) {
		let rerollButtons = $html.find("div.reroll-second > div.message-buttons");
		if (!rerollButtons.length) {
			const container = $(`<div class="message-buttons">${healingButtons}</div>`);
			$html.find("div.reroll-second").append(container);
			debugLog(1, "[Healing Bomb] Created and injected missing reroll message-buttons container");
		} else {
			rerollButtons.html(healingButtons);
			debugLog(1, "[Healing Bomb] Injected buttons into reroll message-buttons");
		}
	} else {
		let normalButtons = $html.find("div.message-buttons");
		if (!normalButtons.length) {
			// Manually inject the missing container
			const container = $(`<div class="message-buttons">${healingButtons}</div>`);
			$html.find("div.message-content").append(container);
			debugLog(1, "[Healing Bomb] Created and injected missing message-buttons container");
		} else {
			normalButtons.html(healingButtons);
			debugLog(1, "[Healing Bomb] Injected buttons into normal message-buttons");
		}
	}

	// Button: Apply full healing
	$html.find("button[data-action='apply-healing-bomb']").on("click", async (event) => {
		const btn = event.currentTarget;
		const actorDoc = await fromUuid(btn.dataset.target);
		const actor = actorDoc?.actor;
		const token = actorDoc?.isToken ? actorDoc : actor?.getActiveTokens()[0];
		if (!actor) return;
		await actor.applyDamage({ damage: -parseInt(btn.dataset.heal), token, heal: true, skipIWR: true });
	});

	// Button: Roll healing
	$html.find("button[data-action='roll-healing-bomb']").on("click", async (event) => {
		const btn = event.currentTarget;
		const actorDoc = await fromUuid(btn.dataset.target);
		const actor = actorDoc?.actor;
		const token = actorDoc?.isToken ? actorDoc : actor?.getActiveTokens()[0];
		if (!actor) return;
		const roll = new Roll(btn.dataset.formula);
		await roll.evaluate({ async: true });
		await roll.toMessage({ flavor: `${LOCALIZED_TEXT.HEALING_BOMB_BUTTON_ROLLED}: ${roll.total}` });
		await actor.applyDamage({ damage: -roll.total, token, heal: true, skipIWR: true });
	});

	// Button: Apply splash healing
	$html.find("button[data-action='apply-splash-only']").on("click", async (event) => {
		debugLog(1, "[Healing Bomb] Splash button clicked");

		const btn = event.currentTarget;
		const tokenDoc = await fromUuid(btn.dataset.target);
		const originToken = tokenDoc?.object;

		if (!originToken || !originToken.actor) {
			debugLog(1, "[Healing Bomb] No origin token found.");
			return;
		}

		const splashHealing = parseInt(btn.dataset.splash);
		if (!splashHealing || isNaN(splashHealing)) {
			debugLog(1, "[Healing Bomb] Invalid splash value:", btn.dataset.splash);
			return;
		}

		const allowedTypes = ["character", "npc", "familiar", "eidolon"];
		const originX = originToken.document.x;
		const originY = originToken.document.y;
		const gridSize = canvas.grid.size;

		const nearby = canvas.tokens.placeables.filter(t => {
			if (!t.actor) return false;
			if (t.id === originToken.id) return false;
			if (!allowedTypes.includes(t.actor.type)) return false;
			if (t.actor.system.attributes.hp?.value <= 0) return false;

			const dx = Math.abs(t.document.x - originX) / gridSize;
			const dy = Math.abs(t.document.y - originY) / gridSize;
			const isAdjacent = Math.max(dx, dy) <= 1.5;

			if (!isAdjacent) {
				debugLog(1, `[Healing Bomb] Skipping ${t.name}: not adjacent (dx=${dx}, dy=${dy})`);
			}

			return isAdjacent;
		});

		debugLog(1, `[Healing Bomb] Found ${nearby.length} adjacent token(s) for splash healing.`);
		for (const t of nearby) debugLog(1, `[Healing Bomb] Healing ${t.name} for ${splashHealing}`);

		for (const token of nearby) {
			await token.actor.applyDamage({ damage: -splashHealing, token, heal: true, skipIWR: true });
		}

		if (nearby.length > 0) {
			const speaker = ChatMessage.getSpeaker({ token: originToken.document });
			await ChatMessage.create({
				speaker,
				content: `💧 <strong>${LOCALIZED_TEXT.HEALING_BOMB}</strong> ${LOCALIZED_TEXT.HEALING_BOMB_SPLASH_APPLIED} ${nearby.map(t => t.name).join(", ")} for ${splashHealing} HP.`
			});
		}
	});

	// Button: Failure healing (target only)
	$html.find("button[data-action='apply-failure-healing']").on("click", async (event) => {
		debugLog(1, "[Healing Bomb] Failure healing button clicked");

		const btn = event.currentTarget;
		const targetUuid = btn.dataset.target;
		const doc = await fromUuid(targetUuid);
		const token = doc instanceof TokenDocument ? doc.object : doc?.getActiveTokens?.()[0];
		if (!token) {
			debugLog(1, "[Healing Bomb] Could not resolve token.");
			return;
		}
		const actor = token.actor;
		if (!actor) {
			debugLog(1, "[Healing Bomb] Token has no associated actor.");
			return;
		}
		const splashStr = btn.dataset.splash;
		const splashHealing = parseInt(btn.dataset.splash);
		
		if (!splashHealing || isNaN(splashHealing)) {
			debugLog(1, "[Healing Bomb] Invalid splash healing value.");
			return;
		}

		debugLog(1, `[Healing Bomb] Applying ${splashHealing} healing to ${token.name}`);
		await actor.applyDamage({ damage: -splashHealing, token, heal: true, skipIWR: true });
	});
});