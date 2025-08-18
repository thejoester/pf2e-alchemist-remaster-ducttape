import { debugLog  } from './settings.js';
console.log("%cPF2e Alchemist Remaster Duct Tape | QAEffects.js loaded","color: aqua; font-weight: bold;");

/* 
	Quick Alchemy Effects
	This script file handles when effects are applied on an actor, it checks 
	the origin of the effect, and if that origin is from an item created 
	by Quick Alchemy, it will set a maximum duration of 10 minutes per RAW:
	
	https://2e.aonprd.com/Actions.aspx?ID=2801
*/

// Limit duration to 10 min if needed
function needsTenMinuteCap(dur) {
	if (!dur) return false;
	if (dur.unit === 'minutes') return (dur.value ?? 0) > 10;
	if (['hours', 'days', 'rounds'].includes(dur.unit)) return true;
	return false;
}

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
		if (!game.user.isGM) return;			// Only process as GM
		if (data?.type !== 'effect') return;	// Only process for Effects

		const actor = effect.actor;
		if (!actor) return;

		// Pull origin from the effect being embedded
		const rawOrigin = data?.system?.context?.origin
			?? effect?.system?.context?.origin
			?? null;

		// Be generous about where the UUID could be stored
		const originUuid =
			rawOrigin?.item
			|| rawOrigin?.uuid
			|| rawOrigin?.document
			|| null;

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

		// If we have no origin UUID at all, we can't verify... bail early.
		if (!originUuid) {
			debugLog('QAEffects.js: no origin UUID on effect – skipping limit', {});
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