Hooks.on("ready", () => {
  console.log("%cPF2e Powerful Alchemy module loaded","color: aqua; font-weight: bold;");

  Hooks.on("createItem", async (item) => {
	console.log("%cpf2e-powerful-alchemy: Item Created!","color: aqua; font-weight: bold;");
    
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
		console.log("%cpf2e-powerful-alchemy: Description was updated to Class DC!","color: cyan; font-weight: bold;");
		
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
	  console.warn("%cWarning: Actor not found.","color: red; font-weight: bold;");
	  return;
	}
	
	// First check if the actor has Powerful Alchemy - if not return with message in log	
	if (!hasFeat(sa, "powerful-alchemy")) {
		console.log("pf2e-powerful-alchemy: Actor does not have Powerful alchemy, ignoring!");
		return;	
	}
	
	// Ensure the item has the 'alchemical' trait
	if (!item || !item.system.traits.value.includes("alchemical")) {
	  console.log("%cpf2e-powerful-alchemy: Item does not have the 'alchemical' trait or item is undefined.","color: red; font-weight: bold;");
	  return;
	}
	
	// Ensure Quick Alchemy was used to create item - it will have the "infused" trait
	if (!item || !item.system.traits.value.includes("infused")) {
	  console.log("%cpf2e-powerful-alchemy: Item does not have the 'infused' trait or item is undefined.","color: red; font-weight: bold;");
	  return;
	}

	// Log infused item was created
	console.log("%cpf2e-powerful-alchemy: Infused item created!:","color: cyan; font-weight: bold;", item);

	// Get the actor's class DC
	const classDC = sa.system.attributes.classDC?.value;
	console.log("Actor's Class DC:", classDC);
	if (!classDC) {
	  console.warn("%cWarning: Class DC not found for the actor.","color: red; font-weight: bold;");
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
	console.log("%cpf2e-powerful-alchemy: Item description updated successfully.", "color: aqua ; font-weight: bold;");

  });
});
