A second system for rolling dice. The implementation is five parts

1. New Sidebar UX and generic View screens.
   The sidebar that lists sheets is now split in two. In the first part we have buttons for app wide pages. The second aprt has the current buttons for changing/adding sheets

The first button we add is the Dice Pooler. Click this opens the Dice Pooler View in the left column, replacing the sheet screen while it is open.

Sheets become a View screen. Only one View screen can be open at a time and is always in the left column (or at the top on mobile). The movable divider between history and view works the same as it does now between the active Sheet and the history.

2. The Dice Pooler view
   This View shows a row/grid of dice buttons (Dice Selector), each showing an SVG shape with a short kurzel (number or letter) on top of it, with a color style. See the Dice Pooler settings below for exactly how these look. Clicking a button here will add one instance of that button to the pool below. Each added button is a new copy, so if the user clicks the d6 button twice, two d6 buttons will appear in the pool box below.

Under the Dice Selector, There is a box (Pool box) which contains buttons for any dice added to the pool. Clicking a dice button here will remove it from the pool.

Under the Pool box, there is a row of buttons which include:
Roll the pool - Sends the request to the server, which rolls the dice in the pool and creates a Dice Pool History Result, see below
Save the pool (with a drop down for which sheet to save to) - saves this as a Dice Pool Template, see below.

There is also at the top an edit button, similar to we have on the sheets. When this button is clicked, the Dice selector is replaced with the Dice Configurator. see below.

The Dice Pooler view is NOT synced across clients. It is client side.

3. New Dice Pool result history object
   This is a new kind of history object, showing each dice from the rolled pool as an images depicting a shape and a kurzel.
   Any user can expand any Dice Pool Result and when expanded the dice can be clicked to rerolled. The reroll is added as a new dice and immediately rolled. The dice that was rerolled is then faded in color and the number style comes strikethrough. When the result is in the collapsed mode, only non-faded dice are shown.

If a dice rolled a result with a super color, then the background is colored with a gradient containing all the rolled super colors, and particles using the SVG particle shape of the result, using the color of the result, are produced in an explosion. If multiple dice results had super, spawn all explosions at once. See how we do Super results on normal dice results and mimic the style.

When expanded, there is also a button to save the Pool that created this result as a Dice Pool Template (see below)

4. The Dice Configurator
   This is similar to the Dice Selector, but when a dice is selected, another element of the Dice Configurator shows information and settings about that dice.
   Background: A dropdown selector of which SVG image to use for the background of all dice results (also effects the example)
   Faces: each face option that can result from the dice. Each face can have its color changed, its font color changed, a two character kurzel (alpha numeric), and a secondary SVG for a face image. Face Image and kurzel can be empty. Each face also has a dropdown for which SVG and color is used for the super effect if this is rolled. These can be empty. Faces are shown in a list with the options in the columns. At the end of each row is a button to delete the face. At the bottom of the list is a button to add a new face. By default, new faces copy the settings of the face above but increase the kurzel by either on letter position (A->B) or by one number (1->2).
   Background Shape - clickable to choose from a selection of SVG images for the background (used to make up the example)
   Tick button - save changes
   X button - discard changes
   Duplicate button - duplicate this dice
   trash button - delete this dice

The Dice Configurator settings are synced to clients and saved/persisted on the server between reloads and server starts.

5. Dice Pool Templates on sheets
   These are like Roll Templates, and are an item that can be added to any Sheet. When a sheet is in edit mode, the dice they have cannot be edited, but they also have a heading string which can be edited. They have the same save/discard changed/delete/duplicate buttons as other sheet items. When not in edit mode, they have two buttons in a side by side/split style. One rolls it directly, creating a Dice Pool result immediately. The other button clears the Dice Pooler pool, loads this set of dice in, and then swaps the view to the Dice pooler. The dice are not automatically rolled into a result in this case.

For Dice SVGs we need the common shapes d4,d6,d8,d10,d12,d20 and a circle shape.
For particle SVGs we need a range of different stars, leaves and confetti shapes
For face images, I will provide some, but make some placeholders for now.

Remember, that Dice pool templates must be synced like other sheet items. The history also needs to be synced when a new entry is made and when a dice is rerolled. 

