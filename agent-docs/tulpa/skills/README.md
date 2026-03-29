# JJ Workflow Skills

## Overview

This directory contains skills for Jujutsu (JJ) version control workflows based on analysis of 50 PI sessions with 2,750 JJ commands.

**Key Finding:** 88% of JJ workflows required user correction. These skills aim to improve success rates.

## Skills

### 1. `jj-workflow-safety.md`

**Purpose:** Critical safety rules that prevent common failures

**Read this first** - Contains the golden rules that apply to all JJ operations.

**Key Rules:**
- ALWAYS run `jj st` first
- NEVER commit without permission
- ALWAYS use `-A` (insert-after) in splits
- UNDO immediately on conflict
- VERIFY after every operation

---

### 2. `jj-safe-split.md`

**Purpose:** Split working copy changes into logical commits

**Use when:** User says "split" or wants to organize changes

**Key Protocol:**
```bash
jj st
jj log -r "@ | @- | bookmarks()"
jj diff --name-only
jj split -r @ -A <specific_parent> -m "message" <files>
jj st
jj log -r "@ | @-"
```

**Success rate:** 12% (88% required correction)

---

### 3. `jj-squash-insert.md`

**Purpose:** Squash messy changes, then insert at correct DAG positions

**Use when:** User says "squash everything down" or "insert between"

**Two Methods:**

**Method 1: Squash → Split**
```bash
jj squash --from @ --into <parent> -m "consolidated"
jj split -r @ -A <parent_A> -m "message A" <files_A>
jj split -r @ -A <parent_B> -m "message B" <files_B>
```

**Method 2: Insert Between**
```bash
jj insert -A <parent> -m "message"
jj squash --from @ --into <new_commit>
```

**Critical:** Use `jj insert -A` not `jj new` when inserting between commits.

---

### 4. `jj-recovery.md`

**Purpose:** Recover from mistakes

**Use when:** User says "undo", "restore", "go back", or operation failed

**Recovery Commands:**
- `jj undo` - Undo last operation
- `jj restore --from <commit>` - Restore specific files
- `jj op restore <id>` - Restore to operation state
- `jj abandon <id>` - Remove commit

**Rule:** Undo immediately when user says undo. Don't ask questions.

---

## Quick Reference

### Command Safety Matrix

| Command | Check State | Get Permission | Use -A | Verify After |
|---------|-------------|----------------|--------|--------------|
| `jj split` | ✅ Required | N/A | ✅ Required | ✅ Required |
| `jj squash` | ✅ Required | ✅ Required | Optional | ✅ Required |
| `jj commit` | ✅ Required | ✅ Required | N/A | ✅ Required |
| `jj new` | ✅ Required | ✅ Required | N/A | ✅ Required |
| `jj insert` | ✅ Required | ✅ Required | ✅ Required | ✅ Required |

### Recovery Triggers

| User Says | Do This |
|-----------|---------|
| *"JJ undo"* | `jj undo` then `jj st` |
| *"restore"* | `jj restore --from <commit>` |
| *"go back"* | `jj op restore <id>` |
| *"abandon"* | `jj abandon <id>` |
| *"stop"* | Stop immediately, wait |

### Common Failures

| Failure | Prevention |
|---------|------------|
| Wrong parent | Always use `-A <specific_parent>` |
| Commit without permission | Wait for explicit "commit" instruction |
| Conflicts | `jj undo` immediately, don't resolve |
| Not checking state | Always `jj st` before and after |

---

## Usage

**Before any JJ workflow:**
1. Read `jj-workflow-safety.md`
2. Identify which skill matches the task
3. Follow the skill's protocol exactly
4. Stop if user says stop
5. Undo if user says undo

**When in doubt:**
- Check state with `jj st`
- Ask user for clarification
- Don't guess

---

## Data Source

- **Sessions analyzed:** 50
- **JJ commands analyzed:** 2,750
- **Clean success rate:** 2%
- **Correction rate:** 88%
- **Session location:** `~/.pi/agent/sessions/--home-shamanic-dev-my-plugin--/`

---

## Success Criteria

Following these skills should:
- [ ] Reduce need for user correction
- [ ] Eliminate "I didn't ask you to JJ commit" errors
- [ ] Eliminate wrong-parent splits
- [ ] Eliminate missed state checks
- [ ] Improve user satisfaction

**Goal:** Move from 2% clean success to higher rate through consistent protocol adherence.
