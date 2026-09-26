#!/usr/bin/env python3
"""Plot checkpoint 76 callback timing CSVs as a compact review figure."""
import csv
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts/reviews"
series = []
for runtime in ("native", "wasm"):
    with (OUT / f"checkpoint-76-{runtime}.csv").open(newline="") as file:
        rows = list(csv.DictReader(file))
    for mode, visited in (("selected-only", 1), ("persistent", 1), ("persistent", 2), ("persistent", 21)):
        values = [row for row in rows if row["mode"] == mode and int(row["visited"]) == visited]
        series.append((runtime, mode, visited,
                       median(float(row["median_us"]) for row in values),
                       median(float(row["p95_us"]) for row in values)))

fig, ax = plt.subplots(figsize=(10, 5.5))
fig.subplots_adjust(left=0.34, right=0.84, bottom=0.17, top=0.88)
fig.patch.set_facecolor("#14202b")
ax.set_facecolor("#14202b")
labels = [f"{runtime.title()} · {mode} · {visited} visited" for runtime, mode, visited, _, _ in series]
positions = list(reversed(range(len(series))))
for position, (_, _, _, typical, p95) in zip(positions, series):
    ax.barh(position, p95, color="#517878", height=0.7)
    ax.barh(position, typical, color="#a3d8be", height=0.7)
    ax.text(p95 + 3, position, f"{typical:.1f} / {p95:.1f} µs", va="center", color="#edf3ef", fontsize=9)
ax.set_yticks(positions, labels, color="#edf3ef")
ax.set_xlim(0, 275)
ax.tick_params(axis="x", colors="#adbfc2")
ax.tick_params(axis="y", length=0)
ax.set_xlabel("Callback time · µs (median / p95)", color="#edf3ef")
ax.set_title("FX slot routing · 128 frames at 48 kHz", color="#edf3ef", loc="left", pad=12)
for spine in ax.spines.values():
    spine.set_visible(False)
ax.grid(axis="x", color="#29404c", alpha=0.8)
ax.set_axisbelow(True)
fig.text(0.84, 0.045, "Full audio block: 2,667 µs · AMD Ryzen 9 3900X · local CLI runtimes", ha="right", color="#adbfc2", fontsize=8)
fig.savefig(OUT / "checkpoint-76-callback-budget.png", dpi=160)
