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
	const hasJson = fs.readdirSync(srcDir).some(f => f.endsWith(".json") && f !== "index.json");
	if (!hasJson) {
		process.stdout.write(`Skip (empty _source): ${srcDir}\n`);
		continue;
	}

	// wipe target, then compile
	rmrf(packDir);
	mkdirp(packDir);

	process.stdout.write(`Compiling ${srcDir} -> ${packDir}\n`);
	await compilePack(srcDir, packDir, { log: true });

	// sanity check: ensure MANIFEST + at least one .ldb exist
	const files = fs.readdirSync(packDir);
	const hasManifest = files.some(n => /^MANIFEST-\d+$/i.test(n));
	const hasLdb = files.some(n => /\.ldb$/i.test(n));
	if (!hasManifest || !hasLdb) {
		throw new Error(`Pack looks incomplete: ${packDir} (manifest=${hasManifest}, ldb=${hasLdb})`);
	}
}

process.stdout.write("Done.\n");
