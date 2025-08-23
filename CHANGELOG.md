# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.13.4] - 2025-08-23
### Fixed
- **Module:** accident caused bad versions of multiple files to be packaged. Rolled back to 2.13.0 and then updated to include all subsequent features. 
### Changed
- **Journal:** Updated Journal in compendium with more information on the module and features. 

## [2.13.3] - 2025-08-22
### Fixed
- **Quick Alchemy:** Fixed mistake on last update that reverted Quick Alchemy macro. 

## [2.13.2] - 2025-08-22
### Fixed
- **Vial Search:** Fixed error that prevented Vial Search from working properly for Archetypes or dedication based alchemists. 

## [2.13.1] - 2025-08-22
### Fixed
- **Quick Alchemy:** Fixed but preventing player from creating Healing Quick Vial.

## [2.13.0] - 2025-08-17
### Added
- **Quick Alchemy:** Added item description on Quick Alchemy macro when selecting item to craft vor v13.
  - Can disable in settings. 
- **Module:** Module is no longer supporting Foundry v12. 
### Changed
- **Module:** Made several changes to improve performance. 
- **Level Up:** For performance, when leveling up it will only prompt for/add highter level formulas for Alchemical items. If you want to manually run a full check on all items the "Update Formulas" macro in the module compendium will do so, but is slower. 
- **Module:** Updated module Journal to have more details on features, settings, etc. 

## [2.12.3] - 2025-08-15
### Fixed
- Okay I was wrong, barring any major bugs from now on however, this should be the last v12 update
- **Quick Alchemy:** Fixed bug preventing Double Brew option from showing. ([Issue 56](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/56))
### Changed
- **Localization:** Updated Polish translations. Credit: [Lioheart](https://github.com/Lioheart)
- **Localization:** Updated Chinese translations. Credit: [AlphaStarguide](https://github.com/AlphaStarguide)
- **Localization:** Updated British Portuguese translation with google translate, if changes needed please submit PR or issue. Original Credit: [Charlinho](https://github.com/Chrystian-Carvalho)

## [2.12.2] - 2025-08-14
### Added 
- **Quick Alchemy:** Added item description on Quick Alchemy when selecting item to craft.
  - This is a v12 feature only for this release. 
  - This release will be the final v12 release, and the next release will contain this feature for v13
### Fixed
- - **Quick Alchemy:** Fixed issue where non alchemical items could be selected and crafted with the Quick Alchemy macro. ([Issue 52](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/52))

## [2.12.1] - 2025-08-11
### Fixed 
- Fixing missing script inclusion in module.json

## [2.12.0] - 2025-08-11
### Added 
- **Quick Alchemy:** When applying an effect from an item created with Quick Alchemy, will limit duration of effect to 10 minutes per raw (https://2e.aonprd.com/Actions.aspx?ID=2801) 
  - Added note to description to apply before use. 
  - Will only work if effect is applied before clicking on "Use". 

## [2.11.1] - 2025-07-15
### Added
- **Localization:** Added Chinese (cn) localization. Thanks [AlphaStarguide](https://github.com/AlphaStarguide)!

## [2.11.0] - 2025-06-21
### Added
- **Quick Alchemy:** Added support for [Munition Machinist Feat](https://2e.aonprd.com/Feats.aspx?ID=3172).
- **Quick Alchemy:** Added support for [Firework Technician Dedication](https://2e.aonprd.com/Archetypes.aspx?ID=119). 
  - Note: Currently no way to limit crafting to 'firework' items, so will show all formulas. 

## [2.10.0] - 2025-06-19
### Added
- **Quick Alchemy:** Added support for [Wandering Chef Dedication](https://2e.aonprd.com/Feats.aspx?ID=7053).
  - When running Quick Alchemy macro will just open dialog to select food to create from formulas. 

## [2.9.10] - 2025-06-12
### Fixed
- **Quick Alchemy:** Fixed bug when sending message to chat, it would link an existing item not the temporary item just created. 

## [2.9.9] - 2025-06-10
### Fixed
- **Healing Bomb:** Fixed bug in code preventing healing bomb item to be created correctly. 
- **Healing Bomb:** Fixed logic in Healing Bombs to match RAW (https://2e.aonprd.com/Feats.aspx?ID=5773):
  - Splash Healing applies on success or better (was only on Crit Success).
  - Spash Healing only applies to adjacent creatures, not also to target.
- **LevelUp:** Fixed bug when prompting to add/remove formulas upon leveling up where closing the prompt window not resolve the dialog causing that code to hang, and that character to possibly not be prompted in the future. 
- **Quick Alchemy:** Updated Style to prevent wrapping of button text.

## [2.9.8] - 2025-06-09
### Changed 
- **Quick Alchemy:** Improved Quick Alchemy macro to be more efficient when pulling list of formulas, now should load instantly! 

## [2.9.7] - 2025-06-06
### Fixed
- **Settings:** Fixed jQuery check in settings that was causing error in console in v13, and not disabling "collapse item description in chat" if this was being done by [xdy-pf2e-workbench module](https://github.com/xdy/xdy-pf2e-workbench).
- **Powerful Alchemy:** Fixed DC replacement for items such as Glue Bomb using newer '/act escape dc=28' format.

## [2.9.6] - 2025-05-29
### Fixed
- **Quick Alchemy:** Fixed issue not loading Journal compendium.

## [2.9.5] - 2025-05-29
### Changed
- **Localization:** Added Polish translation. Credit: [Lioheart](https://github.com/Lioheart)

## [2.9.4] - 2025-05-26
### Changed
- **Debilitating Bomb:** Removed "Debilitating Bomb" support, if you check the option in the actions tab on your character sheet it will add debilitating bomb text to attack. 
- **Powerful Alchemy:** Will only change items created using the module Quick Alchemy macro. 
- **Quick Alchemy:** Added "Read me" button to Quick Alchemy macro, can be disabled in settings. This opens read me Journal in Compendium.
### Fixed 
- **Quick Alchemy:** [Issue 47](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/47) - Fixed issue with creating healing quick vial or healing bomb with translation modules. 

## [2.9.3] - 2025-05-25
### Fixed
- **Level Up:** Updated level-up script and macros to check for higher versions of all formulas not just common when leveling up or running macro. 
- **Level Up:** Excluding Colorful Coating and Sprite Apple items from being removed if another version is known. 

## [2.9.2] - 2025-05-24
### Fixed
- **Level Up:** Fixed issue when removing lower level forumulas that caused all elemental ammunition to be removed. 

## [2.9.1] - 2025-05-01
### Added
- **Module:** Tested and verified for Foundry V13.341
- **Module:** Updated Macro icon! 
### Fixed
- **Quick Alchemy:** Fixed slug for Healing Bomb item to be unique. 

## [2.9.0] - 2025-04-13
### Added
- **Quick Alchemy:** Added support for [Healing Bomb (Feat 4)](https://2e.aonprd.com/Feats.aspx?ID=5773) ([Panda](https://github.com/Jordan-Ireland)).
  - Healing Bomb will create Elixir or use one from inventory. 
- **Quick Alchemy:** Added support for [Chirurgeon Greater Field Discovery](https://2e.aonprd.com/ResearchFields.aspx?ID=6).
### Changed
- Simplified localization files. 
- Updated macto Icon for Quick Alchemy. 

## [2.8.3] - 2025-04-07
### Fixed
- **Quick Alchemy:** Implemented fix to prevent occasional error "This action no longer exists!" when using Quick Alchemy to craft and attack. 

## [2.8.2] - 2025-04-07
### Fixed
- **Quick Alchemy:** [Issue #34](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/34) - Fixed bug with Double Brew, it now correctly makes the second item. 
- **Module:** [Issue #33](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/33) - Macro to remove lower level formulas properly named.

## [2.8.1] - 2025-04-01
### Fixed
- **Module:** New Macros are now included in the compendium. 

## [2.8.0] - 2025-03-31
### Added
- **Module:** Updated dialogs to DialogV2. 
- **Level Up:** Added macro to trigger adding higher level versions of known formulas manually (Look in the macro compendium).
- **Level Up:** Added macro to trigger removing lower level versions of known formulas manually (Look in the macro compendium). 
- **Level Up:** Added dialog with progress bar when leveling up to indicate that module is working on checking formulas. 
- **Module:** Updated localizations for Engligh (en), Polish (pl) credit: [Lioheart](https://github.com/Lioheart)), and Brazilian Portuguese(pt-BR).
  -  Brazilian Portuguese(pt-BR) additions were created with translation assistance and could use verification.

## [2.7.5] - 2025-03-26
### Fixed
- **Powerful Alchemy:** Fixed bug that prevented certain save text in description from being updated properly, such as [Energy Mutagen (Major)](https://2e.aonprd.com/Equipment.aspx?ID=1962).

## [2.7.4] - 2025-03-21
### Fixed
- **Quick Alchemy:** Fixed error in code preventing Powerful Alchemy from functioning properly.

## [2.7.3] - 2025-03-08
### Added
- **Quick Alchemy:** Added support for [Debilitating Bomb](https://2e.aonprd.com/Feats.aspx?ID=5778)
- **Localization:** Added Brazilian portuguese translation. Credit: [Charlinho](https://github.com/Chrystian-Carvalho)!
- **Localization:** Added Polish translation. Credit: [Lioheart](https://github.com/Lioheart)
### Fixed
- **Quick Alchemy:** fixed UI permissions error for other players when certain events happened for Alchemist character.

## [2.7.2] - 2025-02-25
### Fixed 
- **Localization:** Fixed issues in settings for localization. 
- **Localization:** Made some additions and corrections to localization. If you are working on any translations you can [view the latest changes to en.json here](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/commit/a84683c76fa9176430dfda7c92827a032c6b1183#diff-1d56632a2d162f99c901e53b79a6224e984c14501bca3188a85dbb4b4c5e6da1).

## [2.7.1] - 2025-02-25
### Fixed
- **Localization:** Fixed the localization so that it is specific to this module and will not conflict with other translations. 

## [2.7.0] - 2025-02-24
### Added
- Added localization to module. At this time only english is supported. If you would like to help contribute additional languages please visit my [github page](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape). 

## [2.6.11] - 2025-02-16
### Fixed
- **Quick Alchemy:** Fixed error in effect for resistance. 

## [2.6.10] - 2025-02-16
### Added
- **Quick Alchemy:** Added support for Mutagenist Advanced Vials feature. 
  - Field Benefit, Field Vials, Field Discovery, and Greater Field Discovery are all either handled by the system or not needing module support. 

## [2.6.9] - 2025-02-11
### Fixed
- **Quick Alchemy:** fixed splash damage calculation in Quick Vials. 

## [2.6.8] - 2025-02-07
### Fixed
- **Quick Alchemy:** quick vials were using rule elements from the base versatile vials, but was causing them to have +1 item bonus too high at all levels. 

## [2.6.7] - 2025-02-01
### Fixed
- **Powerful Alchemy:** Fixed issue where it was updating Flat DC when it shouldn't. 
- **Powerful Alchemy:** Fixed issue where certain items like Skunk Bomb pull description from the system item will display wrong DC when rolling damage. 

## [2.6.6] - 2025-02-01 
### Fixed 
- **Quick Alchemy:** Fixed bug causing several chat messages to be sent at beginning/end of Alchemist's turn about removing temporary items.  
### Added
- **Settings:** Added option to disable chat message when temporary items are removed at start/end of Alchemist turn.

## [2.6.5] - 2025-01-29
### Fixed
- **Level Up:** Fixed bug where when leveling up duplicate formulas could be added to actor crafting. 

## [2.6.4] - 2025-01-28
### Fixed
- **Quick Alchemy:** Fixed bug where Toxicologist was not getting proficency on poisoned vials.
- **Quick Alchemy:** Fixed splash damage for Toxicologist Quick Vial.

## [2.6.3] - 2025-01-22
### Fixed
- **Quick Alchemy:** Changed how items are created as to not conflict with other modules. 
  - Items created with macro will no longer have a unique temp slug, instead using a custom tag and publication information. 

## [2.6.2] - 2025-01-22
### Fixed
- /templates directory was not included in .zip package. 

## [2.6.0] - 2025-01-22
### Added
- **Quick Alchemy:** Added support for Toxicologist (Field Benefit, Field Vials, and Advanced Vials)!
  - Quick Vial damage type defaults to poison. It will check for best damage type of target (poison or acid) based on resistances, immunities, and weaknesses. 
  - When selecting "Quick Vial" it will prompt to craft Injury Poison, then apply and attack (3 actions).
    - This prompts to select weapon/ammo to apply to, creates a temp copy with modified damage and damage types and deletes it after attack. 
- **Level Up:** Added ability to add homebrew item compendiums in settings.
### Fixed
- **Formula Search:** Fixed Formula Search bar not showing on Crafting tab due to change in character sheet html in pf2e Release v6.8.2.
- **Quick Alchemy:** Reworked flow for creating Quick Vial. 

## [2.5.13] - 2025-01-17
### Fixed
- **Level Up:** ([Issue #15](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/15)) When adding and removing formulas on level up, module does so by slug not by name. This should resolve any issues for different languages. 
### Added
- **Vial Search:** Added setting to enable/disable chat message when alchemist has max vials already. Default to disabled. 
- **Level Up:** Added setting how to handle removing lower level formulas:
  - Auto: Will automatically remove them (if option is enabled) and not prompt. 
  - Ask for Each: Will prompt for each formula to be removed. This is default.
  - Ask for All: Will prompt once listing all formulas to be removed. 

## [2.5.12] - 2025-01-13
### Fixed
- **Quick Alchemy:** When character had no versatile vials in inventory, it would not allow to create Quick Vial. Now shows option. 
- **Quick Alchemy:** Corrected when temporary items created by Quick Alchemy are removed from character inventory. 
  - Quick Vials are removed at the end of the alchemist's turn.
  - Other infused items with "(\*Temporary)" in the name are deleted at the start of the Alchemist's turn.
- **Settings:** Removed reload requirement from most settings that do not need them. 

## [2.5.11] - 2025-01-10
### Fixed
- **Quick Alchemy:** Fixed issue preventing macro to operate (a goblin stole a semicolon!). 
- **Quick Alchemy:** When choosing "craft and attack" it will only put a message in the chat by default, can be changed in settings.
  - Will still display if crafting something using Double Brew feat. 
- **Settings:** Cleaned up settings file. 

## [2.5.10] - 2025-01-10
### Fixed
- [Issue #19](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/19) 
  - Healing Quick Vial (from Chirurgeon field research) no longer consumes versatile vial to create.
  - Added description text from Chirurgeon field research.

## [2.5.9] - 2025-01-10
### Fixed
- [Issue #17](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/17) Only messages from this module are collapesed when setting is enabled. 
- [Issue #18](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/18) Found and fixed bug where if alchemist character did not have versatile vial item in inventory but did have quick vial item and rested, it would update the quantity of the quick vial item to what should have been the versatile vial item quantity. 

## [2.5.8] - 2025-01-08
### Added
- **Quick Alchemy:** Messages for crafted items will hide the item description for shorter messages (Thanks for the suggestion [xdy](https://github.com/xdy)!).
  - Added eye icon to expand.
  - Can be disabled in settings.
- **Powerful Alchemy:** Simplified chat messages for modified item descriptions.

## [2.5.7] - 2025-01-01
### Fixed
- **Level Up:** (issue #15) Resolved issues with adding or removing versions of known formulas in languages that use commas instead of parentheses to indicate formula quality (e.g., lesser, greater).

## [2.5.6] - 2024-12-25
### Fixed
- **Quick Alchemy:** Reversed changes to how Quick Vials consume versatile vials. Now they do not.

## [2.5.5] - 2024-12-15
### Added
- **Quick Alchemy:** Added support for "Bomber" and "Advanced Vials (Bomber)" feats (Player Core 2 pg. 61).
  - "Bomber" allows changing damage type for Quick Vials.
  - "Advanced Vials (Bomber)" adds material traits (adamantine, cold iron, dawnsilver) to Quick Vials.
- **Quick Alchemy:** Added support for the "Chirurgeon" feat (Player Core 2 pg. 61).
  - Can craft a "Healing Quick Vial," which creates an Elixir with Healing and Coagulant traits.
### Fixed
- **Quick Alchemy:** Enforces RAW for crafting "Quick Vials" using versatile vials. Removes unsupported options.
### Known Issues
- **Quick Alchemy:** Toxicologist support (Player Core 2 pg. 62) still needs work.

## [2.5.4] - 2024-12-10
### Fixed
- **Quick Alchemy:** Corrected crafting of appropriate level versatile vials.
- **Powerful Alchemy:** Fixed issue with adjusting item DCs.
- **Debugging:** Disabled debug messages when set to "None".

## [2.5.3] - 2024-12-01
### Fixed
- **Vial Search:** Corrected addition of proper item level vials.
- **Settings:** Fixed descriptions.
- **Quick Alchemy:** Resolved macro execution issues in different languages (issue #14).

## [2.5.2] - 2024-11-25
### Added
- **Archetype Support:** Allows crafting quick vials but not versatile vials.
- **Level Up:** New formula management options:
  - Add or remove lower-level formulas.
  - Settings for auto-prompting formula upgrades.
### Fixed
- Annoying notifications for non-Alchemist characters (issue #13).

## [2.5.1] - 2024-11-20
### Fixed
- **Powerful Alchemy:** Corrected DC update bug in descriptions (issue #10).

## [2.5.0] - 2024-11-15
### Added
- **Quick Alchemy:** Improved macro flow and added features:
  - Temporary item labels and slugs.
  - Automatic removal of items at the end of combat.
  - Double Brew feat support.
- **Level Up:** Added GM prompts for formula upgrades when no actor owner is logged in.
- **Debugging:** Enhanced logging.

## [2.4.3] - 2024-11-01
### Fixed
- **Vial Search:** Performance improvements and proper handling of versatile vials.

## [2.4.2] - 2024-10-25
### Added
- **Quick Alchemy:** Added Double Brew feat support.
- **Settings:** Added "Ask for all" formula handling option.
### Fixed
- **Module:** Corrected spelling errors.
- **Vial Search:** Improved support for non-English Foundry versions.

## [2.4.1] - 2024-10-10
### Added
- **Vial Search:** Chat output for new formulas and Alchemical Expertise support.
### Fixed
- **Quick Alchemy:** Non-English support for versatile vial renaming.

## [2.4.0] - 2024-10-01
### Added
- **Vial Search:** Monitors game time and prompts Alchemists to add vials after 10 minutes of exploration.

## [2.3.1] - 2024-09-15
### Fixed
- **Level Up:** Properly handles skipped levels when adding higher-level formulas.

## [2.3.0] - 2024-09-01
### Added
- **Level Up:** Automatic addition of higher-level versions of known formulas during level-up.

## [2.2.1] - 2024-08-15
### Added
- **Quick Alchemy:** loading screen and formula counts in UI.
### Fixed
- **Quick Alchemy:** Error handling for corrupted actor formulas (issue #5).

## [2.2.0] - 2024-08-01
### Added
- **Quick Alchemy:** Formula search feature 
- **Module:** Bug Reporter integration.

## [2.1.2] - 2024-07-15
### Fixed
- **Quick Alchemy:** Removed errant line causing file loading issues.

## [2.1.1] - 2024-07-01
### Fixed
- **Quick Alchemy:** Debug settings preventing important notifications.

## [2.1.0] - 2024-06-15
### Added
- **Quick Alchemy:** Settings to enable/disable Powerful Alchemy and adjust item sizes for actors.
- **Quick Alchemy:** Prompt for creating versatile vials if none are available.

## [2.0.2] - 2024-06-01
### Added
- **Module:** Compatibility with PF2e system v6.7.0.

## [2.0.1] - 2024-05-15
### Added
- **Quick Alchemy:** Option to only craft weapon items with chat messages.
### Fixed
- **Quick Alchemy:** Improved error handling for versatile vials.
