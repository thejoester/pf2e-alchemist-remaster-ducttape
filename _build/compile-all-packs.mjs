import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const moduleJson = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));
const packs = Array.isArray(moduleJson.packs) ? moduleJson.packs : [];

function rmrf(p) {
	try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}
function mkdirp(p) {
	fs.mkdirSync(p, { recursive: true });
}

function pruneLevelDBDir(dir) {
	try {
		const currentPath = path.join(dir, "CURRENT");
		if (!fs.existsSync(currentPath)) return;

		const current = fs.readFileSync(currentPath, "utf8").trim(); 
		const keepManifest = current.replace(/\s+/g, "");

		const entries = fs.readdirSync(dir);
		for (const name of entries) {
			const full = path.join(dir, name);
			const stat = fs.statSync(full);

			// always keep CURRENT
			if (name === "CURRENT") continue;

			// keep the referenced MANIFEST
			if (name === keepManifest) continue;

			// keep .ldb tables
			if (/\.ldb$/i.test(name)) continue;

			// remove LOG.old always
			if (name === "LOG.old") { rmrf(full); continue; }

			// remove MANIFEST-* that aren't the active one
			if (/^MANIFEST-\d+$/i.test(name) && name !== keepManifest) { rmrf(full); continue; }

			// remove 0-byte or tiny .log files (noise)
			if (/\.log$/i.test(name) && stat.size < 4 * 1024) { rmrf(full); continue; }

			// everything else: keep (LOG, non-tiny .log) – these are small anyway
		}
	} catch (e) {
		// non-fatal; 
	}
}

if (!packs.length) {
	process.stdout.write("No packs declared in module.json\n");
	process.exit(0);
}

for (const p of packs) {
	const packDir = path.resolve(ROOT, p.path);
	const srcDir = path.join(packDir, "_source");

	if (!fs.existsSync(srcDir)) {
		process.stdout.write(`Skip (no _source): ${srcDir}\n`);
		continue;
	}

	// Wipe LevelDB dir so we get a fresh compact build
	rmrf(packDir);
	mkdirp(packDir);

	process.stdout.write(`Compiling ${srcDir} -> ${packDir}\n`);
	await compilePack(srcDir, packDir, { log: true });

	// Prune old MANIFESTs / tiny logs to reduce file count
	pruneLevelDBDir(packDir);
}

process.stdout.write("Done.\n");
