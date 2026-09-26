# Checkpoint 70 · CV rack patch state

Open the [CV rack workbench](http://127.0.0.1:4173/?primitive=cv-rack) and review the [browser capture](checkpoint-70-cv-patch.png), [roundtrip metrics](checkpoint-70-metrics.json), [exported patch](checkpoint-70-patch.json), and [patch contract](../../docs/patch-editing-contract.md).

The CV rack can download and reopen a versioned v2 JSON patch. It records the eight editable control routes, including disconnections, and all ten public controls. Import requires the exact project ID and schema version, one allowed source or null per declared port, and valid values for every control. It is available while the instrument is stopped; the next start compiles the restored Rust graph. This is not a legacy Lua patch or a native plug-in preset. Route selectors now use the compact dark control styling.

The browser roundtrip changed Mix input 1 to Source LFO, disconnected Mix input 2, selected Track mode, and set base gain to 1.50. The downloaded patch restored all four values. An invalid audio-node source on Mix input 1 was rejected without changing that route. Switching to Voice and back preserved the edited routes and controls. Starting the instrument afterward ran at 48 kHz; import was disabled while audio ran and there were zero page errors. The selected CV rack offline case showed **Match** in the browser; the web build passed. No DSP code or offline comparison corpus changed, so the broader **373 cases across 43 views** baseline remains checkpoint 66.

The file covers the prepared CV rack's fixed set of nodes and editable control inputs. Live node addition, plan replacement, state migration, and native plug-in preset handling remain open.
