import { debugLog, getSetting } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";
console.log("%cPF2e Alchemist Remaster Duct Tape | AlchIndex.js loaded","color: aqua; font-weight: bold;");

// Ensure a global namespace for macros to call into
window.PF2E_ARDT_INDEX ??= {};


/*	===== Exported Functions =====

*/
	
	// Function to search index by uuid and return slug
	export async function qaGetIndexEntry(uuid) {
		const index = game.settings.get("pf2e-alchemist-remaster-ducttape", "alchIndex") || {};
		const entry = index?.items?.[uuid] ?? null;
		debugLog(`AlchIndex.js: qaGetIndexEntry(${uuid}} \n`, entry);
		return entry;
	}
	
	// Function to search index by uuid and return slug
	export async function qaGetSlugFromUuid(uuid){
		const entry = getAlchIndex();
		debugLog(`AlchIndex.js: qaGetSlugFromUuid(${uuid}) \n`, entry?.items?.[uuid]?.slug);
		return entry?.items?.[uuid]?.slug ?? null;
	}
	
	
	//	Get Alchemical items Index
	export function getAlchIndex() {
		return game.settings.get("pf2e-alchemist-remaster-ducttape","alchIndex") ?? { items: {}, meta: {} };
	}
	
	//	Save Alchemical items index
	export function setAlchIndex(v) {
		return game.settings.set("pf2e-alchemist-remaster-ducttape","alchIndex", v);
	}
	
	//	Get Meta data for Alchemical Index (system version / locale)
	export function getAlchIndexMeta() {
		return game.settings.get("pf2e-alchemist-remaster-ducttape","alchIndexMeta") ?? { systemVersion: "", locale: "", lastBuilt: 0, itemCount: 0 };
	}
	
	//	Save Meta data for Alchemical Index (system version / locale)
	export function setAlchIndexMeta(v) {
		return game.settings.set("pf2e-alchemist-remaster-ducttape","alchIndexMeta", v);
	}
	
	// Function to kick off rebuild of index
	export async function qaForceRebuildAlchIndex({ silent = false, reason = "manual" } = {}) {
		try {
			debugLog(`AlchIndex.js: qaForceRebuildAlchIndex start | reason=${reason}`);

			const NS = "pf2e-alchemist-remaster-ducttape";
			const systemVersion = game.system?.version ?? "0.0.0";
			const locale = game.i18n?.lang ?? "en";

			// call the actual builder you defined below
			await qaBuildOrUpdateAlchIndex({
				fullRebuild: true,
				meta: { systemVersion, locale }
			});

			await game.settings.set(NS, "alchIndexMeta", {
				systemVersion,
				locale,
				updatedAt: Date.now()
			});

			if (!silent) {
				debugLog(LOCALIZED_TEXT.INDEX_DONE_BODY?.(0) ?? "Alchemical index rebuilt.");
			}

			debugLog("AlchIndex.js: qaForceRebuildAlchIndex complete");
		} catch (err) {
			debugLog(`AlchIndex.js: qaForceRebuildAlchIndex error: \nMessage: ${err?.message ?? err} \n`);
		}
}
	
/*	===== Macro Functions =====
*/
	// GM-only: confirm, then clear the built index + meta
	PF2E_ARDT_INDEX.clearIndexWithPrompt = async function () {
		const NS = "pf2e-alchemist-remaster-ducttape";
		try {
			if (!game.user.isGM) {
				ui.notifications.warn(game.i18n.localize("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.GM_ONLY"));
				return;
			}

			const ok = await foundry.applications.api.DialogV2.confirm({
				window: { title: LOCALIZED_TEXT.INDEX_CLEAR_PROMPT_TITLE },
				content: `<p style="white-space:pre-wrap">${LOCALIZED_TEXT.INDEX_CLEAR_PROMPT_BODY}</p>`
			});
			debugLog("AlchIndex.js: clear prompt choice:", ok ? "OK" : "Cancel");
			if (!ok) {
				ui.notifications.info(LOCALIZED_TEXT.INDEX_CLEAR_ABORTED);
				return;
			}

			await game.settings.set(NS, "alchIndex", {});
			await game.settings.set(NS, "alchIndexMeta", {
				systemVersion: "",
				locale: "",
				updatedAt: 0,
				itemCount: 0
			});

			debugLog("AlchIndex.js: alchIndex + alchIndexMeta cleared");
			ui.notifications.info(LOCALIZED_TEXT.INDEX_CLEAR_DONE);
		} catch (err) {
			debugLog(3, `AlchIndex.js: clearIndexWithPrompt error: ${err?.message ?? err}`);
			ui.notifications.error(LOCALIZED_TEXT.INDEX_CLEAR_FAILED);
		}
	};

	//	Function to build/rebuild index
	async function qaBuildOrUpdateAlchIndex({ fullRebuild, meta }) {
		const start = performance.now();
		debugLog("AlchIndex.js: qaBuildOrUpdateAlchIndex start");
		
		// Packs to scan
		const userPacks = (game.settings.get("pf2e-alchemist-remaster-ducttape", "compendiums") ?? [])
			.filter(Boolean);
		const packs = ["pf2e.equipment-srd", "pf2e-alchemist-remaster-ducttape.alchemist-duct-tape-items", ...userPacks];

		// Load existing index (or start fresh)
		const prev = game.settings.get("pf2e-alchemist-remaster-ducttape", "alchIndex") ?? { meta: {}, items: {} };
		const items = fullRebuild ? {} : (prev.items ?? {});

		// First pass: count items
		let total = 0;
		for (const key of packs) {
			const pack = game.packs.get(key);
			if (!pack) continue;
			const index = await pack.getIndex({ fields: ["type", "system.traits.value", "name"] });
			total += index.size;
		}
		debugLog(`AlchIndex.js: Counting done, total=${total}`);

		// Second pass: fetch docs and filter alchemical
		let done = 0;
		let lastYield = performance.now();

		for (const key of packs) {
			const pack = game.packs.get(key);
			if (!pack) continue;

			debugLog(`AlchIndex.js: Processing pack ${key}`);

			const idx = await pack.getIndex({
				fields: ["name", "img", "system.slug", "system.traits.value", "system.traits.rarity", "system.description.value", "system.level.value"]
			});

			for (const e of idx) {
				done++;

				// Fields to store in Index
				const traits = e.system?.traits?.value ?? [];
				if (!traits.includes("alchemical")) continue; // filter only Alchemical items
				let html = e.system?.description?.value ?? "";
				let slug = e.system?.slug ?? "";
				const img = e.img ?? "";
				const level = e.system?.level?.value ?? null;
				const rarity = e.system.traits?.rarity ?? null;

				if (!html || !slug) {
					const doc = await fromUuid(`Compendium.${pack.collection}.Item.${e._id}`);
					if (!html) html = doc?.system?.description?.value ?? "";
					if (!slug) slug = doc?.system?.slug ?? "";
				}

				const uuid = `Compendium.${pack.collection}.Item.${e._id}`;
				items[uuid] = { uuid, name: e.name, slug, description: html, traits, img, level, rarity  };

				// Yield occasionally to keep UI responsive
				if (performance.now() - lastYield > 16) {
					await new Promise(r => setTimeout(r));
					lastYield = performance.now();
				}
			}
		}

		// Save index with meta
		const final = { meta, items };
		await game.settings.set("pf2e-alchemist-remaster-ducttape", "alchIndex", final);
		const elapsed = ((performance.now() - start) / 1000).toFixed(2);

		debugLog(`AlchIndex.js: Saved index with ${Object.keys(items).length} entries in ${elapsed}s`);
	}

/*	===== Hooks =====
*/

Hooks.once("ready", async () => {
	// Make macros accessible
	window.qaForceRebuildAlchIndex = qaForceRebuildAlchIndex;
	window.PF2E_ARDT_INDEX.qaForceRebuildAlchIndex = qaForceRebuildAlchIndex;

	try {
		debugLog("AlchIndex.js: ready hook hit");
		if (!game.user.isGM) return;

		const start = performance.now();
		debugLog("AlchIndex.js: Auto rebuild triggered at startup");
		
		await qaForceRebuildAlchIndex({ reason: "startup auto-rebuild" });

		const elapsed = ((performance.now() - start) / 1000).toFixed(2);
		debugLog(`AlchIndex.js: Auto rebuild finished in ${elapsed}s`);
	} catch (err) {
		debugLog(`AlchIndex.js: ready hook error: ${err?.message ?? err}`);
	}
	
});