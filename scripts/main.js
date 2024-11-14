Hooks.on("ready", () => {
  console.log("%cPF2e Alchemist Remaster Duct Tape (main.js) loaded", "color: aqua; font-weight: bold;");

  // Helper function to check if an actor has a specific feat by slug
  function hasFeat(actor, slug) {
    return actor.itemTypes.feat.some((feat) => feat.slug === slug);
  }
	
  // Function to equip an item by slug
  async function equipItemBySlug(slug) {
    const actor = canvas.tokens.controlled[0]?.actor;
    if (!actor) {
      ui.notifications.error("No actor selected.");
      return;
    }

    const item = actor.items.find((i) => i.slug === slug);
    if (!item) {
      ui.notifications.error("Item not found.");
      return;
    }

    await item.update({
      "system.equipped.carryType": "held",
      "system.equipped.handsHeld": "1",
    });

    ui.notifications.info(`${item.name} is now equipped.`);
    return item._id;
  }

  // Function to clear infused items
  async function clearInfused(actor) {
    let itemsToDelete = [];
    for (let item of actor.items) {
      if (item.system.traits?.value?.includes("infused") && item.system.quantity === 0) {
        itemsToDelete.push(item);
      }
    }

    if (itemsToDelete.length > 0) {
      for (let item of itemsToDelete) {
        await item.delete();
      }
      console.log(`Deleted ${itemsToDelete.length} infused items with 0 quantity.`);
    } else {
      console.log("No infused items with quantity 0 found.");
    }
  }

  // Show loading screen
  function showLoadingScreen() {
    const overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.style = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background-color: rgba(0, 0, 0, 0.5); display: flex;
      justify-content: center; align-items: center;
      color: white; font-size: 24px;
    `;
    overlay.innerHTML = "Loading... Please wait";
    document.body.appendChild(overlay);
  }

  // Hide loading screen
  function hideLoadingScreen() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) document.body.removeChild(overlay);
  }

  // Main crafting function
  async function qaCraftAttack() {
    const token = canvas.tokens.controlled[0];
    if (!token) {
      ui.notifications.error("Please select a token first.");
      return;
    }

    const actor = token.actor;
    const formulas = actor?.system.crafting?.formulas || [];
    const versatileVials = actor.items.filter((item) => item.slug === "versatile-vial");
    const vialCount = versatileVials.reduce((count, vial) => count + vial.quantity, 0);

    if (vialCount < 1) {
      new Dialog({
        title: "No Versatile Vials",
        content: "<p>You do not have any Versatile Vials available for crafting.</p>",
        buttons: { ok: { label: "OK", callback: () => {} } },
        default: "ok",
      }).render(true);
      return;
    }

    await clearInfused(actor);

    const weaponOptions = [];
    const consumableOptions = [];

    for (let formula of formulas) {
      const entry = await fromUuid(formula.uuid);
      if (entry) {
        if (entry.type === "weapon") {
          weaponOptions.push(`<option value="${entry.uuid}">${entry.name}</option>`);
        } else if (entry.type === "consumable") {
          consumableOptions.push(`<option value="${entry.uuid}">${entry.name}</option>`);
        }
      }
    }

    const content = `
      <form>
        <p>Versatile Vials: ${vialCount}</p>
        <div>
          <label for="weapon-formula">Select a Weapon Formula</label>
          <select id="weapon-formula">${weaponOptions.join("")}</select>
          <button id="craft-weapon-btn" type="button" style="margin-top: 10px;">Craft and Attack</button>
        </div>
        <br/><br/>
        <div>
          <label for="consumable-formula">Select a Consumable Formula</label>
          <select id="consumable-formula">${consumableOptions.join("")}</select>
          <button id="craft-consumable-btn" type="button" style="margin-top: 10px;">Craft</button>
        </div>
      </form>
    `;

	let qaDialog = new Dialog({
      title: "Quick Alchemy",
      content: content,
      buttons: {},
      render: (html) => {
        html.find("#craft-weapon-btn").click(async () => {
          const selectedUuid = html.find("#weapon-formula").val();
          const selectedItem = await fromUuid(selectedUuid);
          const target = canvas.tokens.controlled[0]?.target;

          if (!target) {
            ui.notifications.error("Please target a token for the attack.");
            return;
          }

          if (selectedItem) {
            const modifiedItem = foundry.utils.duplicate(selectedItem);
            modifiedItem.system.equipped.carryType = "held";
            modifiedItem.system.equipped.handsHeld = "1";
            if (!modifiedItem.system.traits.value.includes("infused")) {
              modifiedItem.system.traits.value.push("infused");
            }

            await actor.createEmbeddedDocuments("Item", [modifiedItem]);
            const newUuid = await equipItemBySlug(selectedItem.slug);

            if (!newUuid) {
              ui.notifications.error("Failed to equip item.");
              return;
            }

            const actorUuid = actor.uuid;
            game.pf2e.rollActionMacro({
              actorUUID: actorUuid,
              type: "strike",
              itemId: newUuid,
              slug: selectedItem.slug,
            });
			
			const vialToRemove = versatileVials[0];
			await vialToRemove.update({ "system.quantity": vialToRemove.system.quantity - 1 });
			
			// Close the dialog window
			qaDialog.close();	
			
          } else {
            ui.notifications.error("Selected item is invalid.");
          }
        });

        html.find("#craft-consumable-btn").click(async () => {
          const selectedUuid = html.find("#consumable-formula").val();
          const selectedItem = await fromUuid(selectedUuid);

          if (selectedItem) {
			const modifiedItem = foundry.utils.duplicate(selectedItem);
            if (!modifiedItem.system.traits.value.includes("infused")) {
              modifiedItem.system.traits.value.push("infused");
            }
			  
            await actor.createEmbeddedDocuments("Item", [modifiedItem]);
            const vialToRemove = versatileVials[0];
            await vialToRemove.update({ "system.quantity": vialToRemove.system.quantity - 1 });
            
			// Close the dialog window
			// Close the dialog window
			qaDialog.close();	
			
          } else {
            ui.notifications.error("Selected item is invalid.");
          }
        });
      },
    }).render(true);
  }

  // Attach function to the global window object
  window.qaCraftAttack = qaCraftAttack;
});
