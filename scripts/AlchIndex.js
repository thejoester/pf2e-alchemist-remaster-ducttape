import { debugLog, getSetting } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";
console.log("%cPF2e Alchemist Remaster Duct Tape | AlchIndex.js loaded","color: aqua; font-weight: bold;");

// Ensure a global namespace for macros to call into
window.PF2E_ARDT_INDEX ??= {};


/*	===== Exported Functions =====

*/
	
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
				ui.notifications.info(LOCALIZED_TEXT.INDEX_DONE_BODY?.(0) ?? "Alchemical index rebuilt.");
			}

			debugLog("AlchIndex.js: qaForceRebuildAlchIndex complete");
		} catch (err) {
			debugLog(`AlchIndex.js: qaForceRebuildAlchIndex error: ${err?.message ?? err}`);
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
		debugLog("AlchIndex.js: qaBuildOrUpdateAlchIndex start");

		// Packs to scan
		const userPacks = (game.settings.get("pf2e-alchemist-remaster-ducttape", "compendiums") ?? [])
			.filter(Boolean);
		const packs = ["pf2e.equipment-srd", ...userPacks];

		// Open non-blocking progress dialog
		let progressRoot = null;
		const progressDlg = new foundry.applications.api.DialogV2({
			window: { title: LOCALIZED_TEXT.INDEX_PROGRESS_TITLE },
			classes: ["quick-alchemy-dialog"],
			content: `
				<form>
					<div class="qa-wrapper" style="min-width:320px;max-width:520px">
						<p>${LOCALIZED_TEXT.INDEX_PROGRESS_HINT}</p>
						<div id="qa-idx-status" style="margin:.5em 0 1em 0"></div>
						<progress id="qa-idx-progress" max="100" value="0" style="width:100%"></progress>
						<button type="button" data-action="close" style="display:none"></button>
					</div>
				</form>
			`,
			buttons: [
				{ action: "close", label: LOCALIZED_TEXT.CLOSE, callback: () => {} }
			],
			render: (_ev, dialog) => {
				const host = dialog.element;
				progressRoot = host?.shadowRoot ?? host;
			}
		});
		progressDlg.render(true);

		// Load existing index (or start fresh)
		const prev = game.settings.get("pf2e-alchemist-remaster-ducttape", "alchIndex") ?? { meta: {}, items: {} };
		const items = fullRebuild ? {} : (prev.items ?? {});

		const setStatus = (msg) => {
			const el = progressRoot?.querySelector("#qa-idx-status");
			if (el) el.textContent = msg;
		};
		const setProgress = (pct) => {
			const el = progressRoot?.querySelector("#qa-idx-progress");
			if (el) el.value = Math.max(0, Math.min(100, pct));
		};

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

			setStatus(LOCALIZED_TEXT.INDEX_PROGRESS_PACK(key));

			const idx = await pack.getIndex({
				fields: ["name", "system.slug", "system.traits.value", "system.description.value"]
			});

			for (const e of idx) {
				done++;
				setProgress((done / Math.max(1, total)) * 100);

				const traits = e.system?.traits?.value ?? [];
				if (!traits.includes("alchemical")) continue;

				let html = e.system?.description?.value ?? "";
				let slug = e.system?.slug ?? "";

				if (!html || !slug) {
					const doc = await fromUuid(`Compendium.${pack.collection}.Item.${e._id}`);
					if (!html) html = doc?.system?.description?.value ?? "";
					if (!slug) slug = doc?.system?.slug ?? "";
				}

				const uuid = `Compendium.${pack.collection}.Item.${e._id}`;
				items[uuid] = { uuid, name: e.name, slug, description: html };

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
		debugLog(`AlchIndex.js: Saved index with ${Object.keys(items).length} entries`);

		// Close progress window and toast “done”
		progressDlg.close({ force: true });
		ui.notifications.info(
			`${LOCALIZED_TEXT.INDEX_DONE_TITLE}: ${LOCALIZED_TEXT.INDEX_DONE_BODY(Object.keys(items).length)}`
		);
	}


/*	===== Hooks =====
*/

Hooks.once("ready", async () => {
	
	//	make macros accessible
	window.qaForceRebuildAlchIndex = qaForceRebuildAlchIndex;
	window.PF2E_ARDT_INDEX.qaForceRebuildAlchIndex = qaForceRebuildAlchIndex;
	
	try {
		debugLog("AlchIndex.js: ready hook hit");
		if (!game.user.isGM) return;

		const NS = "pf2e-alchemist-remaster-ducttape";
		const meta = game.settings.get(NS, "alchIndexMeta") ?? {};
		const systemVersion = game.system?.version ?? "0.0.0";
		const locale = game.i18n?.lang ?? "en";
		const changed =
			!meta.systemVersion || !meta.locale ||
			meta.systemVersion !== systemVersion || meta.locale !== locale;

		debugLog(`AlchIndex.js: meta=${JSON.stringify(meta)} | sys=${systemVersion} | locale=${locale} | changed=${changed}`);
		if (!changed) return;

		const msg = typeof LOCALIZED_TEXT?.INDEX_PROMPT_MSG === "function"
			? LOCALIZED_TEXT.INDEX_PROMPT_MSG(meta.systemVersion || "-", systemVersion, meta.locale || "-", locale)
			: game.i18n.format("PF2E_ALCHEMIST_REMASTER_DUCTTAPE.INDEX_PROMPT_MSG", {
				oldSystemVersion: meta.systemVersion || "-",
				systemVersion,
				oldLocale: meta.locale || "-",
				locale
			});

		const ok = await foundry.applications.api.DialogV2.confirm({
			window: { title: LOCALIZED_TEXT.INDEX_PROMPT_TITLE },
			content: `<p style="white-space:pre-wrap">${msg}</p>`
		});
		debugLog(`AlchIndex.js: Dialog choice: ${ok ? "OK" : "Cancel"}`);
		if (!ok) return;

		await qaForceRebuildAlchIndex({ reason: "auto-prompt" });
	} catch (err) {
		debugLog(`AlchIndex.js: ready hook error: ${err?.message ?? err}`);
	}
});
