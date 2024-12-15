# PF2e Alchemist Remaster Duct Tape

A module to slap together some functionality until the PF2e system is updated to support the Alchmist remaster.

## Known issues

- The first time you use the Quick Alchemy macro (`qaCraftAttack();`) it will take a minute to load the screen.

## Features

**Quick Alchemy:** (This function is to manage crafting using Versatile Vials rather than reagents. This tool will consume 1 Versatile Vile, and craft an item from your formulas. A dialog box will appear with two drop downs. The first will list formulas for items of type weapon (bombs), and will have a "Craft and Attack" button which will craft the item then open the dialog box for the attack actions (must have target first), and a Craft button that will just craft the item. The second dropdown will list consumable items that you have the formula for and have a "Craft" button. All items created with this will have the "Infused" trait. 
A macro will be included in the compendium. 

![Quick Alchemy example](https://github-production-user-asset-6210df.s3.amazonaws.com/7744795/395860170-a2bbca8f-5126-4e80-b67f-d11c5c4de416.webm)

(update) I added the option to just craft an item, in that case it will add to inventory, consume a versatile vial (unless crafting a versitile vial), and then add a chat card with a link to use that item. 

**Powerful Alchemy:** Will detect when an infused item is created, and if the actor has Powerful Alchemy feat, will update the descrtiption to reflect the Actor's Class DC in either the description text or inline check. 

**Search Formulas:** Added search bar for known formulas.

![search](https://github.com/user-attachments/assets/7323ddf2-a013-4f41-b9e8-93abfb63f92e)

**Add higher level version of known versions:** Will add a higher level version of known formulas. For example if character has the formula for "Alchemist's Fire (Lesser)", when they reach level 3 it will add "Alchemist's Fire (Moderate)". Can set to prompt first (default), or automatically add, or disable in settings. 

**Find vials:** The module tracks every 10 minutes of exploration mode (outside of combat) automatically. When 10 minutes have passed, a message is sent in chat to the GM and any players with Alchemist characters, prompting them to add vials. 

![add-vials-prompt](https://github.com/user-attachments/assets/bda0c639-0281-4949-aeea-5546abccb100)

![add-vials-prompt-added](https://github.com/user-attachments/assets/f77364cd-8c2a-4a41-ba6d-8cca8416007a)


## Requests

This is still sort of a work in progress, and by no means a full release. I have made changes that affect my players the most at the moment. I expect when the Alchemist Player Core 2 changes are implemented in the PF2e system this module will be obsolete. 

In the meantime if you have a request for a work around fix for an Alchemist feature, please submit one in the [Issues Page](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues). 
