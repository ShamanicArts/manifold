# Review checkpoint 20: workbench navigation

Date: 2026-09-26. Open the [primitive workbench](http://127.0.0.1:4173/). The [desktop](checkpoint-20-1365.png) and [390 px mobile](checkpoint-20-390.png) captures show the direct primitive picker and the selected Envelope ducking view.

The desktop library now scrolls inside its own bounded panel. Clicking a lower primitive no longer scrolls the entire page above the selected module; in Chromium the module top stayed at 76 px after selecting the bottom view, where it had been at −316 px before this change. The picker stays visible while the desktop list scrolls. On narrow screens the long list is replaced by the picker; the selected module begins at 269 px, so controls are visible without scrolling through all seventeen items.

The picker and list share the same selection path, URL, browser back/forward state, and reference comparison. All seventeen views selected through the mobile picker loaded their matching reference case with no page errors or horizontal overflow. The full **95 browser comparison cases** still show Match with no page errors. This checkpoint changes browser navigation only; the Rust DSP and comparison fixtures are unchanged.
