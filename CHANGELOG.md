## 2.1.1
- fixed debug setting that would prevent important notifications being displayed.

## 2.1.0
- Added settings options.
  - Added settings option to enable/disable Powerful Alchemy (default: enabled).
  - Added settings option to enable size based quick alchemy. Three settings, Disabled = will not adjust item size based on actor size, Tiny Only = only adjust item size for tiny actors, All Sizes = will adjust item size for all size actors. 
- If no Versatile Vials are in inventory and the Quick Alchemy macro is run, it will prompt to create one. 

## 2.0.2
- Updated to support pf2e v6.7.0.

## 2.0.1
New Features
- Option to only craft weapon items.
- When only crafting, will send message to chat with link use / attack.

Bug Fixes
- Creating a Versatile Vile will not consume a Versatile Vial. 
- Added more error handling so that Versatile Vials are less likely to be consumed if error happens at wrong moment. 
- Fixed bug where multiple of the items could be crafted in separate stacks. Now will increase quantity.
