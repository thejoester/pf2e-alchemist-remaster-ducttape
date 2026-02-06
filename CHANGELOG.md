# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.15.2] - 2026-02-04
## Changed
- **Localization:** Updated Chinese (cn) localization. Thanks [AlphaStarguide](https://github.com/AlphaStarguide)!

## [2.15.1] - 2026-02-04
### Fixed
- **Level Up:**
  - Fixed issue preventing lower level versions of formulas from being removed when leveling up or running macro. 

## [2.15.0] - 2025-11-16
### Added
- **Quick Alchemy:** Added support for [Improbable Elixirs](https://2e.aonprd.com/Feats.aspx?ID=5800) feat. 
### Changed 
- **Indexing:** Reworked the index of items used in the module
  - Now will include potions (for Improbable Elixirs). 
  - Only re-index if index is 3 days old, speeding up loading as every player does not need to re-index every refresh. 
- **Module:** Cleaned up older unused code, formatting of comments. 

## [2.14.10] - 2025-11-12
### Fixed
- **Quick Alchemy:** fixed error in Poison Quick Vial that triggered it as needing reload. 
- **Quick Alchemy:** fixed but preventing effect from limiting to 10 minutes from Quick Alchemy items being applied by player.
### Added
- **Macro:** Added Macro (Adjust Effect Duration) that GM or players can use to list any effect on selected token that has duration longer than 10 minutes, and reduce it to 10 minutes. 

## [2.14.9] - 2025-10-27
### Fixed
- **Quick Alchemy:** Fixed issue when throwing Chirurgeon Field vial, apply healing button should now work for target player. 

## [2.14.8] - 2025-10-24
### Fixed
- **Level Up:** Fixed issue not upgrading Cooperative Waffles due to no `lesser` tag in original item.
  - This may be an issue with other items that have a `greater` version but no `lesser` on the base item, if you come across one please let me know! 

## [2.14.7] - 2025-10-05
### Fixed
- **Localization:** Updated module.json file to add French localization (fr.json)
- **Localization:** Fixed bug causing localization in toxicologist persistent poison tag for chat message and damage roll window.

## [2.14.6] - 2025-10-02
### Changed
- **Localization:** Updated French localization. Credit [Rectulo](https://github.com/rectulo).

## [2.14.5] - 2025-09-26
### Fixed
- **Vial Search:** fixed bug where alchemist dedication would be prompted to add vials after 10+ minutes. 
- **Powerful Alchemy:** fixed bug where it would send item description to chat before modifying the DC. 

## [2.14.4] - 2025-09-23
### Changed
- **Formula Search:** updated the search on the formula page to also seach traits, and description. Credit to [crash1115](https://github.com/crash1115) for the suggestion!

## [2.14.3] - 2025-09-20
### Added
- **Localization:** added French localization. Credit [Rectulo](https://github.com/rectulo).

## [2.14.2] - 2025-09-11
### Added
- **Quick Alchemy:** Added better support for Chirurgeon Field Vial. Will prompt to Throw or craft:
  - Throw: will throw at targeted creature, roll a heal and place chat message to apply healing.
  - Craft: Crafts item and creates chat message to use. 

## [2.14.1] - 2025-09-11
### Changed
- Merged compendiums into folder "PF2e Alchemist Duct Tape". 
- updated release process to elimiate file spam in packs/ directory

## [2.14.0] - 2025-09-01
### Changed
- **Quick Alchemy:** Sorting inventory and craft lists alphabetically
- **Quick Alchemy:** Excluding already unstable and versatile-vials 
### Fixed
- **Quick Alchemy:** fixed bug in Unstable concoction that posted note in chat card about Flat check twice, and completed localization for additions. 

## [2.13.8] - 2025-08-31
### Fixed
- **Quick Alchemy:** fixed bug in Unstable Concoction that only replaced first damage dice imbed in description.

## [2.13.7] - 2025-08-30
### Added 
- **Quick Alchemy:** Added support for [Unstable Concoction](https://2e.aonprd.com/Feats.aspx?ID=5790). 
### Fixed
- **Quick Alchemy:** Fixed support for [Toxicologist Field Benefit](https://2e.aonprd.com/ResearchFields.aspx?ID=8), instead of making duplicate of item now applies Rule Element to actor that applies Quick Vial poison damage for selected weapon. 

## [2.13.6] - 2025-08-27
- **Localization:** Updated Chinese translations. Credit: [AlphaStarguide](https://github.com/AlphaStarguide).

## [2.13.5] - 2025-08-23
### Changed
- added some debugging code and updated Compendium Journal. 

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