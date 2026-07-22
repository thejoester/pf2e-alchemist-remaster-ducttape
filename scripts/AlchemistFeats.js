import { debugLog, getSetting, hasFeat, isAlchemist, hasActiveOwners  } from './settings.js';
import { qaOpenDialogV2, qaClampDialog, qaCraftAttack, getVersatileVialCount, consumeVersatileVial, sendConsumableUseMessage, sendWeaponAttackMessage } from "./QuickAlchemy.js";
import { qaGetIndexEntry } from "./AlchIndex.js";
import { LT } from "./localization.js";

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

	// Expose Field Vials macro entry point globally
	window.displayFieldVialsDialog = displayFieldVialsDialog;

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
			// Parse "Actor.<actorId>.Item.<itemId>" synchronously, no await needed
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

			// Update the visible DC number inside the button, replace just the number so
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
				return `<p><strong> ${LT.quickAlchemyApplyBeforeUse()} </strong>${g1}</p>`;
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
		content: `<h5>${LT.powerfulAlchemy()}:</h5><p>${item.name} ${LT.powerfulAlchemyClassDcSave()}: ${inlineCheck}</p>`,
		speaker: { alias: LT.powerfulAlchemy() }
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
	Unstable Concoction, minimal flow (chooser + inventory + craft) 
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
			nextDesc += LT.unstableNote({ check: checkDC, dmg: dmgVal });
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
			window: { title: LT.unstableConcoctionBtn() },
			classes: ["quick-alchemy-dialog"],
			content: `
				<div class="qa-wrapper" style="display:flex;flex-direction:column;gap:.5rem;">
					<h3 style="margin:0;">${LT.unstableConcoctionTitle()}</h3>
					<p style="margin:0;">${LT.unstableConcoctionDesc()}</p>
					${hasVialFns ? `<p style="margin:0;opacity:.85;">${LT.versatileVials()}: <strong>${vialCount}</strong></p>` : ""}
				</div>
			`,
			buttons: [
				{
					action: "inventory",
					label: LT.selectFromInventory(),
					icon: "fas fa-box-open",
					callback: (_ev, _btn, dialog) => {
						try { dialog?.close?.(); } catch {}
						displayUnstableInventoryDialog(actor);
					}
				},
				{
					action: "craft",
					label: LT.craft(),
					icon: "fas fa-hammer",
					disabled: !canCraft,
					tooltip: canCraft ? "" : LT.notifNoVialAvail(),
					callback: (_ev, _btn, dialog) => {
						if (!canCraft) return;
						try { dialog?.close?.(); } catch {}
						displayUnstableCraftDialog(actor);
					}
				},
				{
					action: "back",
					label: LT.back(),
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
			window: { title: LT.unstableConcoctionBtn() },
			classes: ["quick-alchemy-dialog"],
			content: `
				<form>
					<div class="qa-wrapper">
						<h3>${LT.unstableConcoctionSelectItem()}</h3>
						<select id="unstable-inv" style="display:inline-block;margin-top:5px;width:100%;">${options}</select>
						<hr/>
						<p style="opacity:.8;">${LT.unstableConcoctionDesc()}</p>
					</div>
				</form>
			`,
			buttons: [
				{
					action: "create",
					label: LT.ok(),
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
					label: LT.back(),
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
			window: { title: LT.unstableConcoctionBtn() },
			classes: ["quick-alchemy-dialog"],
			content: `
				<form>
					<div class="qa-wrapper">
						<h3>${LT.quickAlchemySelectItemType({ itemtype: LT.unstableAlchemicalConsumable() })}</h3>
						<select id="unstable-formula" style="display:inline-block;margin-top:5px;width:100%;">${options}</select>
						<hr/>
						<p style="opacity:.8;">${LT.unstableConcoctionDesc()}</p>
					</div>
				</form>
			`,
			buttons: [
				{
					action: "craft",
					label: LT.craft(),
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
					label: LT.back(),
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

/* ============================================================================
	Field Vials (Mutagenist research field base benefit)
	Drink a versatile vial to suppress the drawback of one active mutagen
	for 1 minute.

	We strip the drawback rules off the mutagen's own effect and put them back
	when the minute is up. The original rules array is stashed in a flag on that
	same effect, and a separate 1-minute marker effect makes the suppression
	visible on the token.

	The mutagen effect is never deleted or recreated, which is what makes this
	safe: same item id, same system.start, same badge, same duration, so there is
	no duration arithmetic and no expiry drift. Quicksilver's LoseHitPoints does
	not re-fire, granted items are not re-granted, and ChoiceSet selections are
	never re-prompted (Bestial and Silvertongue have rules that reference them).

	A counter-effect model was tried first and could not express most drawbacks
	at all: a skill rank override, an energy weakness, an ephemeral effect that
	buffs the attacker, a degree-of-success downgrade and a Dex cap have no
	"equal and opposite" form. Removing the rule handles all of them.

	The failure mode is a stale suppression (the player keeps a buff too long),
	never a destroyed mutagen.
============================================================================ */

//	True if a FlatModifier rule's value represents a penalty (negative).
//	Covers plain negative numbers, formulas that lead with a minus sign
//	(Serene's "-@weapon.system.damage.dice"), and formulas that multiply by -1
//	(Bendy-Arm's "@weapon.system.damage.dice * -1").
function _fieldVialIsNegativeRuleValue(value) {
	if (typeof value === "number") return value < 0;
	if (typeof value === "string") return /^\s*-/.test(value) || /\*\s*-\s*1\b/.test(value);
	return false;
}

/*	----------------------------------------------------------------------------
	Drawback classifier

	The same rule key can be a benefit on one mutagen and a drawback on another
	(ActiveEffectLike is Bendy-Arm's reach bonus and Cognitive's bulk cut;
	AdjustDegreeOfSuccess is a benefit 30 times and a drawback once), so we
	classify on key PLUS value, never on key alone.

	Each rule lands in one of four buckets:
	  drawback     - strip it while the field vial is active
	  keep         - benefit, neutral, or plumbing; leave it alone
	  ignore       - a drawback that already resolved, nothing to suppress
	                 (Quicksilver's LoseHitPoints); must not qualify a mutagen
	                 as a Field Vials target
	  unrecognized - unknown key; kept, and reported in the confirmation message
	---------------------------------------------------------------------------- */

//	Keys that are always a benefit, neutral, or plumbing on a mutagen effect.
const FIELD_VIAL_KEEP_KEYS = new Set([
	"RollOption", "ChoiceSet", "ItemAlteration", "Strike", "AdjustModifier",
	"Sense", "TempHP", "Resistance", "FastHealing", "DamageDice", "CreatureSize"
]);

//	Note selectors that mean the note describes something happening TO the actor.
const FIELD_VIAL_HARMFUL_NOTE_SELECTORS = new Set(["damage-received"]);

//	Classifies a single rule. Returns "drawback", "keep", "ignore" or "unrecognized".
function _fieldVialClassifyRule(r) {
	const key = r?.key;
	if (!key) return "unrecognized";
	if (FIELD_VIAL_KEEP_KEYS.has(key)) return "keep";

	switch (key) {
		//	Already spent when the mutagen was drunk, and recoverable: false, so
		//	there is no future moment to suppress. Silent by design.
		case "LoseHitPoints":
			return "ignore";

		case "FlatModifier":
			return _fieldVialIsNegativeRuleValue(r.value) ? "drawback" : "keep";

		case "ActiveEffectLike": {
			//	Silvertongue drops a skill rank to untrained via override. Match on
			//	the path, not the mode: "flankable: false" is also an override and
			//	is a benefit (Hydra, Ommatophoric).
			if (r.mode === "override") return /\.rank$/.test(String(r.path ?? "")) ? "drawback" : "keep";
			//	Capacity reductions (Cognitive's inventory.bulk.*Addend).
			const v = typeof r.value === "number" ? r.value : Number(r.value);
			if (!Number.isFinite(v)) return "keep";
			if (r.mode === "subtract") return v > 0 ? "drawback" : "keep";
			if (r.mode === "add") return v < 0 ? "drawback" : "keep";
			return "keep";
		}

		//	Drakeheart only. Always a drawback.
		case "DexterityModifierCap":
			return "drawback";

		case "AdjustDegreeOfSuccess": {
			const values = Object.values(r.adjustment ?? {}).map(v => String(v));
			return values.some(v => v.includes("worse")) ? "drawback" : "keep";
		}

		//	Energy Mutagen, one per energy type.
		case "Weakness":
			return "drawback";

		//	Prey's ephemeral effect buffs whoever attacks you.
		case "EphemeralEffect":
			return r.affects === "origin" ? "drawback" : "keep";

		case "Note":
			return FIELD_VIAL_HARMFUL_NOTE_SELECTORS.has(String(r.selector ?? "")) ? "drawback" : "keep";

		//	Only in-memory condition grants are suppressible by stripping the rule;
		//	the condition is rebuilt from the rule every data prep and never
		//	persisted, so removing the rule removes the condition (Hydra's Clumsy 1,
		//	Pallesthetic's Blinded). Deadweight's Encumbered is a real document that
		//	already exists, so stripping its rule would do nothing.
		case "GrantItem":
			return (r.inMemoryOnly === true && String(r.uuid ?? "").includes("conditionitems"))
				? "drawback"
				: "keep";

		default:
			return "unrecognized";
	}
}

//	Splits an effect's rules into drawback / keep / unrecognized buckets.
//	Unrecognized rules are also present in keep: the safety default is to leave a
//	rule active rather than strip something we do not understand.
function _fieldVialClassifyRules(effect) {
	const rules = effect?._source?.system?.rules ?? effect?.system?.rules ?? [];
	const out = { drawback: [], keep: [], unrecognized: [] };
	if (!Array.isArray(rules)) return out;
	for (const r of rules) {
		const verdict = _fieldVialClassifyRule(r);
		if (verdict === "drawback") out.drawback.push(r);
		else if (verdict === "unrecognized") { out.unrecognized.push(r); out.keep.push(r); }
		else out.keep.push(r);
	}
	return out;
}

//	Friendly labels for the bulk-capacity paths a mutagen drawback can reduce.
const FIELD_VIAL_BULK_PATH_LABELS = {
	"inventory.bulk.encumberedAfterAddend": "Bulk before encumbered",
	"inventory.bulk.maxAddend": "max Bulk"
};

//	Resolve the macro's actor the same way qaCraftAttack() does: selected token, else assigned character.
function _fieldVialResolveActor() {
	const token = canvas.tokens.controlled[0];
	const actor = token ? token.actor : game.user.character;
	if (!actor) {
		ui.notifications.error(LT.notifSelectTokenFirst());
		return null;
	}
	return actor;
}

//	Joins a rule's selector(s) into a readable list. Rules use "selector" or
//	"selectors", either of which may be a string or an array.
function _fieldVialSelectorLabel(r) {
	const sel = r?.selector ?? r?.selectors ?? "";
	return Array.isArray(sel) ? sel.join(", ") : String(sel);
}

//	Describes one drawback rule in plain language. Formula values are never
//	printed verbatim: "@weapon.system.damage.dice * -1 strike-damage" is not
//	something to show a player.
function _fieldVialDescribeDrawback(r) {
	const selectors = _fieldVialSelectorLabel(r);
	switch (r.key) {
		case "FlatModifier":
			return typeof r.value === "number"
				? `${r.value} ${selectors}`
				: LT.fieldVialsSumPenalty({ selectors });

		case "ActiveEffectLike": {
			if (r.mode === "override") return LT.fieldVialsSumUntrained();
			const amount = Math.abs(Number(r.value));
			const label = FIELD_VIAL_BULK_PATH_LABELS[r.path] ?? String(r.path ?? "");
			return `-${amount} ${label}`;
		}

		case "DexterityModifierCap":
			return LT.fieldVialsSumDexCap({ value: Number(r.value) });

		case "AdjustDegreeOfSuccess":
			return LT.fieldVialsSumWorseOutcome({ selectors });

		case "Weakness":
			return LT.fieldVialsSumWeakness({ value: Number(r.value), type: String(r.type ?? "") });

		case "EphemeralEffect":
			return LT.fieldVialsSumAttackerBonus();

		case "Note":
			return LT.fieldVialsSumHarmfulNote();

		case "GrantItem":
			return LT.fieldVialsSumCondition();

		default:
			return String(r.key ?? "");
	}
}

//	Short human-readable summary of an effect's drawback rules,
//	e.g. "-2 will, perception, initiative; weakness 5 fire".
function _fieldVialSummarizeDrawbacks(rules) {
	return rules.map(r => _fieldVialDescribeDrawback(r)).join("; ");
}

//	Forces a DialogV2's button row to stack vertically and applies a data-tooltip to each
//	button matched by data-action, so hovering a choice shows the extra detail text.
function _fieldVialStyleButtonList(dialog, tooltipsByAction) {
	try {
		const root = dialog?.element instanceof HTMLElement ? dialog.element : null;
		if (!root) return;
		const btnRow = root.querySelector(".dialog-buttons, .form-footer, footer");
		if (btnRow) {
			btnRow.style.flexDirection = "column";
			btnRow.style.alignItems = "stretch";
		}
		for (const [action, tooltip] of Object.entries(tooltipsByAction)) {
			const btn = root.querySelector(`[data-action="${action}"]`);
			if (!btn || !tooltip) continue;
			btn.dataset.tooltip = tooltip;
			btn.dataset.tooltipDirection = "UP";
		}
	} catch (err) {
		debugLog(3, `AlchemistFeats.js | _fieldVialStyleButtonList() failed: ${err?.message ?? err}`);
	}
}

//	Dialog: choose which active mutagen's drawback to suppress.
//	Button labels show only the effect name; hovering a button shows its drawback summary.
async function _fieldVialChooseEffect(candidates) {
	const tooltipsByAction = {};
	const buttons = candidates.map((eff, i) => {
		const action = `effect-${i}`;
		tooltipsByAction[action] = _fieldVialSummarizeDrawbacks(_fieldVialClassifyRules(eff).drawback);
		return { action, label: eff.name, callback: () => eff };
	});
	buttons.push({
		action: "cancel",
		label: LT.back(),
		icon: "fas fa-times",
		callback: () => null
	});

	return await qaOpenDialogV2({
		window: { title: LT.fieldVialsTitle(), resizable: false },
		position: { width: 420 },
		classes: ["quick-alchemy-dialog"],
		content: `
			<div class="qa-wrapper" style="display:flex;flex-direction:column;gap:.5rem;">
				<p style="margin:0;">${LT.fieldVialsDesc()}</p>
				<hr/>
				<p style="margin:0;">${LT.fieldVialsSelectEffect()}</p>
			</div>
		`,
		buttons,
		default: buttons[0]?.action ?? "cancel",
		render: (_ev, dialog) => _fieldVialStyleButtonList(dialog, tooltipsByAction)
	});
}

/* ----------------------------------------------------------------------------
	Suppress and restore

	The stash lives in a flag on the mutagen effect itself, not in a world
	setting: a non-GM player cannot write a world-scope setting, while a flag on
	their own item is writable by its owner, travels with the document, and
	cannot get orphaned from the thing it describes.
   ---------------------------------------------------------------------------- */

const FIELD_VIAL_SCOPE = "pf2e-alchemist-remaster-ducttape";
const FIELD_VIAL_STASH_FLAG = "fieldVialSuppression";
const FIELD_VIAL_MARKER_FLAG = "fieldVialMarker";
const FIELD_VIAL_DURATION_SECONDS = 60;

//	Guards against two restore passes overlapping on the same client, e.g. the
//	worldTime sweep and the marker's deleteItem hook firing back to back.
const _fieldVialRestoreInFlight = new Set();

//	Only one client may perform a restore, or several will race to write the same
//	update. Prefer the active GM; with no GM connected, fall back to the first
//	connected owner by user id so every client agrees on who acts.
function _fieldVialIsResponsible(actor) {
	const gm = game.users?.activeGM;
	if (gm) return gm.isSelf;
	const owners = (game.users?.filter(u => u.active && actor?.testUserPermission(u, "OWNER")) ?? [])
		.sort((a, b) => a.id.localeCompare(b.id));
	return owners[0]?.isSelf ?? false;
}

function _fieldVialGetStash(effect) {
	return effect?.getFlag?.(FIELD_VIAL_SCOPE, FIELD_VIAL_STASH_FLAG) ?? null;
}

//	Every effect currently carrying a suppression stash, across world actors and
//	unlinked tokens on the active scene.
function _fieldVialSuppressedEffects() {
	const actors = new Set(game.actors ?? []);
	for (const token of canvas?.tokens?.placeables ?? []) if (token.actor) actors.add(token.actor);
	const out = [];
	for (const actor of actors) {
		for (const effect of actor.itemTypes?.effect ?? []) {
			if (_fieldVialGetStash(effect)) out.push(effect);
		}
	}
	return out;
}

//	The visible 1-minute marker. It carries no rules; it exists so the
//	suppression shows on the token and so there is an obvious document to hang
//	expiry off, and deleting it by hand is the manual "restore now" path.
async function _fieldVialCreateMarker(actor, sourceEffect) {
	const raw = {
		name: LT.fieldVialsSuppressedName({ effectname: sourceEffect.name }),
		type: "effect",
		img: "icons/consumables/potions/bottle-round-corked-blue.webp",
		system: {
			description: { value: `<p>${LT.fieldVialsSuppressedDesc({ effectname: sourceEffect.name })}</p>`, gm: "" },
			rules: [],
			slug: null,
			traits: { value: [], otherTags: [] },
			level: { value: sourceEffect.system?.level?.value ?? 1 },
			duration: { value: 1, unit: "minutes", expiry: "turn-start", sustained: false },
			tokenIcon: { show: true },
			unidentified: false,
			badge: null,
			context: null
		},
		flags: {
			[FIELD_VIAL_SCOPE]: {
				[FIELD_VIAL_MARKER_FLAG]: { sourceEffectId: sourceEffect.id }
			}
		}
	};
	const [marker] = await actor.createEmbeddedDocuments("Item", [raw]);
	return marker;
}

//	True if the effect is still a live, applying document on this actor.
//	An expired effect is not a valid target: pf2e marks every rule of an expired
//	effect as ignored (pf2e.mjs:49328), so its drawback has already stopped
//	applying, and the effect tracker deletes expired effects on the next time
//	advance or turn change (pf2e.mjs:66305). Suppressing one would strip rules
//	off a document that is about to be removed, and updating one that has just
//	been removed throws "does not exist in the EmbeddedCollection".
function _fieldVialIsLiveEffect(actor, effect) {
	if (!effect?.id || !actor?.items?.has(effect.id)) return false;
	return effect.isExpired !== true;
}

//	Strips the drawback rules off the mutagen effect and stashes the originals.
//	The marker is created first so its id can go into the stash in a single
//	write; if the strip then fails, the marker is deleted again rather than left
//	on the actor with nothing suppressed.
async function _fieldVialSuppress(actor, effect, classified) {
	const originalRules = foundry.utils.deepClone(effect._source?.system?.rules ?? []);
	const marker = await _fieldVialCreateMarker(actor, effect);
	const now = Number(game.time?.worldTime ?? 0);

	try {
		await effect.update({
			"system.rules": classified.keep,
			[`flags.${FIELD_VIAL_SCOPE}.${FIELD_VIAL_STASH_FLAG}`]: {
				originalRules,
				strippedCount: classified.drawback.length,
				keptNotable: classified.unrecognized.map(r => ({ key: String(r.key ?? "") })),
				suppressedAt: now,
				expiresAt: now + FIELD_VIAL_DURATION_SECONDS,
				markerEffectId: marker?.id ?? null
			}
		});
	} catch (err) {
		await marker?.delete();
		throw err;
	}

	debugLog(`AlchemistFeats.js | Field Vials: suppressed ${classified.drawback.length} rule(s) on ${effect.name}`);
}

//	Writes the stashed rules back and clears the marker. Safe to call twice: the
//	flag is gone after the first pass, so the second is a no-op.
async function _fieldVialRestore(effect) {
	const stash = _fieldVialGetStash(effect);
	if (!stash) return false;
	if (_fieldVialRestoreInFlight.has(effect.uuid)) return false;
	_fieldVialRestoreInFlight.add(effect.uuid);

	try {
		//	Rules first, flag cleared in the same update, then the marker. Deleting
		//	the marker re-enters here via deleteItem, and by then the flag is gone.
		await effect.update({
			"system.rules": stash.originalRules ?? [],
			[`flags.${FIELD_VIAL_SCOPE}.-=${FIELD_VIAL_STASH_FLAG}`]: null
		});
		const marker = effect.actor?.items?.get(stash.markerEffectId);
		if (marker) await marker.delete();
		debugLog(`AlchemistFeats.js | Field Vials: restored drawback rules on ${effect.name}`);
		return true;
	} catch (err) {
		debugLog(3, `AlchemistFeats.js | _fieldVialRestore() failed: ${err?.message ?? err}`);
		return false;
	} finally {
		_fieldVialRestoreInFlight.delete(effect.uuid);
	}
}

//	Restores every suppression whose window has elapsed.
async function _fieldVialSweepExpired() {
	const now = Number(game.time?.worldTime ?? 0);
	for (const effect of _fieldVialSuppressedEffects()) {
		const stash = _fieldVialGetStash(effect);
		if (!stash) continue;
		if (now < Number(stash.expiresAt ?? 0)) continue;
		if (!_fieldVialIsResponsible(effect.actor)) continue;
		await _fieldVialRestore(effect);
	}
}

Hooks.once("ready", () => {
	//	worldTime does NOT advance outside combat unless someone advances it, so
	//	expiry alone can never fire in exploration mode. The ready sweep and the
	//	manual path (delete the marker effect) are what make this whole.
	_fieldVialSweepExpired();

	Hooks.on("updateWorldTime", () => _fieldVialSweepExpired());
	Hooks.on("combatTurnChange", () => _fieldVialSweepExpired());

	Hooks.on("deleteItem", async (item) => {
		const actor = item?.parent;
		if (!(actor?.itemTypes?.effect)) return;

		//	Marker deleted (expired, or cleared by hand): restore now.
		const marker = item.getFlag?.(FIELD_VIAL_SCOPE, FIELD_VIAL_MARKER_FLAG);
		if (marker) {
			const source = actor.items.get(marker.sourceEffectId);
			if (source && _fieldVialGetStash(source) && _fieldVialIsResponsible(actor)) {
				await _fieldVialRestore(source);
			}
			return;
		}

		//	The mutagen itself was deleted: nothing to restore, just drop the marker.
		const stash = item.getFlag?.(FIELD_VIAL_SCOPE, FIELD_VIAL_STASH_FLAG);
		if (stash?.markerEffectId && _fieldVialIsResponsible(actor)) {
			await actor.items.get(stash.markerEffectId)?.delete();
		}
	});
});

//	Macro entry point: "Field Vials" - suppress a mutagen's drawback for 1 minute.
export async function displayFieldVialsDialog() {
	try {
		const actor = _fieldVialResolveActor();
		if (!actor) return;

		if (!hasFeat(actor, "mutagenist")) {
			ui.notifications.warn(LT.notifNotMutagenist());
			return;
		}

		const vialCount = typeof getVersatileVialCount === "function" ? Number(getVersatileVialCount(actor) ?? 0) : 0;
		if (vialCount < 1) {
			ui.notifications.warn(LT.notifNoVialAvail());
			return;
		}

		//	A mutagen qualifies only if it has at least one strippable drawback.
		//	Quicksilver's LoseHitPoints classifies as "ignore" and deliberately does
		//	not qualify anything on its own (Quicksilver still qualifies via its
		//	fortitude -2). Already-suppressed mutagens are excluded: a second
		//	suppression would overwrite the stash and lose the original rules.
		//	Expired mutagens are excluded: their drawback has already stopped
		//	applying, so there is nothing to suppress.
		const candidates = (actor.itemTypes?.effect ?? [])
			.filter(eff => String(eff.slug ?? "").includes("mutagen")
				&& _fieldVialIsLiveEffect(actor, eff)
				&& !_fieldVialGetStash(eff)
				&& _fieldVialClassifyRules(eff).drawback.length > 0)
			.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

		if (!candidates.length) {
			ui.notifications.warn(LT.notifNoMutagenDrawback());
			return;
		}

		const chosenEffect = await _fieldVialChooseEffect(candidates);
		if (!chosenEffect) return;

		//	Suppress the mutagen's entire drawback at once. A single mutagen can
		//	carry several drawback rules (e.g. Cognitive Mutagen's -2 penalty plus
		//	two bulk reductions), and Field Vials neutralizes the whole drawback.
		const classified = _fieldVialClassifyRules(chosenEffect);
		if (!classified.drawback.length) return;

		//	Defensive duplicate guard: the dialog can sit open while another client
		//	suppresses the same mutagen.
		if (_fieldVialGetStash(chosenEffect)) {
			ui.notifications.warn(LT.notifFieldVialAlreadySuppressed({ effectname: chosenEffect.name }));
			return;
		}

		//	Re-check liveness after the dialog. The effect can expire or be deleted
		//	while the dialog is open, and pf2e's effect tracker removes expired
		//	effects on any time advance or turn change. Checked before the vial is
		//	spent so a vanished mutagen never costs a resource.
		if (!_fieldVialIsLiveEffect(actor, chosenEffect)) {
			ui.notifications.warn(LT.notifFieldVialEffectGone({ effectname: chosenEffect.name }));
			return;
		}

		const consumed = await consumeVersatileVial(actor, "field-vial", 1);
		if (!consumed) return;

		try {
			await _fieldVialSuppress(actor, chosenEffect, classified);
		} catch (err) {
			debugLog(3, `AlchemistFeats.js | Field Vials: suppress failed: ${err?.message ?? err}`);
			ui.notifications.error(LT.notifFieldVialSuppressFailed({ effectname: chosenEffect.name }));
			return;
		}

		//	Say what was suppressed, and mention leftovers only when there are any.
		//	The normal case is silent about them.
		const summary = _fieldVialSummarizeDrawbacks(classified.drawback);
		let content = `<p>${LT.notifFieldVialSuppressed({ actorname: actor.name, effectname: chosenEffect.name })}</p>`
			+ `<p>${LT.fieldVialsSuppressedList({ drawbacks: summary })}</p>`;
		if (classified.unrecognized.length) {
			const kept = classified.unrecognized.map(r => String(r.key ?? "")).join(", ");
			content += `<p>${LT.fieldVialsKeptActive({ rules: kept })}</p>`;
		}

		ChatMessage.create({
			author: game.user?.id,
			content,
			speaker: { alias: LT.fieldVialsBtn() }
		});
	} catch (err) {
		debugLog(3, `AlchemistFeats.js | displayFieldVialsDialog() failed: ${err?.message ?? err}`);
		console.error(err);
	}
}