## 2.5.7
### Bug Fixes
- Level Up: (issue #15) Resolved issues with adding or removing versions of known formulas in languages that use commas instead of parentheses to indicate formula quality (e.g., lesser, greater).

## 2.5.6
## Bug Fixes
- Quick Alchemy: Reversed changes to how Quick Vials consume versatile vials. Now they do not. 

## 2.5.5
### New Features
- Quick Alchemy: added support for "Bomber", and "Advanced Vials (Bomber)" feats (Player Core 2 pg. 61).
  - "Bomber" feat allows the damage type to be changed when Quick Vial created. 
  - "Advanced Vials (Bomber)" feat allows to add special ingredients (chosen from adamantine, cold iron, and dawnsilver) to the Quick Vial adding that material trait to the vial. 
- Quick Alchemy: added support for "Chirurgeon" feat (Player Core 2 pg. 61). 
  - When crafting a quick vial will prompt to craft a "Healing Quick Vial", this will create an Elixir with the Healing and Coagulant traits that can be consumed or thrown at a creature.
### Bug Fixes
- Quick Alchemy: Reworked quick alchemy to follow RAW, that you can only craft a Quick Vial (consuming a versatile vial) to use as a bomb or for the versatile vial option from your research field (Player Core 2 pg. 59). Now Quick Alchemy will only have option to craft "Quick Vial".
### Still Needs work
- Quick Alchemy: Toxicologist support (Player Core 2 pg. 62).

## 2.5.4
### Bug Fixes
- Quick Alchemy: when creating a versatile vial it will make the appropriate level vial. 
- Powerful Alchemy: Fixed bug preventing item DC from being adjusted.
- Debugging: Fixed setting "None", to not show any debugging messages in console.

## 2.5.3
### Bug Fixes
- Vial Search: When "finding" versatile vials, will now add proper item level vials. 
- Fixed bug preventing macro execution on different languages (issue #14).
- Settings: Corrected descriptions

## 2.5.2
### New features / improvements
- Support for Archetype characters!
  - Does not apply to Vial Search.
  - Cannot craft versatile vials but can craft quick vials
- Level Up: New options on leveling up
  - Choose how to handle lower level formulas, add lower, remove lower, disabled
  - if remove lower level formulas is selected, will prompt based on setting for adding higher level formulas (ask for all, ask for each, auto)
### Bug Fixes
- Fixed annoying notification on non alchemist characters (issue #13)

## 2.5.1
### Bug Fix
- (issue #10) Powerful Alchemy: fixed bug preventing update of DC in description. 

## 2.5.0
### New features / improvements
- Quick Alchemy Macro: Improved flow for more intuitive use. 
- Quick Alchemy Macro: Items crafted with Double Brew feat will display message in chat with button to use it. 
- Quick Alchemy Macro: Items created with Quick Alchemy macro will now be labeled with "(Temporary)" and modified slug with added "-temp" to separate them from more permanent items. 
- Quick Alchemy Macro: Items created with Quick Alchemy macro will now be removed at end of combat turn. 
- Quick Alchemy Macro: Will only function if selected token is an Alchemist.
- Level Up: If no Actor Owner is logged in when character levels up, will prompt GM to add upgraded formulas. 
- Debugging: improved debugging. 

## 2.4.3
### Bug fixes
- Vial Search: Limiting to party characters to improve performance
- Vial Search: Will now calculate multiple increments of 10 minutes and add appropriate number of vials. 

## 2.4.2
### New Features
- Quick Alchemy: Added support for Double Brew feat.
  - Will be prompted if you want to use feat, then for second item to create before main Quick Alchemy window is shown. 
- Settings: New option for adding new formulas on level up, "Ask for all" will ask once for all formulas being added. 
- Vial Search: Will disable "add vial" button for user when clicked. (known issue: will not disable for GM or if actor is owned by multiple users all users will be able to click once.)
### Bug Fixes
- Corrected spelling errors in settings
- Vial Search: Fixed bug so Alchemists with Alchemical Expertise feat to not increase max vial only found vials. 
- Vial Search: Fixed issue where non-english foundry versions cannot find vials. 
  - Removed setting as it is no longer needed

## 2.4.1
### Features
- Vial Search: Added option to output new formulas to chat
- Vial Search: Added "Alchemical Expertise" feat support
### Bug Fixes
- Vial Search: Added ablity to change name of versatile vial for non english users in settings

## 2.4.0
### Features
- Monitors game time, after 10 minutes of exploration (non combat) will prompt alchemist characters to add vials if needed. 

## 2.3.1
### Bug Fixes
- When leveling up and skipping levels (example level 1 to level 5) it will search for formulas for all levels that you know to add higher level version if enabled in settings. 

## 2.3.0
### Features
- Auto add higher level versions of known formulas when leveling up. 
### Bug Fixes
- improved debug logging

# 2.2.1
### New Features
- Quick Alchemy macro will now show "loading" window with progress.
- Setting option to show counts of formulas on Quick Alchemy screen. 

### Bug fixes
- (Bug #5) Error catching on possible corruption or errors in actor's formulas. 

# 2.2.0
- Added formula search feature.
- added support for Bug Reporter (https://github.com/League-of-Foundry-Developers/bug-reporter)

# 2.1.2
- fix QuickAlchemy.js errant line of code preventing file to load. Thanks to tpendragon!

# 2.1.1
- fixed debug setting that would prevent important notifications being displayed.

# 2.1.0
- Added settings options.
  - Added settings option to enable/disable Powerful Alchemy (default: enabled).
  - Added settings option to enable size based quick alchemy. Three settings, Disabled = will not adjust item size based on actor size, Tiny Only = only adjust item size for tiny actors, All Sizes = will adjust item size for all size actors. 
- If no Versatile Vials are in inventory and the Quick Alchemy macro is run, it will prompt to create one. 

# 2.0.2
- Updated to support pf2e v6.7.0.

# 2.0.1
### New Features
- Option to only craft weapon items.
- When only crafting, will send message to chat with link use / attack.

### Bug Fixes
- Creating a Versatile Vile will not consume a Versatile Vial. 
- Added more error handling so that Versatile Vials are less likely to be consumed if error happens at wrong moment. 
- Fixed bug where multiple of the items could be crafted in separate stacks. Now will increase quantity.
