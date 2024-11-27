Hooks.on("ready", () => {
  console.log("%cPF2e Alchemist Remaster Duct Tape: PowerfulAlchemy.js loaded","color: aqua; font-weight: bold;");
	
	// Function for debugging
	function debugLog(logMsg, logType = "c", logLevel = "1") {
		const debugEnabled = game.settings.get("pf2e-alchemist-remaster-ducttape", "debugEnabled");
		if (!debugEnabled) return;
		
		switch (logType) {
			case "c": //console
				switch (logLevel) {
					case "1": // info/log
						console.log(`%cP2Fe Alchemist Duct Tape (PowerfulAlchemy.js): ${logMsg}`,"color: aqua; font-weight: bold;");
						break;
					case "2": // warn
						console.warn(`P2Fe Alchemist Duct Tape (PowerfulAlchemy.js): ${logMsg}`);
						break;
					case "3": // error
						console.error(`P2Fe Alchemist Duct Tape (PowerfulAlchemy.js): ${logMsg}`);
						break;
					default:
						console.log(`%cP2Fe Alchemist Duct Tape (PowerfulAlchemy.js): ${logMsg}`,"color: aqua; font-weight: bold;");
				}
				break;
			case "u": // ui
				switch (logLevel) {
					case "1": // info/log
						ui.notifications.info(`Alchemist Duct Tape (PowerfulAlchemy.js): ${logMsg}`);
						break;
					case "2": // warn
						ui.notifications.warn(`Alchemist Duct Tape (PowerfulAlchemy.js): ${logMsg}`);
						break;
					case "3": // error
						ui.notifications.error(`Alchemist Duct Tape (PowerfulAlchemy.js): ${logMsg}`);
						break;
					default:
						ui.notifications.info(logMsg);
				}
				break;
			default:
				console.warn(`P2Fe Alchemist Duct Tape (PowerfulAlchemy.js): Invalid log event.`);
		}
	}
	
	//check if Powerful Alchemy is enabled
	const paEnabled = game.settings.get("pf2e-alchemist-remaster-ducttape", "enablePowerfulAlchemy");
	if (paEnabled) {
		debugLog("PowerfulAlchemy enabled.");
		
		Hooks.on("createItem", async (item) => {
			debugLog("Item Created!");
			
			/**
			 Update item description based on regex pattern and replacement logic.
			 @param {string} description - The original item description.
			 @param {RegExp} regexPattern - The regex pattern to match.
			 @param {Function} replacementFn - A function that takes a match and returns a replacement string.
			 @returns {string} - The updated item description.
			*/
			function updateDescription(description, regexPattern, replacementFn) {
				const updatedDescription = description.replace(regexPattern, replacementFn);

				if (updatedDescription !== description) {
					// Output to log
					debugLog("Description was updated to Class DC!");

					// Send Message to Chat
					const itemName = item.name;
					ChatMessage.create({
						author: game.user?.id,    // User ID to send the message as the system
						content: `${itemName} created with Quick Alchemy using Class DC ${classDC}!`,
						speaker: { alias: "PF2e Powerful Alchemy" }  // Optional: sets the speaker to "System"
					});
				}
				return updatedDescription;
			}
			
			/**
			 Check if actor has a feat by searching for the slug, example "powerful-alchemy"
			 @param {actor} actor object.
			 @param {slug} sug of feat.
			 @returns {true/false}
			*/
			function hasFeat(actor, slug) {
				return actor.itemTypes.feat.some((feat) => feat.slug === slug);
			}
			
			// Get the actor from the item's parent (the actor who owns the item)
			const sa = item.parent;
			if (!sa) {
			  debugLog("Actor for item not found.","c", 3);
			  return;
			}
			
			// First check if the actor has Powerful Alchemy - if not return with message in log	
			if (!hasFeat(sa, "powerful-alchemy")) {
				debugLog("Actor does not have Powerful alchemy, ignoring!");
				return;	
			}
			
			// Ensure the item has the 'alchemical' trait
			if (!item || !item.system.traits.value.includes("alchemical")) {
			  debugLog("Item does not have the 'alchemical' trait or item is undefined.");
			  return;
			}
			
			// Ensure Quick Alchemy was used to create item - it will have the "infused" trait
			if (!item || !item.system.traits.value.includes("infused")) {
			  debugLog("Item does not have the 'infused' trait or item is undefined.");
			  return;
			}

			// Log infused item was created
			debugLog(`Infused item created!: ${item}`);

			// Get the actor's class DC
			const classDC = sa.system.attributes.classDC?.value;
			console.log("Actor's Class DC:", classDC);
			if (!classDC) {
			  debugLog("Warning: Class DC not found for the actor.","c", 2);
			  return;
			}

			// Get current description of item
			let description = item.system.description.value;
			
			// Check for strings to replace in item description
			const replacements = [
				{ pattern: /@Check\[\w+\|dc:(\d+)\]/g, replaceFn: (match, p1) => match.replace(`dc:${p1}`, `dc:${classDC}`) }, // If using @check in description
				{ pattern: /DC is (\d+)/g, replaceFn: (match, p1) => match.replace(`DC is ${p1}`, `DC is ${classDC}`) } // Example "DC is 17"
			];
			
			// Make replacements
			let updatedDescription = description;
			for (const { pattern, replaceFn } of replacements) {
				updatedDescription = updateDescription(updatedDescription, pattern, replaceFn);
			}

			// Update the item with the new description
			await item.update({"system.description.value": updatedDescription});
			debugLog("Item description updated successfully.");

		});
	}
});
