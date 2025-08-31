import { debugLog, getSetting, hasFeat, isAlchemist, hasActiveOwners  } from './settings.js';
import { qaGetIndexEntry } from "./AlchIndex.js";
import { qaOpenDialogV2, getVersatileVialCount, consumeVersatileVial } from "./QuickAlchemy.js";
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
		
	Hooks.on("createItem", async (item) => {
		debugLog(`Item ${item.name} Created!`);
				
		// Get the actor from the item's parent (the actor who owns the item)
		const actor = item.parent;
		if (!actor) {
			debugLog(3,`Actor for item ${item.name} not found.`,);
			return;
		}
		
		// Check permissions to prevent errors on other users
		const activeOwnersExist = hasActiveOwners(actor);
		if (activeOwnersExist) { // Owners exist, make sure user is owner
			if (!actor.isOwner) {
				debugLog(1,`Current user is owner of item: ${item.name}`,);
				return;	
			}
		} else { // No owners exist, check if GM
			if (!game.user.isGM){ // User is not GM
				debugLog(1,`Current user is owner of item: ${item.name}`,);
				return;	
			}
		}
		
		// Make sure item was created by Quick Alchemy Macro
		if (!item?.system?.ductTaped) {
			debugLog(`Item ${item.name} not created with Duct Tape module... skipping: `, item);
			return;
		}
		
		// Make sure selected token is an alchemist or has archetype
		const alchemistCheck = isAlchemist(actor);
		if (alchemistCheck.qualifies) {
			debugLog("Actor's Class DC:", alchemistCheck.dc);
			if (!alchemistCheck.dc) {
				debugLog(2, "Warning: Class DC not found for the actor:", actor);
				return;
			}
		} else {
			debugLog(`Selected Character (${actor.name}) is not an Alchemist - Ignoring`);
			return;
		}
		
		/*
			*** EFFECT LINK *** 
			Check if description has an effect link in it and inject note before
			the link to state "Apply before use" 
		*/
		await annotateEffectLinkBeforeUse(item);

		if(item.system.traits.value.includes("healing")) {
			debugLog("Item is a healing item - Ignoring.");
			return;
		}
		
		// ensure the item type is 'weapon' or 'consumable'
		if (!item || (item.type !== "weapon" && item.type !== "consumable")) {
		  debugLog(`Item type (${item.type}) is not weapon or consumable or item is undefined - Ignoring.`);
		  return;
		}
		
		/*
			*** POWERFUL ALCHEMY *** 
			Check if the actor has Powerful Alchemy - if not return with mesactorge in log	
		*/
		//check if Powerful Alchemy is enabled
		const paEnabled = getSetting("enablePowerfulAlchemy");
		if (paEnabled) {
			debugLog("PowerfulAlchemy enabled.");
			if (hasFeat(actor, "powerful-alchemy")) {
				await applyPowerfulAlchemy(item,actor,alchemistCheck.dc);
			}else{
				debugLog(`Actor (${actor.name}) does not have Powerful alchemy, ignoring!`);
			}
		}			
	});
});

/*
	Injects "<strong> Apply before using: </strong>" immediately before the first
	@UUID[...] {Effect: ...} link in the item's description.
	Does nothing if it's already injected or no such link exists.
*/
async function annotateEffectLinkBeforeUse(item) {
	setTimeout(async () => {
		try {
			if (!item) return;

			const desc = item.system?.description?.value ?? '';
			if (!desc) return;

			// Already injected? bail.
			if (/>\s*Apply before using\s*:\s*<\/strong>\s*\@UUID\[/i.test(desc)) {
				debugLog(`annotateEffectLinkBeforeUse: already present for ${item.name}`);
				return;
			}

			// Only the @UUID[...] {Effect: ...} pattern
			const uuidEffectRe = /(\@UUID\[[^\]]+\]\{\s*Effect:\s*[^}]+\})/i;

			if (!uuidEffectRe.test(desc)) {
				debugLog(`annotateEffectLinkBeforeUse: no @UUID Effect link in ${item.name}`);
				return;
			}

			const updated = desc.replace(uuidEffectRe, (_m, g1) => {
				return `<p><strong> Apply before using: </strong>${g1}</p>`;
			});

			if (updated !== desc) {
				await item.update({ 'system.description.value': updated });
				debugLog(`annotateEffectLinkBeforeUse: injected label for ${item.name}`);
			}
		} catch (err) {
			debugLog(`annotateEffectLinkBeforeUse ERROR: ${err?.message || err}`);
			console.error(err);
		}
	}, 100);
}


//	Function to apply Powerful Alchemy effects to item created by Alchemist
async function applyPowerfulAlchemy(item,actor,alchemistDC){
	// Delay to allow item to finish embedding (avoids Foundry V12 timing issues)
	setTimeout(async () => {
		try {
			if (!item || !item.system?.traits?.value?.includes("alchemical")) {
				debugLog(`Item (${item?.name}) does not have the 'alchemical' trait or item is undefined.`);
				return;
			}

			if (!item.system.traits.value.includes("infused")) {
				debugLog(`Item (${item.name}) does not have the 'infused' trait.`);
				return;
			}

			debugLog(`Infused item created! Item: `, item);

			let description = item.system.description.value;

			const replacements = [
				{
					pattern: /@Check\[(?!flat)\w+\|dc:(\d+)(?:\|[^\]]+)?\]/g,
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
				await item.update({ "system.description.value": updatedDescription });
				debugLog(`Description was updated to Class DC: ${alchemistDC}`);

				await ChatMessage.create({
					author: game.user?.id,
					content: `<h3>Powerful Alchemy:</h3><p>${item.name} ${LOCALIZED_TEXT.POWERFUL_ALCHEMY_UPDATED_CLASS_DC} ${alchemistDC}!</p>`,
					speaker: { alias: "Powerful Alchemy" }
				});
			}

			// Update any matching Note rule elements with the new description
			let updatedRules = item.system.rules.map(rule => {
				if (rule.key === "Note" && rule.selector.includes("{item|_id}-damage")) {
					debugLog(`Updating Note Rule Element for ${item.name}`);
					return {
						...rule,
						text: updatedDescription
					};
				}
				return rule;
			});

			if (JSON.stringify(updatedRules) !== JSON.stringify(item.system.rules)) {
				await item.update({ "system.rules": updatedRules });
				debugLog(`Updated Note Rule Element for ${item.name} to use new description.`);
			}
		} catch (err) {
			debugLog(`Error in applyPowerfulAlchemy: ${err.message}`);
			console.error(err); // Optional: for debugging during development
		}
	}, 100);
}

/* ========================================================================== */
/* Unstable Concoction — minimal flow (chooser + inventory + craft)           */
/* ========================================================================== */

/*	Mutate RAW item data to be “Unstable”:
	- rename
	- mark a flag (namespace this module)
	- bump the FIRST dice step found in healing/damage formula, else in description (@Damage[(XdY+…)]
	- append the Unstable note (DC 10 flat; @Damage[level][acid])
*/
function _unstableMutateRawItemData(raw) {
	try {
		// name
		raw.name = `${raw.name} (Unstable)`;

		// flag
		raw.flags = raw.flags ?? {};
		raw.flags["pf2e-alchemist-remaster-ducttape"] = raw.flags["pf2e-alchemist-remaster-ducttape"] ?? {};
		raw.flags["pf2e-alchemist-remaster-ducttape"].unstableConcoction = true;

		// bump first dice group (d4→d6→d8→d10→d12) once
		const bumpFirst = (s) => {
			try {
                const order = ["d4","d6","d8","d10","d12"];
				let done = false;
				return String(s).replace(/d(4|6|8|10|12)\b/i, (m) => {
					if (done) return m;
					done = true;
					const i = order.indexOf(m.toLowerCase());
					return order[Math.min(i + 1, order.length - 1)];
				});
			} catch { return s; }
		};

		// try explicit formula fields first
		const healPath = "system.healing.formula";
		const dmgPaths = ["system.damage.formula", "system.damage.value"];
		const heal = foundry.utils.getProperty(raw, healPath);
		if (typeof heal === "string" && heal.trim()) {
			foundry.utils.setProperty(raw, healPath, bumpFirst(heal));
		}
		for (const p of dmgPaths) {
			const cur = foundry.utils.getProperty(raw, p);
			if (typeof cur === "string" && cur.trim()) {
				foundry.utils.setProperty(raw, p, bumpFirst(cur));
				break;
			}
		}

		// fallback: bump first dice in description (covers @Damage[(5d6+12)[healing]])
		const descPath = "system.description.value";
		const curDesc = String(foundry.utils.getProperty(raw, descPath) ?? "");
		let nextDesc = curDesc;
		if (/\d+d(4|6|8|10|12)/i.test(curDesc)) nextDesc = bumpFirst(curDesc);

		// append Unstable note once
		if (!/Unstable:\s/i.test(nextDesc)) {
			const lvl = Number(raw?.system?.level?.value ?? raw?.system?.level ?? 0) || 0;
			nextDesc += `<p><em>Unstable:</em> When this item is activated, the creature activating it must succeed at a @Check[type:flat|dc:10] or take @Damage[${lvl}][acid].</p>`;
		}
		foundry.utils.setProperty(raw, descPath, nextDesc);
	} catch (e) {
		debugLog(3, `_unstableMutateRawItemData() failed: ${e?.message ?? e}`);
	}
}

//	Chooser (two buttons): Use from Inventory / Craft Item
export async function displayUnstableConcoctionDialog(actor) {
	try {
		if (!actor) {
			debugLog(3, "displayUnstableConcoctionDialog(): no actor provided");
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
					<p style="margin:0;opacity:.85;">${LOCALIZED_TEXT.UNSTABLE_NOTE}</p>
					${hasVialFns ? `<p style="margin:0;opacity:.85;">${LOCALIZED_TEXT.VERSATILE_VIALS ?? "Versatile Vials"}: <strong>${vialCount}</strong></p>` : ""}
				</div>
			`,
			buttons: [
				{
					action: "inventory",
					label: LOCALIZED_TEXT.INVENTORY,
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
					tooltip: canCraft ? "" : (LOCALIZED_TEXT.NO_VIALS_TOOLTIP ?? "No Versatile Vials available"),
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
						try { if (typeof qaDialog === "function") qaDialog(actor); } catch {}
					}
				}
			],
			default: "inventory",
			render: (_ev, dialog) => {
                try {
					if (typeof qaClampDialog === "function") qaClampDialog(dialog, 400);
					const host = dialog?.element;
					const root = host?.shadowRoot ?? host;
					if (!root) return;
					const craftBtn = root.querySelector('button[data-action="craft"]');
					if (craftBtn && !canCraft) {
						craftBtn.disabled = true;
						craftBtn.title = LOCALIZED_TEXT.NO_VIALS_TOOLTIP ?? "No Versatile Vials available";
						craftBtn.style.opacity = "0.6";
					}
				} catch (err) {
					debugLog(3, `displayUnstableConcoctionDialog(): render failed: ${err?.message ?? err}`);
				}
			}
		});
	} catch (err) {
		debugLog(3, `displayUnstableConcoctionDialog() failed: ${err?.message ?? err}`);
	}
}

/*	Use from Inventory → list actor items with traits alchemical+consumable
	- decrements the base stack by 1
	- embeds a 1-qty Unstable copy (owned), ready to activate later
*/
export async function displayUnstableInventoryDialog(actor) {
	try {
		if (!actor) return;

		// match: actor inventory items with traits alchemical + consumable, EXCLUDING already-unstable
		const items = (actor.items ?? []).filter(i => {
			const tr = i?.system?.traits?.value ?? [];
			const isMatch = i?.type === "consumable" && tr.includes("alchemical") && tr.includes("consumable");
			if (!isMatch) return false;
			const flagged = !!i.getFlag?.("pf2e-alchemist-remaster-ducttape", "unstableConcoction");
			const named = String(i?.name ?? "").toLowerCase().includes("(unstable)");
			return !(flagged || named);
		});

		if (!items.length) {
			debugLog(2, "displayUnstableInventoryDialog() | no eligible alchemical consumables on actor");
			return;
		}

		const options = items.map(i => `<option value="${i.uuid}">${i.name}</option>`).join("");

		await qaOpenDialogV2({
			window: { title: LOCALIZED_TEXT.UNSTABLE_CONCOCTION_BTN },
			classes: ["quick-alchemy-dialog"],
			content: `
				<form>
					<div class="qa-wrapper">
						<h3>${LOCALIZED_TEXT.QUICK_ALCHEMY_SELECT_ITEM_TYPE("Alchemical Consumable")}</h3>
						<select id="unstable-inv" style="display:inline-block;margin-top:5px;width:100%;">${options}</select>
						<hr/>
						<p style="opacity:.8;">${LOCALIZED_TEXT.UNSTABLE_NOTE}</p>
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
							debugLog(3, `unstable inventory | qty dec failed: ${e?.message ?? e}`);
						}

						// embed a mutated 1-qty copy
						const raw = foundry.utils.deepClone(base.toObject());
						delete raw._id;
						foundry.utils.setProperty(raw, "system.quantity", 1);
						_unstableMutateRawItemData(raw);

						const [ownedTmp] = await actor.createEmbeddedDocuments("Item", [raw]);
						if (!ownedTmp) return;

						try { dialog?.close?.(); } catch {}
						await ChatMessage.create({
							speaker: ChatMessage.getSpeaker({ actor }),
							content: `<p><strong>${ownedTmp.name}</strong> added to inventory (Unstable).</p>`
						});
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
		debugLog(3, `displayUnstableInventoryDialog() failed: ${e?.message ?? e}`);
	}
}

/*	Craft path:
	- build list from actor.system.crafting.formulas
	- resolve name & traits via qaGetIndexEntry(uuid)
	- on craft: if global craftButton() exists -> use it (your existing pipeline)
	  otherwise: embed a 1-qty copy of the formula doc
*/
export async function displayUnstableCraftDialog(actor) {
	try {
		if (!actor) return;

		// require at least 1 Versatile Vial to proceed
		if (typeof getVersatileVialCount === "function") {
			const vv = Number(getVersatileVialCount(actor) ?? 0);
			if (vv <= 0) {
				debugLog(2, "displayUnstableCraftDialog() | no Versatile Vials available");
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

		if (!craftChoices.length) {
			debugLog(2, "displayUnstableCraftDialog() | no matching formulas");
		}

		const options = craftChoices.map(e => `<option value="${e.uuid}">${e.name}</option>`).join("");

		await qaOpenDialogV2({
			window: { title: LOCALIZED_TEXT.UNSTABLE_CONCOCTION_BTN },
			classes: ["quick-alchemy-dialog"],
			content: `
				<form>
					<div class="qa-wrapper">
						<h3>${LOCALIZED_TEXT.QUICK_ALCHEMY_SELECT_ITEM_TYPE("Alchemical Consumable")}</h3>
						<select id="unstable-formula" style="display:inline-block;margin-top:5px;width:100%;">${options}</select>
						<hr/>
						<p style="opacity:.8;">${LOCALIZED_TEXT.UNSTABLE_NOTE}</p>
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
								debugLog(2, "displayUnstableCraftDialog() | failed to consume Versatile Vial");
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
										await ChatMessage.create({
											speaker: ChatMessage.getSpeaker({ actor }),
											content: `<p><strong>${ownedTmp.name}</strong> crafted and added to inventory (Unstable).</p>`
										});
									}
									return;
								}
							} catch (e) {
								debugLog(3, `displayUnstableCraftDialog() | craftButton failed: ${e?.message ?? e}`);
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
								await ChatMessage.create({
									speaker: ChatMessage.getSpeaker({ actor }),
									content: `<p><strong>${ownedTmp.name}</strong> crafted and added to inventory (Unstable).</p>`
								});
							}
						} catch (e) {
							debugLog(3, `displayUnstableCraftDialog() | embed fallback failed: ${e?.message ?? e}`);
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
		debugLog(3, `displayUnstableCraftDialog() failed: ${e?.message ?? e}`);
	}
}
