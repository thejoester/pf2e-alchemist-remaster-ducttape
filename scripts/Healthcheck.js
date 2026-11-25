import { debugLog, getSetting, qualifiesForQA, hasFeat, alchemicalEquipmentPackId, ardtItemsPackId } from './settings.js';
import { getAlchIndex, getAlchIndexMeta } from './AlchIndex.js';
import { LT } from './localization.js';

const NS = "pf2e-alchemist-remaster-ducttape";

// status -> html icon/color, markdown emoji, plain-text tag
const STATUS = {
	ok:    { icon: "fa-circle-check",         color: "#2e7d32", md: "✅", txt: "[OK]" },
	warn:  { icon: "fa-triangle-exclamation", color: "#ed6c02", md: "⚠️", txt: "[WARN]" },
	fail:  { icon: "fa-circle-xmark",          color: "#c62828", md: "❌", txt: "[FAIL]" },
	info:  { icon: "fa-circle-info",           color: "#0277bd", md: "ℹ️", txt: "[INFO]" }
};

// count versatile vials on an actor
function vialCount(actor) {
	return actor.items
		.filter(i => i.slug === "versatile-vial")
		.reduce((n, v) => n + (v.system.quantity || 0), 0);
}

// localized on/off label
function onOff(value) {
	return value ? LT.healthcheckOn() : LT.healthcheckOff();
}

// Gather the report as a data model: [{ title, rows: [{ status, text }] }]
function gatherHealthData() {
	const data = [];
	const add = (title, rows) => data.push({ title, rows });

	// --- System ---
	const systemId = game.system?.id ?? "unknown";
	const systemVer = game.system?.version ?? "?";
	const isSf2e = systemId === "sf2e";
	add(LT.healthcheckSystemTitle(), [
		{ status: "info", text: LT.healthcheckSystem({ id: systemId, version: systemVer }) }
	]);

	// --- Required alchemical content ---
	const contentRows = [];
	if (isSf2e) {
		const mod = game.modules.get("pf2e-anachronism");
		const hasPack = !!game.packs.get(alchemicalEquipmentPackId());
		if (!mod) {
			contentRows.push({ status: "fail", text: LT.healthcheckAnachronismMissing() });
		} else if (!mod.active) {
			contentRows.push({ status: "fail", text: LT.healthcheckAnachronismDisabled() });
		} else if (!hasPack) {
			contentRows.push({ status: "fail", text: LT.healthcheckAnachronismNoPack() });
		} else {
			contentRows.push({ status: "ok", text: LT.healthcheckAnachronismOk({ version: mod.version ?? "?" }) });
		}
	} else {
		const hasPack = !!game.packs.get(alchemicalEquipmentPackId());
		contentRows.push(hasPack
			? { status: "ok", text: LT.healthcheckEquipmentPackOk() }
			: { status: "fail", text: LT.healthcheckEquipmentPackMissing() });
	}
	// module's own items pack
	const hasItemsPack = !!game.packs.get(ardtItemsPackId());
	contentRows.push(hasItemsPack
		? { status: "ok", text: LT.healthcheckModuleItemsOk() }
		: { status: "fail", text: LT.healthcheckModuleItemsMissing() });
	add(LT.healthcheckContentTitle(), contentRows);

	// --- Alchemical index ---
	const index = getAlchIndex();
	const meta = getAlchIndexMeta();
	const itemCount = Object.keys(index?.items ?? {}).length;
	const lastBuilt = Number(meta?.lastBuilt ?? 0) || 0;
	const indexRows = [];
	indexRows.push(itemCount === 0
		? { status: "fail", text: LT.healthcheckIndexEmpty() }
		: { status: "ok", text: LT.healthcheckIndexCount({ count: itemCount }) });
	if (lastBuilt > 0) {
		const built = new Date(lastBuilt);
		const ageDays = Math.floor((Date.now() - lastBuilt) / 86400000);
		indexRows.push({
			status: ageDays > 7 ? "warn" : "info",
			text: LT.healthcheckIndexBuilt({ date: built.toLocaleString(), days: ageDays })
		});
	} else {
		indexRows.push({ status: "warn", text: LT.healthcheckIndexNeverBuilt() });
	}
	add(LT.healthcheckIndexTitle(), indexRows);

	// --- Alchemist characters ---
	const charRows = [];
	for (const actor of game.actors) {
		if (actor.type !== "character" && actor.type !== "npc") continue;
		const qa = qualifiesForQA(actor);
		if (!qa.qualifies) continue;
		const kind = qa.isArchetype ? LT.healthcheckActorArchetype() : LT.healthcheckActorClass();
		const extras = [];
		if (!qa.canCraftWeapons) extras.push(LT.healthcheckActorNoWeapons());
		if (!qa.canQuickVial) extras.push(LT.healthcheckActorNoQuickVial());
		if (hasFeat(actor, "improbable-elixirs")) extras.push(LT.healthcheckActorImprobable());
		const extraTxt = extras.length ? ` (${extras.join(", ")})` : "";
		charRows.push({
			status: qa.dc > 0 ? "ok" : "warn",
			text: LT.healthcheckActor({ name: actor.name, kind, dc: qa.dc, vials: vialCount(actor) }) + extraTxt
		});
	}
	if (charRows.length === 0) charRows.push({ status: "info", text: LT.healthcheckNoActors() });
	add(LT.healthcheckActorsTitle(), charRows);

	// --- Key settings ---
	const settingRows = [
		{ status: "info", text: LT.healthcheckSettingPowerful({ state: onOff(getSetting("enablePowerfulAlchemy", false)) }) },
		{ status: "info", text: LT.healthcheckSettingSize({ mode: getSetting("enableSizeBasedAlchemy", "disabled") }) },
		{ status: "info", text: LT.healthcheckSettingLevelUp({ mode: getSetting("addFormulasOnLevelUp", "disabled") }) }
	];
	if (isSf2e && getSetting("suppressAnachronismWarning", false)) {
		settingRows.push({ status: "warn", text: LT.healthcheckSettingWarningSuppressed() });
	}
	add(LT.healthcheckSettingsTitle(), settingRows);

	return data;
}

// Render the data model as the in-window HTML report (with footer buttons)
function reportToHtml(data) {
	const esc = foundry.utils.escapeHTML;
	const blocks = data.map(sec => {
		const rows = sec.rows.map(r => {
			const s = STATUS[r.status] ?? STATUS.info;
			return `<li style="list-style:none;margin:2px 0;"><i class="fas ${s.icon}" style="color:${s.color};width:1.2em;"></i> ${esc(r.text)}</li>`;
		}).join("");
		return `<fieldset style="margin:6px 0;padding:6px 10px;"><legend style="font-weight:bold;">${esc(sec.title)}</legend><ul style="margin:0;padding:0;">${rows}</ul></fieldset>`;
	}).join("");
	return `<div class="ardt-healthcheck" style="display:flex;flex-direction:column;gap:8px;">
		<div style="max-height:55vh;overflow:auto;">${blocks}</div>
		<footer style="display:flex;gap:6px;justify-content:flex-end;">
			<button type="button" data-action="copy-md"><i class="fab fa-markdown"></i> ${esc(LT.healthcheckCopyMd())}</button>
			<button type="button" data-action="copy-text"><i class="fas fa-copy"></i> ${esc(LT.healthcheckCopyText())}</button>
		</footer>
	</div>`;
}

// Render the data model as Markdown (pastes cleanly into GitHub / Discord)
function reportToMarkdown(data) {
	const lines = [`# ${LT.healthcheckTitle()}`, ""];
	for (const sec of data) {
		lines.push(`## ${sec.title}`);
		for (const r of sec.rows) lines.push(`- ${(STATUS[r.status] ?? STATUS.info).md} ${r.text}`);
		lines.push("");
	}
	return lines.join("\n").trim() + "\n";
}

// Render the data model as plain text (no markdown syntax)
function reportToText(data) {
	const title = LT.healthcheckTitle();
	const lines = [title, "=".repeat(title.length), ""];
	for (const sec of data) {
		lines.push(`${sec.title}:`);
		for (const r of sec.rows) lines.push(`  ${(STATUS[r.status] ?? STATUS.info).txt} ${r.text}`);
		lines.push("");
	}
	return lines.join("\n").trim() + "\n";
}

// ApplicationV2 window that shows the health report
class HealthcheckApp extends foundry.applications.api.ApplicationV2 {
	static DEFAULT_OPTIONS = {
		id: "ardt-healthcheck",
		tag: "div",
		window: { title: "healthcheckTitle", icon: "fas fa-stethoscope" },
		position: { width: 560, height: "auto" }
	};

	#data = [];

	get title() {
		return LT.healthcheckTitle();
	}

	async _renderHTML() {
		this.#data = gatherHealthData();
		return reportToHtml(this.#data);
	}

	_replaceHTML(result, content) {
		content.innerHTML = result;
	}

	_onRender(context, options) {
		super._onRender?.(context, options);
		this.element.querySelector('[data-action="copy-md"]')?.addEventListener("click", () => this.#copy("md"));
		this.element.querySelector('[data-action="copy-text"]')?.addEventListener("click", () => this.#copy("text"));
	}

	async #copy(format) {
		const text = format === "text" ? reportToText(this.#data) : reportToMarkdown(this.#data);
		try {
			await game.clipboard.copyPlainText(text);
			ui.notifications.info(LT.healthcheckCopied());
		} catch (e) {
			debugLog(3, `Healthcheck.js: clipboard copy failed: ${e?.message ?? e}`);
			ui.notifications.error(LT.healthcheckCopyFailed());
		}
	}
}

// Open the health report window
export function runAlchemistHealthcheck() {
	new HealthcheckApp().render(true);
}

// Expose the app class so settings.js can register its menu first (top of the section),
// shared via a global to avoid a circular import between the two files
globalThis.PF2E_ARDT_HealthcheckApp = HealthcheckApp;

// expose for macros
Hooks.once("ready", () => {
	window.PF2E_ARDT_INDEX ??= {};
	window.PF2E_ARDT_INDEX.runHealthcheck = runAlchemistHealthcheck;
});
