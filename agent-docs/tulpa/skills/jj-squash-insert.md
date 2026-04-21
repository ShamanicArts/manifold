# JJ Squash and Insert

This document tells you how to take dirty changes (currently in the working copy commit, or sitting in some other commit) and place them as new commits at the correct positions in the DAG, when the user gives you vague natural-language instructions like "split this and put the bits where they go" or "insert this between A and B".

## Count lineages from Working Merge parents

The number of lineages equals the number of parents on Working Merge. Inspect the commits between each parent and Working Merge to see what that chain carries. Group dirty files by which chain they actually belong with. Do not invent lineages, do not merge lineages because a commit message says "docs", and do not hardcode a fixed number of lineages. This repo always has `main`/`dev` and `AgentSlop-DontPushToMain`; there may be more. The latest commit on these lineages may not be the one with the bookmark on them.

**CRITICAL**: The lineage tips are the Working Merge's parents, NOT the commits with bookmarks.

- Working Merge has at least 2 parents: `L1`, `L2`, etc.
- Each parent is the tip of one lineage
- Bookmarks (`dev`, `main`, `AgentSlop-DontPushToMain`) can be on any commit in the lineage
- Always use the Working Merge's parents as insert points, never bookmarks 

## Operate by change id, never by `@`

You always operate on commits by their change id (e.g. `lvzyxvnq`, `pwyplsln`). You never use `@` in any command. Even when the diff you want to move is in the working copy commit, you look up that commit's change id with `jj log` and use the change id in your `jj squash` invocation.

Reasons:

- `@` is positional. It can shift between commands and between operations. A change id is stable.
- Operations referenced by change id are auditable and unambiguous in logs and reports.
- If you start using `@` mid-workflow you will lose track of which commit you are acting on.

Get the working copy commit's change id from the `@` row in `jj log`. After that, refer to it only by its change id.

## Sacred rule: the working copy commit's change id never moves

The change id that `@` currently points at must remain in existence and continue to be the working copy commit throughout every operation in this workflow. The DAG position of that commit relative to its parent may shift (because something was inserted above it and the chain rebased), but its change id is preserved and it is still the working copy commit at the end.

If a command would cause that change id to be reassigned, abandoned, or replaced, it is the wrong command.

## Banned commands

| Command | Why banned |
|---|---|
| `jj rebase` | Wrong abstraction for inserting or splitting. Moves whole subtrees and breaks DAG shape. The correct verb for placing diffs is `jj squash`. |
| `jj new -A <p>` | Creates a new change at the insert slot and reassigns the working copy onto it. Working copy commit's change id changes. Violates sacred rule. |
| `jj edit <X>` | Reassigns the working copy to commit X. Violates sacred rule. |
| `jj insert ...` | Does not exist in jj 0.40. Do not invent commands. |
| `jj undo` | Unsanctioned. If state looks wrong, run `jj op log -n 10` and report to the user. The user decides whether to undo. |
| Any command containing `@` | Use change ids. See the rule above. |

## Lineage vocabulary in this repo

The **Working Merge** is a commit whose description is exactly `Working Merge`. Its change id varies over time. Look it up:

```
jj log -r 'description(glob:"*Working Merge*")' --no-graph
```

Take the change id from the first column of that output and use it (call it `<wm>` in the recipes below).

- Commits **downstream** of `<wm>` form the main lineage. You do not touch them in this workflow.
- Commits **above** `<wm>` are *definitionally* not main. Do not call any above-merge chain "main lineage". Do not refer to "main" at all when describing above-merge work.

Discover the commits that exist above `<wm>` from `jj log`. These contain the changes to be moved. The target lineages are `<wm>`'s parents. Identify each lineage's purpose by reading commit descriptions.

Enumerate above-merge tips:

```
jj log -r 'heads(<wm>..)'
```

Inspect a chain back to Working Merge:

```
jj log -r '<tip>::<wm>-'
```

## The grammar of squash

`jj squash` moves a diff from a **source** commit into a **destination** position. There are two cases. They look almost identical and differ in one flag.

### Case A — source is the working copy commit

Look up the working copy commit's change id. Call it `<wc>`. Then:

```
jj squash --from <wc> --insert-after <parent> --keep-emptied -m "<commit message>" [<paths>]
```

- A new commit is created immediately after `<parent>`, containing the diff (or only `<paths>` if given).
- Descendants of `<parent>` (which include the chain leading to `<wc>`) are rebased to sit on top of the new commit.
- `--keep-emptied` keeps `<wc>` alive at its existing change id even when the squash empties it. Without `--keep-emptied`, an emptied `<wc>` would be abandoned and the working copy would be reassigned to a different change. Always pass `--keep-emptied` when source is the working copy commit.

### Case B — source is some other commit X (X is not the working copy commit)

```
jj squash --from <X> --insert-after <parent> -m "<commit message>" [<paths>]
```

- A new commit is created after `<parent>` containing X's diff (or only `<paths>`).
- X is abandoned (or kept as a partial commit if `<paths>` was a strict subset of X's diff).
- Do **not** pass `--keep-emptied` here. `--keep-emptied` is for the working-copy-as-source case only.

The two cases differ only in whether `--keep-emptied` is present. Choose by asking: is the change id you are passing to `--from` the same as the working copy commit's change id? If yes, Case A. If no, Case B.

## When the user says "split this and put the bits where they go"

The user will not give you commit ids. You derive them. The user will not always tell you which chain each file belongs on. You derive that by inspecting each above-merge chain to see what work it carries.

Procedure:

1. Look up Working Merge change id `<wm>`:

   ```
   jj log -r 'description(glob:"*Working Merge*")' --no-graph
   ```

2. Find Working Merge's parents (the lineage tips):

   ```
   jj log -r 'parents(<wm>)' --no-graph
   ```

   Save these change ids as `<L1_tip>`, `<L2_tip>`, etc. These are the ONLY lineage tips you will ever use for insertions.

3. List dirty paths and the working copy commit's change id `<wc>`:

   ```
   jj st
   jj log -r '<wm>::' --no-graph
   ```

   The change id of the row marked with `@` in normal `jj log` output is `<wc>`. Record it. Do not refer to `@` after this step.

3. Enumerate above-merge tips and inspect their chains:

   ```
   jj log -r '<wm>..' --no-graph
   jj log -r 'heads(<wm>..)'
   jj log -r '<tip>::<wm>-'
   ```

   For each tip, read the descriptions back to `<wm>`. Decide which lineage each dirty path belongs on. Path heuristics: anything under `agent-docs/` on   SLOP lineage; source code belongs on the relevant WIP/code lineage.

   **CRITICAL**: The lineage tips are the Working Merge's parents, NOT the commits with bookmarks. Always use the Working Merge's parents as insert points.

4. For each lineage, peel its files off `<wc>` using Case A:

   ```
   jj squash --from <wc> --insert-after <lineage_tip> --keep-emptied -m "<commit message>" <paths_for_that_lineage>
   ```

   Repeat for each lineage. `<wc>` stays at the same change id across every call.

5. Verify (see the verification section below).

## When the user says "insert this between A and B"

A and B are existing commits where B is a child of A. The user wants a new commit X created such that the chain becomes A → X → B, with X containing the diff currently sitting somewhere.

If the diff is in the working copy commit (`<wc>`):

```
jj squash --from <wc> --insert-after <A> --keep-emptied -m "<commit message>"
```

If the diff is in some other commit Y:

```
jj squash --from <Y> --insert-after <A> -m "<commit message>"
```

In both cases B and B's descendants rebase automatically onto the new commit. Do not use `jj rebase`. Do not use `jj new -A`.

## When the user says "move commit X onto lineage L"

```
jj squash --from <X> --insert-after <tip_of_L> -m "<commit message>"
```

X is abandoned. The diff lands as a new commit at the tip of L. This is Case B; no `--keep-emptied`.

## When to use jj split

Use `jj split` when you need to break a single commit into multiple commits:

```
jj split -r <source_commit> -A <insert_after> -m "<commit message>" <paths>
```

- `<source_commit>`: The commit you want to split
- `-A <insert_after>`: The lineage tip to insert after (Working Merge's parent)
- `<paths>`: Specific files to extract (optional - if omitted, all changes are selected)

Example: Split `<source_commit>` into docs and code:
```
jj split -r <source_commit> -A <slop_tip> -m "docs(slop): update agent docs" agent-docs/README.md
jj split -r <source_commit> -A <dev_tip> -m "fix(dsp): update default_dsp.lua" manifold/dsp/default_dsp.lua
```

**Note**: After splitting, the original commit becomes empty and is abandoned. The selected changes become the new commits.

**Important**: When splitting, always specify the lineage tip (`-A`) as a Working Merge parent, not a bookmark. Use the file placement heuristics in Appendix B to determine which lineage each file belongs on.

**CRITICAL**: In the `-A` argument, you must pass a Working Merge parent change id, NOT a bookmark. The Working Merge parent change ids are found with `jj log -r 'parents(<wm>)' --no-graph`. After every operation, re-find the Working Merge's parents with this command, as they may have shifted.

## Resolving vague user instructions



If you genuinely cannot map the request to a recipe (for example, you cannot decide which lineage a path belongs on), ask the user one specific question naming the path and the candidate lineages. Do not guess silently.

## Verification after every operation

```
jj st
jj log -r '<wm>::' --no-graph
jj log -r 'parents(<wm>)' --no-graph
```

Four checks:

1. The working copy commit's change id is the same as `<wc>` recorded before the operation.
2. The new commit appears at the intended position on the intended lineage.
3. No commit is duplicated, stranded, or moved off its lineage.
4. The Working Merge's parents are correct (re-find them with `jj log -r 'parents(<wm>)'`).

If any of these fail, do not attempt to repair with `jj rebase` or `jj undo`. Stop and report the divergence to the user.

## Recovery

If state looks wrong, run:

```
jj op log -n 10
jj log -r '<wm>::' --no-graph
jj log -r 'parents(<wm>)' --no-graph
```

Report the output to the user. The user decides whether to `jj undo`, `jj op restore`, or proceed forward. Never run `jj undo` on your own initiative.

## Common file placement mistakes

These are mistakes agents have actually made on this workflow:

1. **Putting agent-docs files on the dev lineage**. agent-docs is SLOP, not code. All files in `agent-docs/` belong on the SLOP lineage.

2. **Using bookmarks as lineage tips**. Bookmarks are not the tips. Always use the Working Merge's parents.


4. **Splitting commits one at a time instead of using jj split properly**. Use `jj split` to extract specific files, don't try to use `jj squash` to move individual files.

5. **Not re-finding Working Merge's parents after operations**. After each successful jj squash or jj split, the Working Merge's parents may shift. Always re-run `jj log -r 'parents(<wm>)'` to get the new lineage tips.

## Common failure patterns from prior sessions

These are mistakes agents have actually made on this workflow. They are listed so you do not repeat them.

1. **Using `jj rebase -s X -d P` to "insert" X under P.** `jj rebase` moves X and all its descendants as a subtree. It does not insert. The correct command is Case B: `jj squash --from X --insert-after P`.

2. **Using `jj new -A <parent>` to "make a slot" then squashing into it.** The slot creation reassigns the working copy onto a new change id. Violates sacred rule. Correct command is a single `jj squash --from <source> --insert-after <parent>` (Case B) or with `--keep-emptied` (Case A).

3. **Inventing `jj insert`.** Not a real command in jj 0.40. Use `jj squash --insert-after`.

4. **Calling above-merge chains "main lineage".** Anything above Working Merge is not main. Use the chain's content-based name 

5. **Running `jj undo` after a confusing log output.** The log was probably correct and `--insert-after` rebased descendants as expected. Verify with the verification commands above before assuming damage.

6. **Asking the user for commit ids when `jj log` would reveal them.** The user's vague instruction is the contract. Derive ids yourself from `jj log` and commit messages.

7. **Using `@` in any command after looking up `<wc>`.** All subsequent commands must use the change id. `@` is forbidden in your invocations.

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Working Merge** | A commit whose description is exactly "Working Merge". Contains the working copy commit as a descendant. Its change id varies over time. |
| **Lineage tips** | The Working Merge's parents. These are the actual latest commits on each lineage, not the commits with bookmarks. |
| **SLOP** | A specific type of documentation: worksheets that detail tasks to be refactored. Located in `agent-docs/` and `prototypesandreseearch/`. |
| **Docs** | Documentation about the codebase. Located in `agent-docs/` and project-specific docs. Belongs on the SLOP lineage. |
| **Code branch** | The lineage containing actual source code (DSP, UI, etc.). Located in `manifold/` and `dsp/`. Belongs on the dev lineage. |
| **Change id** | A stable identifier for a commit (e.g., `lvzyxvnq`). Used to reference commits unambiguously. |
| **Bookmark** | A marker on a commit (e.g., `dev`, `main`, `AgentSlop-DontPushToMain`). Can be on any commit in the lineage, not necessarily the tip. |

## Appendix B: File Placement Heuristics

Use content clues to determine where files belong:

| File Location | Lineage | Reason |
|---------------|---------|--------|
| `agent-docs/*` | SLOP | agent-docs is specifically for SLOP documentation |
| `prototypesandreseearch/*` | SLOP | Prototype research files are SLOP |
| `manifold/ui/UI_SYSTEM_DESIGN.md` | dev | UI documentation about code |
| `manifold/dsp/*.lua` | dev | Actual DSP code |
| `manifold/dsp/**/*.cpp` | dev | Actual C++ code |
| Any project-specific docs describing working code | dev | Documentation about code |
| Any worksheet describing refactoring tasks | SLOP | This is what SLOP means |

**Rule of thumb**: If it's in `agent-docs/` or describes refactoring tasks, it's SLOP. If it's actual source code or documentation about the codebase, it goes on the dev lineage.

## Quick reference

Substitute change ids you have looked up for `<wc>`, `<wm>`, `<L_tip>`, `<X>`, `<Y>`, `<A>`, `<B>`.

| Goal | Command |
|---|---|
| Find Working Merge change id | `jj log -r 'description(glob:"*Working Merge*")' --no-graph` |
| List above-merge tips | `jj log -r 'heads(<wm>..)'` |
| Peel paths off working copy onto lineage L | `jj squash --from <wc> --insert-after <L_tip> --keep-emptied -m "<commit message>" <paths>` |
| Insert working copy diff between A and B | `jj squash --from <wc> --insert-after <A> --keep-emptied -m "<commit message>"` |
| Relocate commit X to lineage L | `jj squash --from <X> --insert-after <L_tip> -m "<commit message>"` |
| Insert commit Y's diff between A and B | `jj squash --from <Y> --insert-after <A> -m "<commit message>"` |
| Verify after each op | `jj st && jj log -r '<wm>::' --no-graph` |
