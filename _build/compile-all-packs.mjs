import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const moduleJson = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));
const packs = Array.isArray(moduleJson.packs) ? moduleJson.packs : [];

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

	// wipe the LevelDB dir so we get a fresh, compact build
	fs.rmSync(packDir, { recursive: true, force: true });
	fs.mkdirSync(packDir, { recursive: true });

	process.stdout.write(`Compiling ${srcDir} -> ${packDir}\n`);
	await compilePack(srcDir, packDir, { log: true });		
}

process.stdout.write("Done.\n");
