# Make the workspace yours

A sound-design session and a source-editing session need different amounts of space. Studio's layout is your preference. You can change it without changing the project's graph, audio or authored interface.

## Start with a familiar arrangement

**Classic** places Project and Presenter above Graph, with Inspector on the right. **Columns**, **Inspect source** and **Presenter-only** offer other starting points. Choose a layout from View, then adjust it to suit the current job.

Drag a pane's title onto another pane's edge to split left, right, above or below. Drop in the centre to swap panes. Drag the dividers to resize. The pane menu provides relative docking actions too. **View → Panels** shows and hides individual panes; **Lock workspace** prevents accidental rearrangement while leaving ordinary editing available.

## Explorer without the file editor

Explorer is a sidebar beside the selected file. Its vertical divider changes the tree's width. Collapse it when you want the asset alone.

To keep **only the tree**, use the **−** button in the file header, or **View → File view**. Selecting a graph object now changes selection without reopening source. Clicking a file or an explicit Code link brings the asset back. **Show file** restores the previous asset and split width.

This is useful while wiring a graph: keep a navigable project tree, a large Graph, and the Inspector, then open implementation only when you need it. Hiding the file does not discard its draft.

## Give the instrument its own space

Presenter contains the project's authored interface. Maximize it into the workspace, or float it as a movable, resizable panel and dock it again later. The current floating view stays within the Studio window; a separate operating-system window is not implemented. One pane may float at a time.

Use **Fixed aspect** when a face should preserve its proportions. Set the Presenter preview width and height in Settings. The current default is **1160 × 670**, about **1.73:1**. This is the content ratio, excluding Studio's title and control bars. Free sizing remains useful when authoring a responsive interface.

Those dimensions control Studio's preview. They are not yet a complete exported plug-in window-sizing contract.

## Save a layout you like

Use **View → Saved layouts** to name the arrangement. It includes pane splits, visibility, Explorer width and visibility, file visibility and the focused/floating pane choice. Floating window coordinates are not currently retained.

Browser layouts live in local browser preferences. Standalone saves workspace preferences in `manifold/studio-workspace.json` under the user's configuration directory. A project opened into Studio uses your existing shell and layout; the new project's content is adopted inside it.
