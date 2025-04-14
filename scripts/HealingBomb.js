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