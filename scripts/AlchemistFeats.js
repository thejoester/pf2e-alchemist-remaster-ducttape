import { debugLog, getSetting, hasFeat, isAlchemist, hasActiveOwners  } from './settings.js';
import { qaOpenDialogV2, qaClampDialog, qaCraftAttack, getVersatileVialCount, consumeVersatileVial, sendConsumableUseMessage, sendWeaponAttackMessage } from "./QuickAlchemy.js";
import { qaGetIndexEntry } from "./AlchIndex.js";
import { LOCALIZED_TEXT } from "./localization.js";

const __unstableProcessedMsgs = new Set();

//	Update item description based on regex pattern and replacement logic. 
//	@param {string} description - The original item description. 
//	@param {RegExp} regexPattern - The regex pattern to match.
//	@param {Function} replacementFn - A function that takes a match and returns a replacement string.
//	@returns {string} - The updated item description.
function updateDescription(description, regexPattern, replacementFn) {
	const updatedDescription = description.replace(regexPattern, replacementFn);
	return updatedDescription;
}

Hooks.on("ready", () => {

  	console.log("%cPF2e Alchemist Remaster Duct Tape: AlchemistFeats.js loaded","color: aqua; font-weight: bold;");

	Hooks.on("preCreateItem", async (item) => {
		debugLog(`AlchemistFeats.js | Item ${item.name} Created!`);
				
		// Get the actor from the item's parent (the actor who owns the item)
		const actor = item.parent;
		if (!actor) {
			debugLog(3,`AlchemistFeats.js | Actor for item ${item.name} not found.`,);
			return;
		}
		
		// Check permissions to prevent errors on other users
		const activeOwnersExist = hasActiveOwners(actor);
		if (activeOwnersExist) { // Owners exist, make sure user is owner
			if (!actor.isOwner) {
				debugLog(1,`AlchemistFeats.js | Current user is owner of item: ${item.name}`,);
				return;	
			}
		} else { // No owners exist, check if GM
			if (!game.user.isGM){ // User is not GM
				debugLog(1,`AlchemistFeats.js | Current user is owner of item: ${item.name}`,);
				return;	
			}
		}
		
		// Make sure item was created by Quick Alchemy Macro
		if (!item?.system?.ductTaped) {
			debugLog(`AlchemistFeats.js | Item ${item.name} not created with Duct Tape module... skipping: `, item);
			return;
		}
		
		// Make sure selected token is an alchemist or has archetype
		const alchemistCheck = isAlchemist(actor);
		if (alchemistCheck.qualifies) {
			debugLog("AlchemistFeats.js | Actor's Class DC:", alchemistCheck.dc);
			if (!alchemistCheck.dc) {
				debugLog(2, "AlchemistFeats.js | Warning: Class DC not found for the actor:", actor);
				return;
			}
		} else {
			debugLog(`AlchemistFeats.js | Selected Character (${actor.name}) is not an Alchemist - Ignoring`);
			return;
		}
		
		/* EFFECT LINK ================================================================
			Check if description has an effect link in it and inject note before
			the link to state "Apply before use" 
		============================================================================ */
		await annotateEffectLinkBeforeUse(item);

		if(item.system.traits.value.includes("healing")) {
			debugLog("AlchemistFeats.js | Item is a healing item - Ignoring.");
			return;
		}
		
		// ensure the item type is 'weapon' or 'consumable'
		if (!item || (item.type !== "weapon" && item.type !== "consumable")) {
		  debugLog(`AlchemistFeats.js | Item type (${item.type}) is not weapon or consumable or item is undefined - Ignoring.`);
		  return;
		}
		
		/* POWERFUL ALCHEMY ===========================================================
			Check if the actor has Powerful Alchemy -
			if not enabled, skip processing
		============================================================================ */
		const paEnabled = getSetting("enablePowerfulAlchemy");
		if (paEnabled) {
			debugLog("AlchemistFeats.js | PowerfulAlchemy enabled.");
			if (hasFeat(actor, "powerful-alchemy")) {
				await applyPowerfulAlchemy(item,actor,alchemistCheck.dc);
			}else{
				debugLog(`AlchemistFeats.js | Actor (${actor.name}) does not have Powerful alchemy, ignoring!`);
			}
		}
	});

	// Fires when craftItem() reuses an existing (*Temporary) item instead of creating a new one.
	// preCreateItem never fires in that path, so Powerful Alchemy notification must be triggered here.
	Hooks.on("ardt:existingItemCrafted", async (item, actor) => {
		debugLog(`AlchemistFeats.js | ardt:existingItemCrafted fired for ${item?.name}`);
		if (!actor) return;

		const activeOwnersExist = hasActiveOwners(actor);
		if (activeOwnersExist) {
			if (!actor.isOwner) return;
		} else {
			if (!game.user.isGM) return;
		}

		if (!item?.system?.ductTaped) return;

		const alchemistCheck = isAlchemist(actor);
		if (!alchemistCheck.qualifies || !alchemistCheck.dc) return;

		if (item.system.traits.value.includes("healing")) return;

		const paEnabled = getSetting("enablePowerfulAlchemy");
		if (!paEnabled) return;
		if (!hasFeat(actor, "powerful-alchemy")) return;

		await sendPowerfulAlchemyNotification(item, alchemistCheck.dc);
	});

	// PF2e re-fetches Note rule text from its own localization at damage-roll render time,
	// ignoring any stored rule.text changes. Patch data-pf2-dc in the rendered DOM instead.
	Hooks.on("renderChatMessage", (message, html) => {
		if (!message.isDamageRoll) return;
		if (!getSetting("enablePowerfulAlchemy")) return;

		const root = html instanceof HTMLElement ? html : html[0];
		if (!root) return;

		const noteChecks = root.querySelectorAll(".roll-note a.inline-check[data-pf2-dc][data-item-uuid]");
		if (!noteChecks.length) return;

		for (const checkEl of noteChecks) {
			// Parse "Actor.<actorId>.Item.<itemId>" synchronously — no await needed
			const match = checkEl.getAttribute("data-item-uuid")?.match(/^Actor\.([^.]+)\.Item\.([^.]+)$/);
			if (!match) continue;
			const actor = game.actors?.get(match[1]);
			const item = actor?.items?.get(match[2]);
			if (!item?.system?.ductTaped) continue;
			if (!hasFeat(actor, "powerful-alchemy")) continue;

			const alchemistCheck = isAlchemist(actor);
			if (!alchemistCheck.qualifies || !alchemistCheck.dc) continue;

			const currentDC = parseInt(checkEl.getAttribute("data-pf2-dc"));
			if (currentDC === alchemistCheck.dc) continue;

			debugLog(`AlchemistFeats.js | renderChatMessage | Patching inline-check DC: ${currentDC} → ${alchemistCheck.dc} for ${item.name}`);
			checkEl.setAttribute("data-pf2-dc", String(alchemistCheck.dc));

			// Update the visible DC number inside the button — replace just the number so
			// localized abbreviations ("DD", "SG", etc.) are unaffected
			const dcSpan = checkEl.querySelector("span[data-visibility]");
			if (dcSpan) dcSpan.textContent = dcSpan.textContent.replace(new RegExp(`\\b${currentDC}\\b`), String(alchemistCheck.dc));
		}
	});
});

/* ============================================================================
	Inject Effect Link Annotation 
============================================================================ */
async function annotateEffectLinkBeforeUse(item) {
	//setTimeout(async () => {
		try {
			if (!item) return;

			const desc = item.system?.description?.value ?? '';
			if (!desc) return;

			// Already injected? bail.
			if (/>\s*Apply before using\s*:\s*<\/strong>\s*\@UUID\[/i.test(desc)) {
				debugLog(`AlchemistFeats.js | annotateEffectLinkBeforeUse: already present for ${item.name}`);
				return;
			}

			// Only the @UUID[...] {Effect: ...} pattern
			const uuidEffectRe = /(\@UUID\[[^\]]+\]\{\s*Effect:\s*[^}]+\})/i;

			if (!uuidEffectRe.test(desc)) {
				debugLog(`AlchemistFeats.js | annotateEffectLinkBeforeUse: no @UUID Effect link in ${item.name}`);
				return;
			}

			const updated = desc.replace(uuidEffectRe, (_m, g1) => {
				return `<p><strong> ${LOCALIZED_TEXT.QUICK_ALCHEMY_APPLY_BEFORE_USE} </strong>${g1}</p>`;
			});

			if (updated !== desc) {
				await item.updateSource({ 'system.description.value': updated });
				debugLog(`AlchemistFeats.js | annotateEffectLinkBeforeUse: injected label for ${item.name}`);
			}
		} catch (err) {
			debugLog(`AlchemistFeats.js | annotateEffectLinkBeforeUse ERROR: ${err?.message || err}`);
			console.error(err);
		}
	//}, 100);
}

// Send the Powerful Alchemy chat notification for a given item and DC.
// description param overrides item.system.description.value (used when a pre-create update has been applied)
async function sendPowerfulAlchemyNotification(item, alchemistDC, description = null) {
	const desc = description ?? item.system?.description?.value ?? "";
	const saveTypeMatch = desc.match(/@Check\[(?!flat)[^\]]*?type:(\w+)/)
		|| desc.match(/@Check\[(?!flat)(\w+)\|dc:/);
	const saveType = saveTypeMatch?.[1] ?? null;
	const saveBasic = /basic:true/i.test(desc);
	const inlineCheck = saveType
		? `@Check[type:${saveType}|dc:${alchemistDC}${saveBasic ? "|basic:true" : ""}]`
		: `DC ${alchemistDC}`;
	await ChatMessage.create({
		author: game.user?.id,
		content: `<h5>${LOCALIZED_TEXT.POWERFUL_ALCHEMY}:</h5><p>${item.name} ${LOCALIZED_TEXT.POWERFUL_ALCHEMY_CLASS_DC_SAVE}: ${inlineCheck}</p>`,
		speaker: { alias: LOCALIZED_TEXT.POWERFUL_ALCHEMY }
	});
}

//	Function to apply Powerful Alchemy effects to item created by Alchemist
async function applyPowerfulAlchemy(item,actor,alchemistDC){
	// Delay to allow item to finish embedding (avoids Foundry V12 timing issues)
	try {
		if (!item || !item.system?.traits?.value?.includes("alchemical")) {
			debugLog(`AlchemistFeats.js | Item (${item?.name}) does not have the 'alchemical' trait or item is undefined.`);
			return;
		}

		if (!item.system.traits.value.includes("infused")) {
			debugLog(`AlchemistFeats.js | Item (${item.name}) does not have the 'infused' trait.`);
			return;
		}

		debugLog(`AlchemistFeats.js | Infused item created! Item: `, item);

		let description = item.system.description.value;

		const replacements = [
			{
				pattern: /@Check\[(?!flat)[^\]]*?\bdc:(\d+)[^\]]*?\]/g,
				replaceFn: (match, p1) => match.replace(`dc:${p1}`, `dc:${alchemistDC}`)
			},
			{
				pattern: /DC is (\d+)/g,
				replaceFn: (match, p1) => match.replace(`DC is ${p1}`, `DC is ${alchemistDC}`)
			},
			{
				pattern: /DC is \[\[\/act [^\]]*?dc=(\d+)\]\]\{\d+\}/g,
				replaceFn: (match, p1) => `DC is [[/act escape dc=${alchemistDC}]]{${alchemistDC}}`
			}
		];

		let updatedDescription = description;
		for (const { pattern, replaceFn } of replacements) {
			updatedDescription = updatedDescription.replace(pattern, replaceFn);
		}

		if (updatedDescription !== description) {
			await item.updateSource({ "system.description.value": updatedDescription });
			debugLog(`AlchemistFeats.js | Description was updated to Class DC: ${alchemistDC}`);
		}

		// Always fire the chat notification (pass updatedDescription so inline check uses the new DC)
		await sendPowerfulAlchemyNotification(item, alchemistDC, updatedDescription);

		// Update any matching Note rule elements with the corrected DC.
		// rule.text may be a PF2e localization key (e.g. "PF2E.BombNotes.SkunkBomb.Moderate.success")
		// so we resolve it first, apply the DC replacement, then store the resolved text back.
		// Use _source (raw stored data) and deepClone to ensure plain objects, not proxies.
		const rawRules = foundry.utils.deepClone(item._source?.system?.rules ?? []);
		debugLog(`AlchemistFeats.js | Note rule check: ${rawRules.length} rules on ${item.name}`);
		let rulesChanged = false;
		for (let i = 0; i < rawRules.length; i++) {
			const rule = rawRules[i];
			if (rule?.key !== "Note") continue;
			if (typeof rule.selector !== "string" || !rule.selector.includes("{item|_id}-damage")) continue;
			const rawText = typeof rule.text === "string" ? rule.text : "";
			if (!rawText) { debugLog(`AlchemistFeats.js | Note rule[${i}] has no text, skipping`); continue; }
			const resolvedText = game.i18n.localize(rawText);
			debugLog(`AlchemistFeats.js | Note rule[${i}] rawText="${rawText}" | resolvedText="${resolvedText.substring(0, 120)}"`);
			let updatedText = resolvedText;
			for (const { pattern, replaceFn } of replacements) {
				updatedText = updatedText.replace(pattern, replaceFn);
			}
			if (updatedText !== resolvedText) {
				rawRules[i] = { ...rule, text: updatedText };
				rulesChanged = true;
				debugLog(`AlchemistFeats.js | Note rule[${i}] DC updated to ${alchemistDC}`);
			} else {
				debugLog(`AlchemistFeats.js | Note rule[${i}] - no DC pattern matched in resolved text`);
			}
		}
		if (rulesChanged) {
			await item.updateSource({ "system.rules": rawRules });
			debugLog(`AlchemistFeats.js | updateSource applied for rules on ${item.name}`);
		}
	} catch (err) {
		debugLog(`AlchemistFeats.js | Error in applyPowerfulAlchemy: ${err.message}`);
		console.error(err); // Optional: for debugging during development
	}
}

/* ============================================================================
	Unstable Concoction — minimal flow (chooser + inventory + craft) 
============================================================================ */
async function _unstablePostCreateUse(actor, itemDoc) {
	try {
		if (!actor || !itemDoc) return;
		const uuid = itemDoc?.uuid ?? itemDoc?.parent?.uuid ?? null;
		if (!uuid) return;

		// prefer type, then traits as a fallback
		const t = String(itemDoc?.type ?? "").toLowerCase();
		if (t === "consumable" && typeof sendConsumableUseMessage === "function") {
			await sendConsumableUseMessage(uuid);
			return;
		}
		if (t === "weapon" && typeof sendWeaponAttackMessage === "function") {
            await sendWeaponAttackMessage(uuid);
			return;
		}

		// fallback by trait (some bombs can be ‘weapon’-ish)
		const traits = itemDoc?.system?.traits?.value ?? [];
		if (Array.isArray(traits)) {
			if (traits.includes("consumable") && typeof sendConsumableUseMessage === "function") {
				await sendConsumableUseMessage(uuid);
				return;
			}
			if (traits.includes("bomb") || traits.includes("alchemical-bomb")) {
				if (typeof sendWeaponAttackMessage === "function") {
					await sendWeaponAttackMessage(uuid);
					return;
				}
			}
		}

		debugLog(2, `AlchemistFeats.js | _unstablePostCreateUse() | no matching sender for ${itemDoc.name} (type=${t})`);
	} catch (e) {
		debugLog(3, `AlchemistFeats.js | _unstablePostCreateUse() failed: ${e?.message ?? e}`);
	}
}

const __UC_DIE_ORDER = ["d4","d6","d8","d10","d12"]; // order of die sizes
function bumpDieToken(d) {
	if (typeof d !== "string") return d;
	const i = __UC_DIE_ORDER.indexOf(d.toLowerCase());
	return i >= 0 ? __UC_DIE_ORDER[Math.min(i + 1, __UC_DIE_ORDER.length - 1)] : d;
}
function bumpFirstInString(s) {
	try {
		let done = false;
		return String(s).replace(/d(4|6|8|10|12)\b/ig, m => {
			if (done) return m;
			done = true;
			return bumpDieToken(m);
		});
	} catch { return s; }
}
function bumpAllDiceInString(s) {
	try {
		return String(s).replace(/d(4|6|8|10|12)\b/ig, m => bumpDieToken(m));
	} catch { return s; }
}

//	Mutate RAW item data to be “Unstable”:
function _unstableMutateRawItemData(raw) {
	try {

		// mark as duct-taped + add 'infused' trait
		foundry.utils.setProperty(raw, "system.ductTaped", true);
		let tr = foundry.utils.getProperty(raw, "system.traits.value");
		if (!Array.isArray(tr)) tr = [];
		if (!tr.includes("infused")) tr.push("infused");
		foundry.utils.setProperty(raw, "system.traits.value", Array.from(new Set(tr)));

		// rename + flag
		raw.name = `${raw.name} (Unstable)`;
		raw.flags = raw.flags ?? {};
		raw.flags["pf2e-alchemist-remaster-ducttape"] = raw.flags["pf2e-alchemist-remaster-ducttape"] ?? {};
		raw.flags["pf2e-alchemist-remaster-ducttape"].unstableConcoction = true;

		// structured formulas (healing/damage): bump first dice only
		const healPath = "system.healing.formula";
		const heal = foundry.utils.getProperty(raw, healPath);
		if (typeof heal === "string" && heal.trim()) {
			foundry.utils.setProperty(raw, healPath, bumpFirstInString(heal));
		}
		for (const p of ["system.damage.formula", "system.damage.value"]) {
			const cur = foundry.utils.getProperty(raw, p);
			if (typeof cur === "string" && cur.trim()) {
				foundry.utils.setProperty(raw, p, bumpFirstInString(cur));
				break; // only bump one structured damage string
			}
		}

		// weapons/bombs: bump structured die (initial hit only)
		// DO NOT touch splash/persistent values
		const diePaths = [
			"system.damage.die",           // primary for bombs
			"system.damage.base.die",      // some items
			"system.damage.primary.die"    // schema variants
		];

		const existingPath = diePaths.find(p => foundry.utils.hasProperty(raw, p));
		if (existingPath) {
			const d = foundry.utils.getProperty(raw, existingPath);
			if (typeof d === "string" && /^(d4|d6|d8|d10|d12)$/i.test(d)) {
				const bumped = bumpDieToken(d);
				if (bumped !== d) {
					foundry.utils.setProperty(raw, existingPath, bumped);
				}
			}
		}

		// description: bump ALL dice inside @Damage[...] (skip persistent/splash)
		const descPath = "system.description.value";
		const curDesc = String(foundry.utils.getProperty(raw, descPath) ?? "");
		let nextDesc = curDesc.replace(/@Damage\[(.+?)\]/gis, (full, inner) => {
			if (/\bpersistent\b/i.test(inner) || /\bsplash\b/i.test(inner)) return full;
			return `@Damage[${bumpAllDiceInString(inner)}]`;
		});
		// also catch plain XdY remnants outside @Damage (rare)
		if (nextDesc === curDesc && /\d+d(4|6|8|10|12)/i.test(curDesc)) {
			nextDesc = bumpAllDiceInString(curDesc);
		}

		// append Unstable note 
		if (!/Unstable:\s/i.test(nextDesc)) {
			const lvl = Number(raw?.system?.level?.value ?? raw?.system?.level ?? 0) || 0;
			const checkDC = "@Check[type:flat|dc:10]";
			const dmgVal = `@Damage[${lvl}][acid]`;
			nextDesc += LOCALIZED_TEXT.UNSTABLE_NOTE(checkDC, dmgVal);
		}
		foundry.utils.setProperty(raw, descPath, nextDesc);

	} catch (e) {
		debugLog(3, `AlchemistFeats.js | _unstableMutateRawItemData() failed: ${e?.message ?? e}`);
	}
}

//	Chooser (two buttons): Use from Inventory / Craft Item
export async function displayUnstableConcoctionDialog(actor) {
	try {
		if (!actor) {
			debugLog(3, "AlchemistFeats.js | displayUnstableConcoctionDialog(): no actor provided");
			return;
		}

		const hasVialFns = (typeof getVersatileVialCount === "function");
		const vialCount = hasVialFns ? Number(getVersatileVialCount(actor) ?? 0) : 0;
		const canCraft = vialCount > 0;

		await qaOpenDialogV2({
			window: { title: LOCALIZED_TEXT.UNSTABLE_CONCOCTION_BTN },
			classes: ["quick-alchemy-dialog"],
			content: `
				<div class="qa-wrapper" style="display:flex;flex-direction:column;gap:.5rem;">
					<h3 style="margin:0;">${LOCALIZED_TEXT.UNSTABLE_CONCOCTION_TITLE}</h3>
					<p style="margin:0;">${LOCALIZED_TEXT.UNSTABLE_CONCOCTION_DESC}</p>
					${hasVialFns ? `<p style="margin:0;opacity:.85;">${LOCALIZED_TEXT.VERSATILE_VIALS}: <strong>${vialCount}</strong></p>` : ""}
				</div>
			`,
			buttons: [
				{
					action: "inventory",
					label: LOCALIZED_TEXT.SELECT_FROM_INVENTORY,
					icon: "fas fa-box-open",
					callback: (_ev, _btn, dialog) => {
						try { dialog?.close?.(); } catch {}
						displayUnstableInventoryDialog(actor);
					}
				},
				{
					action: "craft",
					label: LOCALIZED_TEXT.CRAFT,
					icon: "fas fa-hammer",
					disabled: !canCraft,
					tooltip: canCraft ? "" : LOCALIZED_TEXT.NOTIF_NO_VIAL_AVAIL,
					callback: (_ev, _btn, dialog) => {
						if (!canCraft) return;
						try { dialog?.close?.(); } catch {}
						displayUnstableCraftDialog(actor);
					}
				},
				{
					action: "back",
					label: LOCALIZED_TEXT.BACK,
					icon: "fas fa-arrow-left",
					callback: (_ev, _btn, dialog) => {
						try { dialog?.close?.(); } catch {}
						try { if (typeof qaCraftAttack === "function") qaCraftAttack(); } catch {}
					}
				}
			],
			default: "inventory",
			render: (_ev, dialog) => {
				try { qaClampDialog(dialog, 400); } catch (err) {
					debugLog(3, `AlchemistFeats.js | displayUnstableConcoctionDialog(): clamp failed: ${err?.message ?? err}`);
				}
			}
		});
	} catch (err) {
		debugLog(3, `AlchemistFeats.js | displayUnstableConcoctionDialog() failed: ${err?.message ?? err}`);
	}
}

/* ============================================================================
	Use from Inventory → list actor items with traits alchemical+consumable
	- decrements the base stack by 1
	- embeds a 1-qty Unstable copy (owned), ready to activate later
============================================================================ */
export async function displayUnstableInventoryDialog(actor) {
	try {
		if (!actor) return;

		// match: actor inventory items with traits alchemical + consumable + infused,
		// EXCLUDING already-unstable and EXCLUDING Versatile Vial by slug
		const items = (actor.items ?? []).filter(i => {
			const tr = i?.system?.traits?.value ?? [];
			const isMatch = Array.isArray(tr)
				&& tr.includes("alchemical")
				&& tr.includes("consumable")
				&& tr.includes("infused");
			if (!isMatch) return false;

			const flagged = !!i.getFlag?.("pf2e-alchemist-remaster-ducttape", "unstableConcoction");
			const named = String(i?.name ?? "").toLowerCase().includes("(unstable)");
			const isVV = (i?.system?.slug === "versatile-vial");
			return !(flagged || named || isVV);
		});

		// sort alphabetically by name
		items.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
		

		if (!items.length) {
			debugLog(2, "AlchemistFeats.js | displayUnstableInventoryDialog() | no eligible alchemical consumables on actor");
			return;
		}

		const options = items.map(i => `<option value="${i.uuid}">${i.name}</option>`).join("");

		await qaOpenDialogV2({
			window: { title: LOCALIZED_TEXT.UNSTABLE_CONCOCTION_BTN },
			classes: ["quick-alchemy-dialog"],
			content: `
				<form>
					<div class="qa-wrapper">
						<h3>${LOCALIZED_TEXT.UNSTABLE_CONCOCTION_SELECT_ITEM}</h3>
						<select id="unstable-inv" style="display:inline-block;margin-top:5px;width:100%;">${options}</select>
						<hr/>
						<p style="opacity:.8;">${LOCALIZED_TEXT.UNSTABLE_CONCOCTION_DESC}</p>
					</div>
				</form>
			`,
			buttons: [
				{
					action: "create",
					label: LOCALIZED_TEXT.OK,
					icon: "fas fa-check",
					callback: async (_ev, btn, dialog) => {
						const sel = btn.form.elements["unstable-inv"]?.value;
						if (!sel) return;
						const base = await fromUuid(sel);
						if (!base) return;

						// decrement base stack
						try {
							const qPath = "system.quantity";
							const curQty = Number(foundry.utils.getProperty(base, qPath) ?? 0);
							if (curQty <= 0) return;
							await base.update({ [qPath]: curQty - 1 });
						} catch (e) {
							debugLog(3, `AlchemistFeats.js | unstable inventory | qty dec failed: ${e?.message ?? e}`);
						}

						// embed a mutated 1-qty copy
						const raw = foundry.utils.deepClone(base.toObject());
						delete raw._id;
						foundry.utils.setProperty(raw, "system.quantity", 1);
						_unstableMutateRawItemData(raw);

						const [ownedTmp] = await actor.createEmbeddedDocuments("Item", [raw]);
						if (!ownedTmp) return;
						try { dialog?.close?.(); } catch {}
						await _unstablePostCreateUse(actor, ownedTmp);
						
					}
				},
				{
					action: "back",
					label: LOCALIZED_TEXT.BACK,
					icon: "fas fa-arrow-left",
					callback: (_ev, _btn, dialog) => {
						try { dialog?.close?.(); } catch {}
						displayUnstableConcoctionDialog(actor);
					}
				}
			],
			default: "create",
			render: (_ev, dialog) => { try { if (typeof qaClampDialog === "function") qaClampDialog(dialog, 520); } catch {} }
		});
	} catch (e) {
		debugLog(3, `AlchemistFeats.js | displayUnstableInventoryDialog() failed: ${e?.message ?? e}`);
	}
}

/* DISPLAY UNSTABLE CRAFT DIALOG ==============================================
	Craft path:
	- build list from actor.system.crafting.formulas
	- resolve name & traits via qaGetIndexEntry(uuid)
	- on craft: if global craftButton() exists -> use it
	  otherwise: embed a 1-qty copy of the formula doc
============================================================================ */
export async function displayUnstableCraftDialog(actor) {
	try {
		if (!actor) return;

		// require at least 1 Versatile Vial to proceed
		if (typeof getVersatileVialCount === "function") {
			const vv = Number(getVersatileVialCount(actor) ?? 0);
			if (vv <= 0) {
				debugLog(2, "AlchemistFeats.js | displayUnstableCraftDialog() | no Versatile Vials available");
				return;
			}
		}

		// gather formulas from actor; resolve via qaGetIndexEntry to check traits & names
		const craftChoices = [];
		const formulas = actor?.system?.crafting?.formulas ?? [];
		for (const f of formulas) {
			const uu = f?.uuid;
			if (!uu) continue;
			const idx = await qaGetIndexEntry(uu);
			const tr = idx?.traits ?? idx?.system?.traits?.value ?? [];
			if (Array.isArray(tr) && tr.includes("alchemical") && tr.includes("consumable")) {
				craftChoices.push({ uuid: uu, name: idx?.name ?? f?.name ?? uu });
			}
		}

		// sort alphabetically by name
		craftChoices.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
		
		if (!craftChoices.length) {
			debugLog(2, "AlchemistFeats.js | displayUnstableCraftDialog() | no matching formulas");
		}

		const options = craftChoices.map(e => `<option value="${e.uuid}">${e.name}</option>`).join("");

		await qaOpenDialogV2({
			window: { title: LOCALIZED_TEXT.UNSTABLE_CONCOCTION_BTN },
			classes: ["quick-alchemy-dialog"],
			content: `
				<form>
					<div class="qa-wrapper">
						<h3>${LOCALIZED_TEXT.QUICK_ALCHEMY_SELECT_ITEM_TYPE(LOCALIZED_TEXT.UNSTABLE_ALCHEMICAL_CONSUMABLE)}</h3>
						<select id="unstable-formula" style="display:inline-block;margin-top:5px;width:100%;">${options}</select>
						<hr/>
						<p style="opacity:.8;">${LOCALIZED_TEXT.UNSTABLE_CONCOCTION_DESC}</p>
					</div>
				</form>
			`,
			buttons: [
				{
					action: "craft",
					label: LOCALIZED_TEXT.CRAFT,
					icon: "fas fa-hammer",
					callback: async (_ev, btn, dialog) => {
						const sel = btn.form.elements["unstable-formula"]?.value;
						if (!sel) return;

						// consume 1 Versatile Vial up-front; abort if we can't
						if (typeof consumeVersatileVial === "function") {
							const ok = await consumeVersatileVial(actor, "unstable-concoction", 1);
							if (!ok) {
								debugLog(2, "AlchemistFeats.js | displayUnstableCraftDialog() | failed to consume Versatile Vial");
								return;
							}
						}

						// Prefer existing craft util if available
						if (typeof craftButton === "function") {
							try {
								const tmp = await craftButton(actor, sel, "none", "unstable-concoction", { sendMsg: false });
								if (tmp) {
									const raw = foundry.utils.deepClone(tmp.toObject());
									delete raw._id;
									foundry.utils.setProperty(raw, "system.quantity", 1);
									_unstableMutateRawItemData(raw);
									const [ownedTmp] = await actor.createEmbeddedDocuments("Item", [raw]);
									if (ownedTmp) {
										try { dialog?.close?.(); } catch {}
										await _unstablePostCreateUse(actor, ownedTmp);
									}
									return;
								}
							} catch (e) {
								debugLog(3, `AlchemistFeats.js | displayUnstableCraftDialog() | craftButton failed: ${e?.message ?? e}`);
							}
						}

						// Fallback: embed 1-qty copy directly from the formula uuid
						try {
							const src = await fromUuid(sel);
							if (!src) return;
							const raw = foundry.utils.deepClone(src.toObject());
							delete raw._id;
							foundry.utils.setProperty(raw, "system.quantity", 1);
							_unstableMutateRawItemData(raw);
							const [ownedTmp] = await actor.createEmbeddedDocuments("Item", [raw]);
							if (ownedTmp) {
								try { dialog?.close?.(); } catch {}
								await _unstablePostCreateUse(actor, ownedTmp);
							}
						} catch (e) {
							debugLog(3, `AlchemistFeats.js | displayUnstableCraftDialog() | embed fallback failed: ${e?.message ?? e}`);
						}
					}
				},
				{
					action: "back",
					label: LOCALIZED_TEXT.BACK,
					icon: "fas fa-arrow-left",
					callback: (_ev, _btn, dialog) => {
						try { dialog?.close?.(); } catch {}
						displayUnstableConcoctionDialog(actor);
					}
				}
			],
			default: "craft",
			render: (_ev, dialog) => { try { if (typeof qaClampDialog === "function") qaClampDialog(dialog, 520); } catch {} }
		});
	} catch (e) {
		debugLog(3, `AlchemistFeats.js | displayUnstableCraftDialog() failed: ${e?.message ?? e}`);
	}
}