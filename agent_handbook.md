# Agent Debugging Handbook

Universal debugging methodology distilled from painful lessons.

---

## 1. Follow the Data, Not the Symptom

**Wrong:** "MIDI notes hang → add MIDI panic"

**Right:**
- `grep switchScript` showed Settings → Main triggered full reload
- Traced to tab host calling `switchUiScript` instead of `closeOverlay`
- The reload was the root cause, not the MIDI state

**Lesson:** The error is rarely where the symptom appears. Trace the execution flow with logs before writing code.

---

## 2. The Domain Expert is Always Right About Architecture

The user said: "Settings belongs to shell"

I fought it for an hour with technical patches (deferred panics, state restoration, z-order fixes).

The user was right. The fix was architectural — shell-owned panel, not project transition.

**Lesson:** When someone who knows the domain says "the design is wrong," believe them before trying to patch around it. Technical solutions cannot fix architectural mistakes.

---

## 3. State Machine Documentation > Code Reading

I kept getting lost in `LuaEngine.cpp` because I didn't map the states:
- What happens in `switchScript(isOverlay=true)` vs `switchScript(isOverlay=false)`?
- When does `baseProjectUiUpdate` get set? When does it get invalidated?
- What's the difference between `overlayStack` and `baseProject*` fields?

**Lesson:** Draw the state machine before debugging stateful code. If you can't draw it, you don't understand it.

---

## 4. Verify Your Assumptions Explicitly

I said "restarted" when gdb was still running. Wasted 20 minutes.

**Lesson:** Every claim needs verification:
```bash
ps aux | grep Manifold      # Is it running?
stat -c '%y' ./binary       # Is it the new build?
tmux capture-pane -p -t 0   # What's actually in the terminal?
```

Never assume the state of the system. Check it.

---

## 5. Breadth-First Patching is Debt

I tried:
1. Fix MIDI panic
2. Fix z-order
3. Fix widget ID
4. Fix globals
5. Fix close button

Each patch revealed another break. The foundation was rotten.

**Lesson:** If you're on your third "quick fix" for the same feature, stop. The foundation is wrong. Rebuild it correctly instead of layering patches.

---

## 6. Minimal Reproduction is Power

The user kept testing one flow:
- Settings button → Close → Back to Main

That's it. One flow, tested repeatedly. No feature creep, no "what about X?"

**Lesson:** Don't expand the test surface until the minimal case works. Complexity hides bugs.

---

## 7. When the User Swears, You're Missing Something Obvious

The escalation correlated with me missing architectural points:
- "Why recreate from scratch?" → I was ignoring existing working code
- "No fallbacks" → I was adding defensive code instead of failing loud
- "Settings belongs to shell" → I was treating system UI as user project

**Lesson:** Emotional escalation = missed fundamental. Stop coding and listen. The user is telling you the answer; you're just not hearing it.

---

## 8. Use Available Tools Ruthlessly

**Logs:** `grep -E 'pattern' /tmp/manifold_debug.log`
**Process state:** `ps aux | grep Manifold`
**GDB:** `gdb -batch -ex run -ex bt --args ./binary`
**IPC:** `echo 'cmd' | nc -U /tmp/socket.sock`
**Tmux:** `tmux capture-pane -p -t 0 | tail -50`

**Lesson:** Don't guess what happened. Instrument everything. The machine tells the truth.

---

## 9. Fail Loud, Fail Fast

I kept adding fallbacks:
- "If Settings path not found, try this other path..."
- "If close button not found, just continue..."

Wrong. If Settings isn't found, the system is broken. Tell the user. Stop.

**Lesson:** Defensive programming hides bugs. Fail loudly and fix the root cause.

---

## 10. Read the Code You Call

I assumed `ProjectLoader.Runtime` worked a certain way. It didn't. I had to read:
- How widget IDs get namespaced (`"root.close_btn"` not `"close_btn"`)
- How `Runtime:init()` builds the widget tree
- How the shell registers performance views

**Lesson:** Don't guess what a function does. Read it. Especially when debugging someone else's code.

---

## Summary

| Bad Habit | Good Practice |
|-----------|---------------|
| Patch the symptom | Trace the data flow |
| Ignore architectural feedback | Believe the domain expert |
| Read code linearly | Draw the state machine |
| Assume state | Verify explicitly |
| Layer patches | Rebuild foundations |
| Expand test scope | Minimal reproduction |
| Defensive fallbacks | Loud failures |
| Guess function behavior | Read the code |

**Final lesson:** The user is usually right. Your job is to understand why.
