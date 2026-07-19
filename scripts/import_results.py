#!/usr/bin/env python3
"""Import AgentArk JSONL evaluation summaries for the public hub.

This script intentionally publishes aggregate results only. It does not copy
prompts, model responses, images, usage, cost, API keys, or trajectory payloads.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path


TASKS = {
    "MarbleStop": {"id": 0, "aliases": ["Task0_marble", "Task0_PlayMarbles", "MarbleTask"]},
    "Snake": {"id": 1, "aliases": ["Task1_Snake", "Task1_snake", "SnakeTask"]},
    "Pushbox": {"id": 2, "aliases": ["Task2_Pushbox", "Task2_pushbox", "PushBox"]},
    "ObjectRotationMatch": {"id": 3, "aliases": ["Task3_ObjectRotationMatch", "ObjectRotationMatchTask"]},
    "ColorFovCount": {"id": 4, "aliases": ["Task4_ColorFovCount", "ColorFovCountTask"]},
    "DoorSpin3Turns": {"id": 5, "aliases": ["Task5_DoorSpin3Turns", "DoorSpin3TurnsTask"]},
    "GoldMiner2D": {"id": 6, "aliases": ["Task6_GoldMiner2D", "GoldMiner2DTask"]},
    "StickBridgeEstimate2D": {"id": 7, "aliases": ["Task7_StickBridgeEstimate2D", "StickBridgeEstimate2DTask"]},
    "ZigzagPillarJump3D": {"id": 8, "aliases": ["Task8_ZigzagPillarJump3D", "ZigzagPillarJump3DTask"]},
    "FishingJoy2D": {"id": 9, "aliases": ["Task9_FishingJoy2D", "FishingJoy2DTask"]},
    "AxleBoardAlignment3D": {"id": 10, "aliases": ["Task10_AxleBoardAlignment3D", "AxleBoardAlignment3DTask"]},
    "TightropeSprint3D": {"id": 11, "aliases": ["Task11_TightropeSprint3D", "TightropeSprint3DTask"]},
    "Tetris": {"id": 12, "aliases": ["Task12_Tetris"]},
    "TetrisHard": {"id": 13, "aliases": ["Task13_TetrisHard"]},
    "MirrorRelay2D": {"id": 14, "aliases": ["Task14_MirrorRelay2D", "MirrorRelay2DTask"]},
    "SpatialRelationMatch3D": {"id": 15, "aliases": ["Task15_SpatialRelationMatch3D", "SpatialRelationMatch3DTask"]},
    "SpatialRelationAxisOrder3D": {"id": 16, "aliases": ["Task16_SpatialRelationCopyTrue3D", "SpatialRelationCopyTrue3DTask"]},
    "CraneStackTower2D": {"id": 17, "aliases": ["Task17_CraneStackTower2D", "CraneStackTower2DTask"]},
    "GrenadeClusterCalibration3D": {"id": 18, "aliases": ["Task18_GrenadeClusterCalibration3D", "GrenadeClusterCalibration3DTask"]},
    "Match3ScoreGoal2D": {"id": 19, "aliases": ["Task19_Match3ScoreGoal2D"]},
    "Reach2048Tile2D": {"id": 20, "aliases": ["Task20_2048ReachTile2D", "Reach2048Tile2D", "Reach2048Tile"]},
    "StarterRouteJump3D": {"id": 21, "aliases": ["Task21_StarterRouteJump3D"]},
    "BlockWorldPathCopy3D": {"id": 22, "aliases": ["Task22_BlockWorldPathCopy3D", "BlockWorldPathCopy3DTask"]},
    "RotationSpeedSort3D": {"id": 23, "aliases": ["Task23_RotationSpeedSort3D", "RotationSpeedSort3DTask"]},
    "DelayTrain": {"id": 24, "aliases": ["Task24_DelayTrain"]},
    "GuiSettingsQuickSwitch": {"id": 25, "aliases": ["Task25_GuiSettingsQuickSwitch"]},
    "GuiNotesChecklistCleanup": {"id": 28, "aliases": ["Task28_GuiNotesChecklistCleanup"]},
    "GuiFilesMoveByRule": {"id": 29, "aliases": ["Task29_GuiFilesMoveByRule"]},
    "GuiMessageToCalendar": {"id": 33, "aliases": ["Task33_GuiMessageToCalendar"]},
    "GuiImageNoteTranscription": {"id": 36, "aliases": ["Task36_GuiImageNoteTranscription"]},
    "GuiMapPlaceToMessage": {"id": 37, "aliases": ["Task37_GuiMapPlaceToMessage"]},
    "GuiShoppingCartFromChat": {"id": 38, "aliases": ["Task38_GuiShoppingCartFromChat"]},
}
ALIAS_TO_TASK_ID = {
    alias: task_id
    for task_id, meta in TASKS.items()
    for alias in [task_id, *meta["aliases"]]
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import public AgentArk leaderboard summaries.")
    parser.add_argument(
        "--results-dir",
        default="../agent-ark/tmp/task_name_migrated",
        help="Directory containing AgentArk JSONL result files.",
    )
    parser.add_argument(
        "--output",
        default="src/data/leaderboards.json",
        help="Output JSON path inside the hub repository.",
    )
    return parser.parse_args()


def stable_slug(task_id: str) -> str:
    words = str(task_id)
    words = words.replace("2D", "2d").replace("3D", "3d")
    words = re.sub(r"([A-Za-z])([0-9])", r"\1-\2", words)
    words = re.sub(r"([0-9]+)([A-Z])", r"\1-\2", words)
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", words)
    words = words.replace("_", "-")
    words = re.sub(r"[^A-Za-z0-9-]+", "-", words)
    words = re.sub(r"-+", "-", words).strip("-")
    return words.lower()


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                rows.append(json.loads(stripped))
            except json.JSONDecodeError as exc:
                print(f"warning: skipped invalid JSON in {path.name}:{line_number}: {exc}", file=sys.stderr)
    return rows


def public_row(raw: dict, human_file: bool) -> dict | None:
    raw_task_id = raw.get("actual_task_name") or raw.get("requested_task_name")
    task_id = ALIAS_TO_TASK_ID.get(str(raw_task_id), str(raw_task_id))
    seed = raw.get("actual_group_seed", raw.get("requested_group_seed"))
    score = raw.get("score_reward")
    if not task_id or task_id not in TASKS or seed is None or score is None:
        return None
    provider = raw.get("provider") or ("human" if human_file else "unknown")
    model_name = raw.get("model_name") or raw.get("model") or provider
    model = raw.get("model") or model_name
    return {
        "task_id": str(task_id),
        "seed": int(seed),
        "provider": str(provider),
        "model_name": str(model_name),
        "model": str(model),
        "score": float(score),
        "success": bool(raw.get("rollout_success", False)),
        "human": bool(human_file or provider == "human" or model == "human"),
    }


def collect_rows(results_dir: Path) -> tuple[list[dict], dict[int, str], list[dict]]:
    rows: list[dict] = []
    provenance: dict[int, str] = {}
    for path in sorted(results_dir.glob("*.jsonl")):
        human_file = "human" in path.stem.lower()
        for index, raw in enumerate(read_jsonl(path)):
            row = public_row(raw, human_file)
            if row:
                provenance[id(row)] = f"{path.name}:{index + 1}"
                rows.append(row)
    return rows, provenance, []


def dedupe_rows(rows: list[dict], provenance: dict[int, str]) -> tuple[list[dict], list[str]]:
    deduped: dict[tuple[str, str, str, str, int], dict] = {}
    warnings: list[str] = []
    for row in rows:
        key = (
            row["task_id"],
            row["provider"],
            row["model_name"],
            row["model"],
            row["seed"],
        )
        if key in deduped:
            previous = deduped[key]
            warnings.append(
                "duplicate result kept last: "
                f"{row['task_id']} {row['model_name']} seed {row['seed']} "
                f"({provenance.get(id(previous), 'previous row')} -> {provenance.get(id(row), 'current row')})"
            )
        deduped[key] = row
    return list(deduped.values()), warnings


def aggregate_model(rows: list[dict], task_seed_set: set[int] | None = None) -> dict:
    if task_seed_set is not None:
        rows = [row for row in rows if row["seed"] in task_seed_set]
    scores = [row["score"] for row in rows]
    successes = [row["success"] for row in rows]
    seeds = sorted({row["seed"] for row in rows})
    sample = rows[0]
    return {
        "provider": sample["provider"],
        "model_name": sample["model_name"],
        "model": sample["model"],
        "score_mean": statistics.fmean(scores) if scores else None,
        "success_rate": statistics.fmean(1.0 if item else 0.0 for item in successes) if successes else None,
        "seed_count": len(seeds),
        "seeds": seeds,
        "is_human": sample["human"],
    }


def build_task_summaries(rows: list[dict], skipped: list[dict]) -> list[dict]:
    by_task: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_task[row["task_id"]].append(row)

    summaries: list[dict] = []
    for task_id, task_rows in sorted(by_task.items(), key=lambda item: natural_task_key(item[0])):
        machine_rows = [row for row in task_rows if not row["human"]]
        human_rows = [row for row in task_rows if row["human"]]
        machine_seed_set = {row["seed"] for row in machine_rows}

        grouped: dict[tuple[str, str, str, bool], list[dict]] = defaultdict(list)
        for row in machine_rows:
            grouped[(row["provider"], row["model_name"], row["model"], False)].append(row)

        model_summaries = [aggregate_model(group_rows) for group_rows in grouped.values()]

        if human_rows and machine_seed_set:
            human_grouped: dict[tuple[str, str, str, bool], list[dict]] = defaultdict(list)
            for row in human_rows:
                human_grouped[(row["provider"], row["model_name"], row["model"], True)].append(row)

            published_human = False
            required_seed_count = len(machine_seed_set)
            for group_rows in human_grouped.values():
                human_seed_count = len({row["seed"] for row in group_rows})
                if human_seed_count >= required_seed_count:
                    model_summaries.append(aggregate_model(group_rows))
                    published_human = True

            if not published_human:
                skipped.append(
                    {
                        "task_id": task_id,
                        "reason": "Human result was not published because its seed count is lower than model seed count.",
                    }
                )

        model_summaries.sort(
            key=lambda item: (
                item["score_mean"] if item["score_mean"] is not None else float("-inf"),
                item["success_rate"] if item["success_rate"] is not None else float("-inf"),
                -int(item["is_human"]),
            ),
            reverse=True,
        )

        summaries.append(
            {
                "task_id": task_id,
                "slug": stable_slug(task_id),
                "status": "complete" if model_summaries else "pending",
                "seeds": sorted(machine_seed_set),
                "model_count": len([item for item in model_summaries if not item["is_human"]]),
                "leaderboard": model_summaries,
            }
        )
    return summaries


def natural_task_key(task_id: str) -> tuple[int, str]:
    task_meta = TASKS.get(task_id, {})
    return (int(task_meta.get("id", 9999)), task_id.lower())


def build_global_leaderboard(task_summaries: list[dict]) -> list[dict]:
    grouped: dict[tuple[str, str, str, bool], list[dict]] = defaultdict(list)
    champion_counts: defaultdict[tuple[str, str, str, bool], int] = defaultdict(int)
    for task in task_summaries:
        if task["status"] != "complete":
            continue
        machine_rows = [
            row
            for row in task["leaderboard"]
            if not row["is_human"] and row["score_mean"] is not None
        ]
        if not machine_rows:
            continue

        best_score = max(row["score_mean"] for row in machine_rows)
        for row in machine_rows:
            key = (row["provider"], row["model_name"], row["model"], row["is_human"])
            grouped[key].append(row)
            if abs(row["score_mean"] - best_score) <= 1e-9:
                champion_counts[key] += 1

    results: list[dict] = []
    for (provider, model_name, model, is_human), rows in grouped.items():
        score_values = [row["score_mean"] for row in rows if row["score_mean"] is not None]
        success_values = [row["success_rate"] for row in rows if row["success_rate"] is not None]
        seed_total = sum(row["seed_count"] for row in rows)
        champion_count = champion_counts[(provider, model_name, model, is_human)]
        task_count = len(rows)
        results.append(
            {
                "provider": provider,
                "model_name": model_name,
                "model": model,
                "champion_count": champion_count,
                "champion_rate": champion_count / task_count if task_count else None,
                "score_mean": statistics.fmean(score_values) if score_values else None,
                "success_rate": statistics.fmean(success_values) if success_values else None,
                "task_count": task_count,
                "seed_count": seed_total,
                "is_human": is_human,
            }
        )

    results.sort(
        key=lambda item: (
            item["champion_rate"] if item["champion_rate"] is not None else float("-inf"),
            item["champion_count"],
            item["task_count"],
            item["success_rate"] if item["success_rate"] is not None else float("-inf"),
            item["score_mean"] if item["score_mean"] is not None else float("-inf"),
        ),
        reverse=True,
    )
    return results


def main() -> int:
    args = parse_args()
    results_dir = Path(args.results_dir).resolve()
    output = Path(args.output)
    if not results_dir.exists():
        print(f"error: results directory does not exist: {results_dir}", file=sys.stderr)
        return 2

    rows, provenance, skipped = collect_rows(results_dir)
    rows, duplicate_warnings = dedupe_rows(rows, provenance)
    for warning in duplicate_warnings:
        print(f"warning: {warning}", file=sys.stderr)

    tasks = build_task_summaries(rows, skipped)
    payload = {
        "schema_version": 2,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "tasks": tasks,
        "global_leaderboard": build_global_leaderboard(tasks),
        "skipped_tasks": skipped,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {output} with {len(tasks)} task leaderboards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
