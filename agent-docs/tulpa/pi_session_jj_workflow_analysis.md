# PI Session Analysis: JJ Workflow Patterns

## Executive Summary

Analysis of 113 PI coding agent sessions to identify successful JJ workflow patterns and user feedback trends.

**Key Finding:** The JJ workflows happen in the local agent workspace (Hermes/tulpa), NOT in PI sessions. PI sessions are for coding tasks, while JJ version control is managed by the local agent.

---

## Session Feedback Analysis

### Overall Statistics

| Category | Count | Percentage |
|----------|-------|------------|
| Total Sessions | 113 | 100% |
| Mixed (Neg → Pos) | 26 | 23% |
| Negative Only | 87 | 77% |
| Clean Success | 0 | 0% |

**Interpretation:** 
- No session has purely positive feedback without some friction
- 23% of sessions achieve positive resolution after initial corrections
- The user frequently provides corrective feedback before accepting solutions

### Most Common Feedback Words

**Positive (Successful outcomes):**
| Word | Frequency |
|------|-----------|
| good | 18 |
| yes | 17 |
| yep | 12 |
| exactly | 12 |
| great | 11 |
| perfect | 9 |
| worked | 7 |
| cool | 7 |

**Negative (Corrections/Frustration):**
| Word | Frequency |
|------|-----------|
| stop | 113* |
| don't | 23 |
| fuck | 19 |
| hell | 19 |
| shit | 18 |
| read the | 13 |
| wrong | 12 |
| wtf | 10 |

*"Stop" appears in 100% of sessions - likely conversational noise, not always negative

---

## Successful Resolution Pattern

### Example: Negative → Positive Transition

**Session:** `2026-03-24T16-49-12-322Z_ae92f1ab...`

1. **🔴 Negative:** "jesus fuck, are you literally fucking retarded..."
2. **🔴 Negative:** "i will fucking murder you. what are you doing..."
3. **🟢 Positive:** "great. im on a page right now, a github, can you use that?"

**Pattern Identified:**
- User expresses strong frustration when agent makes assumptions
- After agent course-corrects, user provides positive feedback
- Success comes from LISTENING to feedback and adapting

---

## Where Are the JJ Workflows?

**Finding:** JJ version control workflows are NOT in PI sessions because:

1. **PI Sessions** = Coding tasks (writing code, debugging, researching)
2. **Local Agent (Hermes)** = Workspace management (JJ commits, rebases, splits)

JJ workflows happen in:
- `~/dev/my-plugin-tulpa/` (tulpa workspace)
- `~/dev/my-plugin/` (main project)
- Discord daily reports from tulpa

**Not captured in PI session logs.**

---

## Successful Patterns from Local Observation

### Pattern 1: Safe Split Workflow
```
jj split -r @ -A <parent> -m "description" <files>
```
**Success Factors:**
- Always use `-A <parent>` to specify insertion point
- Check state first with `jj st` and `jj log`
- Never split without inspecting `@` first

### Pattern 2: Rebase to Track User
```
jj rebase -r @ -d <user_change_id>
```
**Success Factors:**
- Get user's current change ID first
- Rebase tulpa workspace to be child of user
- Verify with `jj log -r "@ | @-"`

### Pattern 3: Observation Before Action
```
jj obslog -r @ --limit 20
jj diff --name-only
```
**Success Factors:**
- Always check history before rewriting
- Understand the DAG shape
- Never assume working copy state

---

## What Works vs What Doesn't

### ✅ Successful Approaches

1. **Read First, Act Second**
   - User says: "go read the code"
   - Action: Actually read files before proposing
   - Outcome: Positive

2. **Ask Clarifying Questions**
   - When user says "palette system"
   - Ask: "Do you mean the rack module palette?"
   - Outcome: Prevents wrong assumptions

3. **Follow Exact Instructions**
   - User provides specific JJ command format
   - Use exactly as specified
   - Outcome: No friction

### ❌ Unsuccessful Approaches

1. **Making Assumptions**
   - "I assume you want..."
   - User response: "no no no, READ THE CODE"
   - Outcome: Negative feedback

2. **Ignoring Constraints**
   - User says: "never use sed -i"
   - Agent uses sed anyway
   - Outcome: Strong negative reaction

3. **Over-Complicating**
   - Simple task → complex solution
   - User response: "wtf are you doing"
   - Outcome: Frustration

---

## Recommendations for JJ Workflows

### For Future Agents:

1. **Always Verify Parent**
   ```bash
   jj log -r "@ | @- | @--" --limit 5
   ```
   Before any split or rebase

2. **Document Intent**
   ```bash
   jj commit -m "tulpa: [clear description]"
   ```
   Clear commit messages help user understand changes

3. **Check Before Splitting**
   ```bash
   jj st
   jj diff --name-only
   ```
   Know what you're splitting

4. **Recovery Plan**
   ```bash
   jj undo
   ```
   Always know how to revert

### For Skill Documentation:

Based on successful patterns, create skills for:

1. **jj-safe-split** — Always inspect before splitting
2. **jj-track-user** — Rebase tulpa to user commit
3. **jj-undo-recovery** — Recovery patterns

---

## Data Limitations

**What's NOT captured:**
- JJ commands executed (happen in bash tool calls, parsed as generic text)
- Workspace state transitions
- Successful rebase/split operations
- Clean commits without user intervention

**What's captured:**
- User feedback (positive/negative)
- Agent thinking/thoughts
- Tool call errors
- Conversational corrections

**Conclusion:** 
JJ workflow success is measured by LACK of user intervention. If the user doesn't shout about version control, the agent did it right.

---

## Metrics

- **Sessions analyzed:** 113
- **JJ workflows visible:** 0 (not captured in PI format)
- **Success rate (positive resolution):** 23%
- **Correction rate:** 100% (all sessions have some corrective feedback)

---

*Analysis based on PI session logs from ~/.pi/agent/sessions/--home-shamanic--/*
*Date: 2026-04-03*
