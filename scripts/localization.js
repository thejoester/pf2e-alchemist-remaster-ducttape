/*
	ARDT Localization, dynamic LT
	- Any key path becomes a key under "ardt"
	- LT.acid()                        -> localize "ardt.acid"
	- LT.notifItemEquipped({itemname}) -> format   "ardt.notifItemEquipped"

	Replaces the old hand-maintained LOCALIZED_TEXT map; new strings only need a
	lang/en.json entry, never an edit here. Previous version kept as
	localization.js.bak while the call sites are migrated.
*/
import { debugLog } from "./settings.js";

export const ARDT_ID = "ardt";

// L: localize a key (no placeholders)
export function L(key) {
	try {
		if (!game?.i18n?.translations || Object.keys(game.i18n.translations).length === 0) return key;
		const s = game.i18n.localize(key);
		if (s === key) debugLog(2, `L(): missing key: ${key}`);
		return s;
	} catch (err) {
		debugLog(3, "L(): error", err);
		return key;
	}
}

// LF: format a key with {placeholders}
export function LF(key, data = {}) {
	try {
		const out = game.i18n.format(key, data);
		if (out === key) debugLog(2, `LF(): missing key: ${key}`, data);
		return out;
	} catch (err) {
		debugLog(3, "LF(): error", err);
		return key;
	}
}

// Dynamic LT: property chain -> key path under "ardt"; call with object => LF, else L
function makeNode(key) {
	const fn = (data) => (data && typeof data === "object" ? LF(key, data) : L(key));
	return new Proxy(fn, {
		get(_t, prop) {
			if (prop === "prototype" || prop === "name" || prop === "length") return undefined;
			if (prop === "_key") return key;
			return makeNode(key ? key + "." + String(prop) : String(prop));
		}
	});
}

export const LT = makeNode(ARDT_ID);
