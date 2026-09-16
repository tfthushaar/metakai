"""Builds the bundled exercise library from yuhonas/free-exercise-db (Unlicense)."""
import json
import sys
import urllib.request
from pathlib import Path

SHA = sys.argv[1] if len(sys.argv) > 1 else "a859101d633a01c4a1a920d6a8ce41dabba0705f"
URL = f"https://raw.githubusercontent.com/yuhonas/free-exercise-db/{SHA}/dist/exercises.json"
OUT = Path(__file__).resolve().parent.parent / "app" / "src" / "modules" / "workouts" / "data" / "exercises.json"

EQUIPMENT = {
    "barbell": "barbell", "dumbbell": "dumbbell", "body only": "bodyweight", "cable": "cable",
    "machine": "machine", "kettlebells": "kettlebell", "bands": "band", "medicine ball": "medicine_ball",
    "exercise ball": "exercise_ball", "foam roll": "foam_roll", "e-z curl bar": "ez_bar", "other": "other", None: "other",
}

def main():
    data = json.load(urllib.request.urlopen(URL))
    out = []
    for x in data:
        out.append({
            "id": x["id"],
            "n": x["name"].strip(),
            "p": x["primaryMuscles"],
            "s": x["secondaryMuscles"],
            "e": EQUIPMENT.get(x.get("equipment"), "other"),
            "c": x["category"],
            "m": x.get("mechanic") or "",
            "l": x["level"],
            "i": x["instructions"],
            "img": len(x.get("images", [])),
        })
    out.sort(key=lambda e: e["n"].lower())
    OUT.write_text(json.dumps({"sha": SHA, "exercises": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"wrote {len(out)} exercises to {OUT} ({OUT.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    main()
