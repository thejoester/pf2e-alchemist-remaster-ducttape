console.log("%cPF2e Alchemist Remaster Duct Tape | HealingBomb.js loaded","color: aqua; font-weight: bold;");
import { debugLog, getSetting, hasFeat, isAlchemist  } from './settings.js';
import { LOCALIZED_TEXT } from "./localization.js";
/* 
	Hook for modifying the buttons on the healing bombs
*/
Hooks.on("renderActorSheet", (app, html, data) => {
	const actor = app.actor;
	if (!actor) {
		debugLog(3, `${LOCALIZED_TEXT.DEBUG_ACTOR_NOTFOUND}: `, app);
		return;
	}
	var $html = $(html);
	$html.find("ol.actions-list.item-list.directory-list.strikes-list>li").each((index, element) => {
		if ($(element).find("section>h4.name>a").text().includes("Healing Bomb")) {
			$(element).find("button[data-action=strike-damage]").remove();
			$(element).find("button[data-action=strike-critical]").remove();

			var isChirgeion = hasFeat(actor, "greater-field-discovery-chirurgeon") && $(element).find('span[data-tooltip="PF2E.TraitDescriptionInfused"]').length > 0;

			var sucessButton = $(`<button type="button" class="tag damage" data-action="strike-damage" data-tooltip="1 * (8d6 + 30) + 8">${isChirgeion ? "Chirgeon" : "Success"}</button>`)
				.insertBefore($(element).find("div.button-group>.toggles"));
			var failureButton = $(`<button type="button" class="tag damage" data-action="strike-critical" data-tooltip="2 * (8d6 + 30) + 8">Failure</button>`)
				.insertAfter($(sucessButton));

			$html.find("section.inventory-list.directory-list.inventory-pane>ul>li>div.data>div.item-name>h4.name>a").each(async (index, nameElement) => {
				if($(nameElement).text() === $(element).find("section>h4.name>a").text()) {
					var item = await fromUuid($(nameElement).parentsUntil("ul").last().data("uuid"));
					//greater field-discovery-chirurgeon success
					if (isChirgeion) {
						createChirugeonSuccessChatLog(sucessButton, item, actor);
					}
					//regular success
					else {
						createSucessChatLog(sucessButton, item, actor);
					}
					//failure
					createFailureChatLog(failureButton, item, actor);
					return;
				}
			});
			return;
		}
	});
});

/*
	renderChatMessage Hook for Healing Bomb
*/
Hooks.on('renderChatMessage', (message, html) => {
	const origin = message.flags.pf2e?.origin?.uuid.split(".");
	if (message.flags.pf2e?.context?.type == "healing-bomb-heal-roll") {
		var $html = $(html);
		$html.find("[data-roll-index=0]>button").on("click", async (event) => {
			//apply healing to the token that is selected
			let actor;
			const token = canvas.tokens.controlled[0];
			if (token) {
				actor = token.actor;
			} else {
				// No token selected, fallback to the user's selected character
				actor = game.user.character;
			}
			if (!actor) {
				// Neither a token nor a selected character exists
				ui.notifications.error(LOCALIZED_TEXT.NOTIF_SELECT_TOKEN_FIRST);
				return;
			}
			console.log(message, actor, token);
			const heal = -(message.flags.pf2e?.context?.targetHeal);
			await actor.applyDamage({ damage: heal, token: token, skipIWR: true });
		});

		$html.find("[data-roll-index=1]>button").on("click", async (event) => {
			//apply healing to the token that is selected
			let actor;
			const token = canvas.tokens.controlled[0];
			if (token) {
				actor = token.actor;
			} else {
				// No token selected, fallback to the user's selected character
				actor = game.user.character;
			}
			if (!actor) {
				// Neither a token nor a selected character exists
				ui.notifications.error(LOCALIZED_TEXT.NOTIF_SELECT_TOKEN_FIRST);
				return;
			}
			console.log(message, actor, token);
			const heal = -(message.flags.pf2e?.context?.targetSplash);
			await actor.applyDamage({ damage: heal, token: token, skipIWR: true });
		});
	}

	if (message.isRoll && message.isCheckRoll && message.flags.pf2e?.context?.domains?.includes("healing-bomb-attack")) {
		const actor = game.actors.get(origin[1]);
		const item = actor?.items.get(origin[3]);
		if (!actor || !item) {
			debugLog(LOCALIZED_TEXT.DEBUG_ACTOR_NOTFOUND);
			return;
		}
		var $html = $(html);
		$html.find("header>span.flavor-text>h4.action>strong").text("Ranged Strike: Healing Bomb");
		$html.find("header>span.flavor-text>div.traits").html(`<span class="tag" data-slug="healing" data-tooltip="PF2E.TraitDescriptionHealing">Healing</span>
				<span class="tag" data-slug="manipulate" data-tooltip="PF2E.TraitDescriptionManipulate">Manipulate</span>
				<span class="tag tag_alt" data-slug="alchemical" data-tooltip="PF2E.TraitDescriptionAlchemical">Alchemical</span>
				<span class="tag tag_alt" data-slug="consumable" data-tooltip="PF2E.TraitDescriptionConsumable">Consumable</span>
				<span class="tag tag_alt" data-slug="splash" data-tooltip="PF2E.TraitDescriptionSplash">Splash</span
				><span class="tag tag_secondary" data-slug="range-increment-30" data-tooltip="PF2E.Item.Weapon.RangeIncrementN.Hint">Range Increment 30 ft.</span>`);

		$html.find("div.message-content").addClass("pf2e chat-card");

		var healingButtons = `<section class="card-buttons">`;
		//only show if not a crit failure
		if (!message.target || message.rolls[0]?.degreeOfSuccess > 0) {
			if (message.rolls[0]?.degreeOfSuccess >= 2) {
				if (hasFeat(actor, "greater-field-discovery-chirurgeon") && item.system.traits.value.includes("infused")) {
					healingButtons += `<button type="button" class="success" data-action="healing-bomb-damage" data-outcome="chirurgeon-success">Greater Field Discovery Healing</button>`
				}
				else {
					healingButtons += `<button type="button" class="success" data-action="healing-bomb-damage" data-outcome="success">Success</button>`;
				}
			} else {
				healingButtons += `<button type="button" class="failure" data-action="healing-bomb-damage" data-outcome="failure">Failure</button>`;
			}
		}

		healingButtons += `</section>`;
		if (message.isReroll) {
			$html.find("div.message-content>div.reroll-second>div.message-buttons").html(healingButtons);
		}
		else {
			$html.find("div.message-content>div.message-buttons").html(healingButtons);
		}

		createSucessChatLog($html.find(".success[data-outcome=success]"), item, actor);
		
		createFailureChatLog($html.find(".failure[data-outcome=failure]"), item, actor);

		createChirugeonSuccessChatLog($html.find(".success[data-outcome=chirurgeon-success]"), item, actor);

		html = $html[0];
		console.log(item);
	}
});



export function createSucessChatLog(button, item, actor) {
  const fullHealth = `${item.system.damage.dice}${item.system.damage.die} + ${item.system.damage.modifier}`;
  const splashDamage = `${item.system.splashDamage.value}`;

  $(button).on("click", async (event) => {
    const healRoll = new Roll(fullHealth);

    await healRoll.evaluate();

    console.log(healRoll);

    const healResult = healRoll.total;

    var diceRolls = "";
    for (const roll of healRoll.terms[0].results) {
      diceRolls += `
				<li class="roll die d${healRoll.terms[0].faces} ${healRoll.terms[0].faces === roll.result ? "max" : ""}
				${roll.result == 1 ? "min" : ""}">
					${roll.result}
				</li>`;
    }

    ChatMessage.create({
      content: `
				<section class="dice-roll damage-roll" data-tooltip-class="pf2e">
					<div class="dice-result">
							<div class="dice-formula">
									<span class="untyped damage instance color" data-tooltip="Untyped">${healRoll.formula}</span>
							</div>
							<div class="dice-tooltip" style="display: none;">
									<section class="tooltip-part damage instance color untyped">
											<header>
													Untyped <i class="fa-solid fa-"></i>
											</header>
											<div class="dice">
													<header class="part-header flexrow">
															<span class="part-formula">${healRoll.terms[0].expression}</span>
															<span class="part-total">${healResult}</span>
													</header>
													<ol class="dice-rolls">
														${diceRolls}
													</ol>
											</div>
									</section>
							</div>
			
							<h4 class="dice-total">
									<span class="total">${healResult}</span>
							</h4>
					</div>
			</section>
			
			<section class="damage-application" data-roll-index="0">
					<button type="button" class="healing-only" data-action="apply-healing" title="[Click] Apply full healing to selected tokens.">
							<span class="fa-stack fa-fw">
									<i class="fa-solid fa-heart fa-stack-2x"></i>
									<i class="fa-solid fa-plus fa-inverse fa-stack-1x"></i>
							</span>
							<span class="label">Apply Healing</span>
					</button>
			</section>
			
			
			<section class="dice-roll damage-roll" data-tooltip-class="pf2e">
			<div class="dice-result">	
					<h4 class="dice-total">
							<span class="total">${splashDamage}</span>
					</h4>
			</div>
	</section>
	
	<section class="damage-application" data-roll-index="1">
			<button type="button" class="healing-only" data-action="apply-healing" title="[Click] Apply full healing to selected tokens.">
					<span class="fa-stack fa-fw">
							<i class="fa-solid fa-heart fa-stack-2x"></i>
							<i class="fa-solid fa-plus fa-inverse fa-stack-1x"></i>
					</span>
					<span class="label">Apply Splash Healing</span>
			</button>
	</section>`,
      speaker: ChatMessage.getSpeaker(),
      flags: {
        core: { "canPopout": true },
        "pf2e": {
          "context": {
            "origin": {
              "itemId": item.id,
              "actorId": actor.id
            },
            "type": "healing-bomb-heal-roll",
            "targetHeal": healResult,
            "targetSplash": splashDamage,
            "rollMode": "damage",
          }
        }
      }
    });
  });
}

export function createFailureChatLog(button, item, actor) {
  const splashDamage = `${item.system.splashDamage.value}`;
  $(button).on("click", async (event) => {
    ChatMessage.create({
      content: `
    <section class="dice-roll damage-roll" data-tooltip-class="pf2e">
      <div class="dice-result">	
        <h4 class="dice-total">
          <span class="total">${splashDamage}</span>
        </h4>
      </div>
    </section>

    <section class="damage-application" data-roll-index="1">
      <button type="button" class="healing-only" data-action="apply-healing" title="[Click] Apply full healing to selected tokens.">
        <span class="fa-stack fa-fw">
          <i class="fa-solid fa-heart fa-stack-2x"></i>
          <i class="fa-solid fa-plus fa-inverse fa-stack-1x"></i>
        </span>
        <span class="label">Apply Healing</span>
      </button>
    </section>`,
      speaker: ChatMessage.getSpeaker(),
      flags: {
        core: { "canPopout": true },
        "pf2e": {
          "context": {
            "origin": {
              "itemId": item.id,
              "actorId": actor.id
            },
            "type": "healing-bomb-heal-roll",
            "targetHeal": 0,
            "targetSplash": splashDamage,
            "rollMode": "damage",
          }
        }
      }
    });
  });
}

export function createChirugeonSuccessChatLog(button, item, actor) {


  $(button).on("click", async (event) => {
    var dieSize = item.system.damage.die.split("d")[1];
    const healing = (item.system.damage.dice * dieSize) + item.system.damage.modifier;
    const splashDamage = `${item.system.splashDamage.value}`;

    ChatMessage.create({
      content: `
      <section class="dice-roll damage-roll" data-tooltip-class="pf2e">
        <div class="dice-result">
            <h4 class="dice-total">
                <span class="total">${healing}</span>
            </h4>
        </div>
    </section>
    
    <section class="damage-application" data-roll-index="0">
        <button type="button" class="healing-only" data-action="apply-healing" title="[Click] Apply full healing to selected tokens.">
            <span class="fa-stack fa-fw">
                <i class="fa-solid fa-heart fa-stack-2x"></i>
                <i class="fa-solid fa-plus fa-inverse fa-stack-1x"></i>
            </span>
            <span class="label">Apply Healing</span>
        </button>
    </section>
    
    
    <section class="dice-roll damage-roll" data-tooltip-class="pf2e">
    <div class="dice-result">	
        <h4 class="dice-total">
            <span class="total">${splashDamage}</span>
        </h4>
    </div>
</section>

<section class="damage-application" data-roll-index="1">
    <button type="button" class="healing-only" data-action="apply-healing" title="[Click] Apply full healing to selected tokens.">
        <span class="fa-stack fa-fw">
            <i class="fa-solid fa-heart fa-stack-2x"></i>
            <i class="fa-solid fa-plus fa-inverse fa-stack-1x"></i>
        </span>
        <span class="label">Apply Splash Healing</span>
    </button>
</section>`,
      speaker: ChatMessage.getSpeaker(),
      flags: {
        core: { "canPopout": true },
        "pf2e": {
          "context": {
            "origin": {
              "itemId": item.id,
              "actorId": actor.id
            },
            "type": "healing-bomb-heal-roll",
            "targetHeal": healing,
            "targetSplash": splashDamage,
            "rollMode": "damage",
          }
        }
      }
    });
  });
}