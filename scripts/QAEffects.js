import { debugLog  } from './settings.js';
console.log("%cPF2e Alchemist Remaster Duct Tape | QAEffects.js loaded","color: aqua; font-weight: bold;");

/* 
	Quick Alchemy Effects
	This script file handles when effects are applied on an actor, it checks 
	the origin of the effect, and if that origin is from an item created 
	by Quick Alchemy, it will set a maximum duration of 10 minutes per RAW:
	
	https://2e.aonprd.com/Actions.aspx?ID=2801
*/

// Check for tag that means this is a QA item
function isQuickAlchemyItem(item) {
	if (!item) return false;
		debugLog(`QAeffects.js: isQuickAlchemyItem() on ${item.name}`);
	if (item.system?.ductTaped === true){ 
		debugLog(`QAeffects.js: isQuickAlchemyItem() = true`);
		return true;
	}
	debugLog(`QAeffects.js: isQuickAlchemyItem() = false`);
	return false;
}

// Limit duration on QA effects
Hooks.on('preCreateItem', async (effect, data) => {
	try {
		debugLog('QAEffects.js: preCreateItem(effect) hook fired', { effect, data });
		//if (!game.user.isGM) return;
		if (data?.type !== 'effect') return;

		const actor = effect.actor;
		if (!actor) return;

		// Pull origin from the effect being embedded
		const rawOrigin =
			data?.system?.context?.origin
			?? effect?.system?.context?.origin
			?? effect?.flags?.pf2e?.origin
			?? null;

		let originUuid = null;

		// Support both PF2e styles: direct string or structured object
		if (typeof rawOrigin === "string") {
			originUuid = rawOrigin;
		} else if (rawOrigin && typeof rawOrigin === "object") {
			originUuid =
				rawOrigin.item
				|| rawOrigin.uuid
				|| rawOrigin.document
				|| rawOrigin.sourceId
				|| rawOrigin.itemUuid
				|| null;
		}

		// Snapshot current duration
		const before = {
			unit: data?.system?.duration?.unit ?? effect?.system?.duration?.unit ?? null,
			value: data?.system?.duration?.value ?? effect?.system?.duration?.value ?? null,
			expiry: data?.system?.duration?.expiry ?? effect?.system?.duration?.expiry ?? null,
			sustained: data?.system?.duration?.sustained ?? effect?.system?.duration?.sustained ?? false
		};

		debugLog('QAEffects.js: preCreateItem(effect) seen', {
			effectName: data?.name ?? effect?.name,
			effectActor: actor.name,
			durationBefore: before,
			originUuid,
		});

		// If we have no origin UUID, try to infer it from ductTaped Quick Alchemy items on this actor
		if (!originUuid) {
			const effectName = (data?.name ?? effect?.name ?? "").toLowerCase();

			// Look for a QA item on the same actor whose base name matches this effect
			const guessedSource = actor.items.find(i => {
				if (!isQuickAlchemyItem(i)) return false;

				// Strip our temporary marker(s) from the QA item name
				const baseName = i.name
					.replace(/\(\*temporary\)/gi, "")
					.replace(/\(\*poisoned\)/gi, "")
					.trim()
					.toLowerCase();

				if (!baseName) return false;

				// Common PF2e pattern: "Effect: Quicksilver Mutagen (Greater)"
				return effectName.includes(baseName);
			});

			if (guessedSource) {
				originUuid = guessedSource.uuid;
				debugLog('QAEffects.js: derived origin from ductTaped item on actor', {
					effectName: data?.name ?? effect?.name,
					sourceItem: guessedSource.name,
					originUuid
				});
			}
		}

		// If we still have no origin UUID, we can't safely say it's from Quick Alchemy
		if (!originUuid) {
			debugLog('QAEffects.js: no origin UUID on effect – skipping limit', {
				rawOrigin
			});
			return;
		}

		let isQA = false;
		let via = null;

		// Try resolving the origin item live
		let sourceItem = null;
		try { sourceItem = await fromUuid(originUuid); } catch { /* ignore */ }

		if (sourceItem) {
			const ductTaped = isQuickAlchemyItem(sourceItem);
			if (ductTaped) {
				isQA = true;
			}
		}

		if (!isQA) {
			debugLog('QAEffects.js: not a QA source – skipping limit', { originUuid });
			return;
		}

		// Only limit if the duration actually exceeds 10 minutes
		const needsCap = (() => {
			if (!before?.unit) return false;
			if (before.unit === 'minutes') return (before.value ?? 0) > 10;
			if (['hours', 'days', 'rounds'].includes(before.unit)) return true;
			return false;
		})();

		if (!needsCap) {
			debugLog('QAEffects.js: duration already <= 10 minutes – no clamp', { before, via });
			return;
		}

		const newDuration = {
			unit: 'minutes',
			value: 10,
			expiry: before.expiry ?? 'turn-start',
			sustained: false
		};

		effect.updateSource({ system: { duration: newDuration } });
		effect.updateSource({ [`flags.pf2e-alchemist-remaster-ducttape.quickAlchemy`]: true });

		debugLog('QAEffects.js: effect duration limited to 10 minutes', {
			effectName: data?.name ?? effect?.name,
			durationAfter: newDuration
		});

	} catch (err) {
		debugLog('QAEffects.js: preCreateItem ERROR', { err });
	}
});