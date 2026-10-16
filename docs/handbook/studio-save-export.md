# Save, move and export

There are three different things you might want to keep: your editable project, your preferred Studio layout, and a compiled instrument or effect. Save each for its own purpose.

## Keep a portable project

In browser Studio, **File → Save project** downloads the accepted project. The `.manifold.json` document can contain source, project-owned files, composition, graph values and supported embedded assets. Studio also saves its separate Input graph and that graph’s source and values. Open it again to check that the intended source and values survived.

The interactive lessons also have **Save project**. This saves the live accepted settings, not just the lesson's defaults. **Open in Manifold Studio** creates a local draft with the same project and settings. Audio starts stopped in browser Studio. The lessons retain their authored sound generators. For effects wired to live input, connect a microphone/interface in **Settings → Audio hardware**; choose live input in the Input graph’s Controls tab, then start audio and set Master in the top bar.

Browser drafts live in local browser storage. Clearing site data, switching profiles or changing the site's origin can make those drafts unavailable. Download a project you care about. A named workspace layout is stored separately and does not travel inside the instrument.

## Accepted source versus an editor draft

The running project is the last accepted version. Text you have typed but not applied can still be a draft. Apply it and inspect the result before treating Save or Export as a record of that change.

If a file changed after you opened it—for example through an agent—Studio checks its revision/content before accepting your save. Review or reload the newer accepted file, reconcile your changes, and apply again. Avoid treating a timeout as proof of rollback: inspect the accepted project first.

## Build an actual plug-in

The repository has a working export path for supported authored packages to **CLAP** and **VST3**. The private browser workflow snapshots the accepted project and submits it to a configured native build service. Rust compilation happens on that build machine, not in the browser tab.

Studio’s Input graph is excluded from plug-in export. The exported Device receives audio from its plug-in host; Studio’s test oscillators, noise, source blends and final listening Master do not ship. Generators deliberately authored inside the Device do ship.

The export form asks for a permanent product ID, name, vendor, version, instrument/effect role and target. Keep the same permanent ID when rebuilding the same product; use a new ID for a different product. A completed build provides an archive and receipt tied to the captured revision.

Current evidence includes actual Linux and ARM Mac DAW tests and Windows REAPER under Proton for earlier exported custom-view packages. The current Studio composition and MCP feature set still needs full packaged plug-in/DAW acceptance. Do not read that earlier export proof as “every Studio project exports to every platform.”

Public hosted builds are not ready for anonymous deployment. The existing service is private and needs authorization, job isolation, quotas and deployment hardening. Signing, notarization, installers and broader dependency packaging are also unfinished. The standalone Studio's general Export menu is currently disabled.

## Automate Studio or an exported instrument

When Studio runs inside a DAW, it offers 2,048 automation slots. Each stays in the
same place while you edit the project. Studio translates the DAW’s 0–1 automation
into the assigned control’s real values, such as frequency or a filter choice.
The host may show the control’s name, or keep a generic “Automation” label.

Deleting a control keeps its slot reserved so an old recording cannot silently
start moving an unrelated new control. Saving and reopening preserves these
assignments. Explicitly swapping assignments can redirect recorded automation,
so do that only when you intend to change what the recording controls.

The bank does not limit how many controls or nodes you can create. Controls
outside it still work inside your project. Exported plug-ins expose the public
controls declared by the project, with their names, ranges and types, without
Studio’s unused slots. Changing that public contract in a later build may require
the DAW to reload the plug-in. Keep stable control identities when updating a
product people already automate.

## Keep the project rebuildable

A useful handoff includes the portable project, the Manifold revision/toolchain used to build it, required renderer dependencies, and any separately licensed assets. An export archive contains packaged project/assets and file hashes, but arbitrary npm dependencies or custom Rust extensions are not yet a general portable build contract.

Local runtime processing does not need a Manifold account or inference service. Broader release guarantees—stable package distribution, documented schema migrations and clean-machine rebuilds—still need work before we promise indefinite reproducibility.

## When something fails

If a file cannot reopen, keep the original download and its diagnostic. If an export fails, read the build diagnostic rather than repeatedly changing your project. If a dependency is missing on a different host, establish that host's supported dependency and target contract before rewriting the instrument.

For an agent-assisted handoff, copy **Ask your agent** from this page. Ask it to compare the saved source, files, connections and values after reopening, then check the intended build target separately.
