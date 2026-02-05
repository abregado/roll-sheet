## Small future ideas to consider
- adding images to represent each roll template. use them as either an icon, or an image based roll button
- Using images in the roll history to create more drama. Drag an image onto a Roll Template the upload it and add it to the roll template.
- support for multiple {results} using square brackets in dice formula ("[1d20][1d20]" gives {result} and {result2})
- columns for attributes, so the user can have more of them side by side
- when the server starts and detects no sheets.json, generate an empty one.
- new formula variant prefabs button to add Advantage/Disadvantage quickly
- in the roll breakdown of history entries, show the code of the attributes used (eg: // 3 (@str)) inside the formula (eg:// 2d20dl: [3, 7] = 7 + 3 (@str) = 10)
- BUG: There is some weirdness when reordering an item to the top or bottom of a list
- OR operator in formulas eg: // {@prof | @dex | 2} for "use prof if it exists, then dex, then 2"
- conditionals in text formulas
- option in roll templates to for the split button drop down from appearing, and then having it also show the first result. useful for rolls with many formulas.
- New string attribute that takes a comma separated list. The user can select which option is currently selected using a dropdown.
- button on history entries to copy the roll template to our current sheet
- when a client rolls something, show the result in the middle of the screen.
- more juice when a new non-super roll comes in
- adhoc rolls
- (i) icon that shows description text that the user can enter on an attribute/roll tempalte/or resource
- short string description resource


## Big new features to add
### Sheet style and visual customization
Roleplaying games are all about personalization. We need solid options for the user to customize how their sheet looks, and which vibe it portrays.
Some ideas would include:
- custom css stylesheets per character sheet, saved into the sheet data so each sheet can have a different one
- option to drag textures onto the background to set a background image for the character sheet
- character portraits as an option (should not be necessary, and their should not be space reserved for it)
- choice of super animation
- adding images or icons for roll templates, so you can condense the space they take, but also project some of the rolls vibe onto the sheet
- the user customization should not require them to write css so we need UX like dragging images onto parts of the sheet to change it.
- adding style flair to the roll history entries made by this character sheet
- css customization per sheet via a paint icon at the bottom of the sheet. Has several premade css styles to choose from (Light, Dark, Retro, Paper)
- option to color roll buttons and drop down options (for example, green background for adv, red for disadvantage)

### Touch screen and mobile accessibility
- in landscape mode, just use desktop mode. In portrait mode a special view
- having roll templates in a condensed way on the same screen as the history. We want the user to see the history all the time, or at least the newest entry.
- tabulated or drawer based selection of character sheet
- user probably does not want to view more than one character sheet on their mobile, so the swapping UI can be hidden away
- probably history at the top, forced to give enough space to see two entries at a minimum (condensed compared to desktop)
- bottom part has only either roll templates or attributes, but only one.
- scroll up and down to change the division, but the history can never be scrolled away
- maybe swipe sideways to swap the bottom section between attributes and roll templates

### Roll tables
For generating random words and numbers. These can be used in display formulas.

## VTT Connectivity for sending roll results
Maintain a list of ip's that get sent the roll results 