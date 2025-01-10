# Changelog

## [2.5.9] - 2025-01-10
### Fixed
- [Issue #17](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/17) Only messages from this module are collapesed when setting is enabled. 
- [Issue #18](https://github.com/thejoester/pf2e-alchemist-remaster-ducttape/issues/18) Found and fixed bug where if alchemist character did not have versatile vial item in invetory but did have quick vial item and rested, it would update the quantity of the quick vial item to what should have been the versatile vial item quantity. 

## [2.5.8] - 2025-01-08
### Added
- **Quick Alchemy**: Messages for crafted items will hide the item description for shorter messages (Thanks for the suggestion [xdy](https://github.com/xdy)!).
  - Added eye icon to expand.
  - Can be disabled in settings.
- **Powerful Alchemy**: Simplified chat messages for modified item descriptions.

## [2.5.7] - 2025-01-01
### Fixed
- **Level Up**: (issue #15) Resolved issues with adding or removing versions of known formulas in languages that use commas instead of parentheses to indicate formula quality (e.g., lesser, greater).

## [2.5.6] - 2024-12-25
### Fixed
- **Quick Alchemy**: Reversed changes to how Quick Vials consume versatile vials. Now they do not.

## [2.5.5] - 2024-12-15
### Added
- **Quick Alchemy**: Added support for "Bomber" and "Advanced Vials (Bomber)" feats (Player Core 2 pg. 61).
  - "Bomber" allows changing damage type for Quick Vials.
  - "Advanced Vials (Bomber)" adds material traits (adamantine, cold iron, dawnsilver) to Quick Vials.
- **Quick Alchemy**: Added support for the "Chirurgeon" feat (Player Core 2 pg. 61).
  - Can craft a "Healing Quick Vial," which creates an Elixir with Healing and Coagulant traits.
### Fixed
- **Quick Alchemy**: Enforces RAW for crafting "Quick Vials" using versatile vials. Removes unsupported options.
### Known Issues
- **Quick Alchemy**: Toxicologist support (Player Core 2 pg. 62) still needs work.

## [2.5.4] - 2024-12-10
### Fixed
- **Quick Alchemy**: Corrected crafting of appropriate level versatile vials.
- **Powerful Alchemy**: Fixed issue with adjusting item DCs.
- **Debugging**: Disabled debug messages when set to "None".

## [2.5.3] - 2024-12-01
### Fixed
- **Vial Search**: Corrected addition of proper item level vials.
- **Settings**: Fixed descriptions.
- **Quick Alchemy**: Resolved macro execution issues in different languages (issue #14).

## [2.5.2] - 2024-11-25
### Added
- **Archetype Support**: Allows crafting quick vials but not versatile vials.
- **Level Up**: New formula management options:
  - Add or remove lower-level formulas.
  - Settings for auto-prompting formula upgrades.
### Fixed
- Annoying notifications for non-Alchemist characters (issue #13).

## [2.5.1] - 2024-11-20
### Fixed
- **Powerful Alchemy**: Corrected DC update bug in descriptions (issue #10).

## [2.5.0] - 2024-11-15
### Added
- **Quick Alchemy**: Improved macro flow and added features:
  - Temporary item labels and slugs.
  - Automatic removal of items at the end of combat.
  - Double Brew feat support.
- **Level Up**: Added GM prompts for formula upgrades when no actor owner is logged in.
- **Debugging**: Enhanced logging.

## [2.4.3] - 2024-11-01
### Fixed
- **Vial Search**: Performance improvements and proper handling of versatile vials.

## [2.4.2] - 2024-10-25
### Added
- **Quick Alchemy**: Added Double Brew feat support.
- **Settings**: Added "Ask for all" formula handling option.
### Fixed
- **Module**: Corrected spelling errors.
- **Vial Search**: Improved support for non-English Foundry versions.

## [2.4.1] - 2024-10-10
### Added
- **Vial Search**: Chat output for new formulas and Alchemical Expertise support.
### Fixed
- **Quick Alchemy**: Non-English support for versatile vial renaming.

## [2.4.0] - 2024-10-01
### Added
- **Vial Search**: Monitors game time and prompts Alchemists to add vials after 10 minutes of exploration.

## [2.3.1] - 2024-09-15
### Fixed
- **Level Up**: Properly handles skipped levels when adding higher-level formulas.

## [2.3.0] - 2024-09-01
### Added
- **Level Up**: Automatic addition of higher-level versions of known formulas during level-up.

## [2.2.1] - 2024-08-15
### Added
- **Quick Alchemy**: loading screen and formula counts in UI.
### Fixed
- **Quick Alchemy**: Error handling for corrupted actor formulas (issue #5).

## [2.2.0] - 2024-08-01
### Added
- **Quick Alchemy**: Formula search feature 
- **Module**: Bug Reporter integration.

## [2.1.2] - 2024-07-15
### Fixed
- **Quick Alchemy**: Removed errant line causing file loading issues.

## [2.1.1] - 2024-07-01
### Fixed
- **Quick Alchemy**: Debug settings preventing important notifications.

## [2.1.0] - 2024-06-15
### Added
- **Quick Alchemy**: Settings to enable/disable Powerful Alchemy and adjust item sizes for actors.
- **Quick Alchemy**: Prompt for creating versatile vials if none are available.

## [2.0.2] - 2024-06-01
### Added
- **Module**: Compatibility with PF2e system v6.7.0.

## [2.0.1] - 2024-05-15
### Added
- **Quick Alchemy**: Option to only craft weapon items with chat messages.
### Fixed
- **Quick Alchemy**: Improved error handling for versatile vials.