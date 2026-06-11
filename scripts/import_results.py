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


TASK_RANGE = set(range(0, 11))
SKIP_TASK_NUMBERS = {3}
TASK_FILE_RE = re.compile(r"^Task(?P<number>\d+)[_-]", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import public AgentArk leaderboard summaries.")
    parser.add_argument(
        "--results-dir",
        default="../agent-ark/tmp",
        help="Directory containing AgentArk JSONL result files.",
    )
    parser.add_argument(
        "--output",
        default="src/data/leaderboards.json",
        help="Output JSON path inside the hub repository.",
    )
    return parser.parse_args()


def task_number_from_file(path: Path) -> int | None:
    match = TASK_FILE_RE.match(path.name)
    return int(match.group("number")) if match else None


def stable_slug(task_id: str) -> str:
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", task_id)
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


def public_row(raw: dict, source_file: str, source_index: int, human_file: bool) -> dict | None:
    task_id = raw.get("actual_task_name") or raw.get("requested_task_name")
    seed = raw.get("actual_group_seed", raw.get("requested_group_seed"))
    score = raw.get("score_reward")
    if not task_id or seed is None or score is None:
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
        "source_file": source_file,
        "source_index": source_index,
    }


def collect_rows(results_dir: Path) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    skipped_by_task: dict[int, dict] = {}
    for path in sorted(results_dir.glob("*.jsonl")):
        task_number = task_number_from_file(path)
        if task_number is None or task_number not in TASK_RANGE:
            continue
        if task_number in SKIP_TASK_NUMBERS:
            skipped_by_task[task_number] = {
                "task_id": f"Task{task_number}",
                "files": sorted(
                    item.name
                    for item in results_dir.glob(f"Task{task_number}*.jsonl")
                ),
                "reason": "Skipped for the first public import because model seed coverage is incomplete.",
            }
            continue
        human_file = "human" in path.stem.lower()
        for index, raw in enumerate(read_jsonl(path)):
            row = public_row(raw, path.name, index, human_file)
            if row:
                rows.append(row)
    return rows, list(skipped_by_task.values())


def dedupe_rows(rows: list[dict]) -> tuple[list[dict], list[str]]:
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
                f"({previous['source_file']} -> {row['source_file']})"
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
            human_seed_set = {row["seed"] for row in human_rows}
            if human_seed_set.issuperset(machine_seed_set):
                human_grouped: dict[tuple[str, str, str, bool], list[dict]] = defaultdict(list)
                for row in human_rows:
                    human_grouped[(row["provider"], row["model_name"], row["model"], True)].append(row)
                for group_rows in human_grouped.values():
                    model_summaries.append(aggregate_model(group_rows, task_seed_set=machine_seed_set))
            else:
                skipped.append(
                    {
                        "task_id": task_id,
                        "reason": "Human result was not published because its seed set does not cover model seeds.",
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
    match = re.match(r"Task(\d+)", task_id, re.IGNORECASE)
    return (int(match.group(1)) if match else 9999, task_id.lower())


def build_global_leaderboard(task_summaries: list[dict]) -> list[dict]:
    grouped: dict[tuple[str, str, str, bool], list[dict]] = defaultdict(list)
    for task in task_summaries:
        if task["status"] != "complete":
            continue
        for row in task["leaderboard"]:
            grouped[(row["provider"], row["model_name"], row["model"], row["is_human"])].append(row)

    results: list[dict] = []
    for (provider, model_name, model, is_human), rows in grouped.items():
        score_values = [row["score_mean"] for row in rows if row["score_mean"] is not None]
        success_values = [row["success_rate"] for row in rows if row["success_rate"] is not None]
        seed_total = sum(row["seed_count"] for row in rows)
        results.append(
            {
                "provider": provider,
                "model_name": model_name,
                "model": model,
                "score_mean": statistics.fmean(score_values) if score_values else None,
                "success_rate": statistics.fmean(success_values) if success_values else None,
                "task_count": len(rows),
                "seed_count": seed_total,
                "is_human": is_human,
            }
        )

    results.sort(
        key=lambda item: (
            item["score_mean"] if item["score_mean"] is not None else float("-inf"),
            item["task_count"],
            item["success_rate"] if item["success_rate"] is not None else float("-inf"),
        ),
        reverse=True,
    )
    return results


def main() -> int:
    args = parse_args()
    source_label = args.results_dir.replace("\\", "/")
    results_dir = Path(args.results_dir).resolve()
    output = Path(args.output)
    if not results_dir.exists():
        print(f"error: results directory does not exist: {results_dir}", file=sys.stderr)
        return 2

    rows, skipped = collect_rows(results_dir)
    rows, duplicate_warnings = dedupe_rows(rows)
    for warning in duplicate_warnings:
        print(f"warning: {warning}", file=sys.stderr)

    tasks = build_task_summaries(rows, skipped)
    payload = {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_dir": source_label,
        "policy": {
            "published_granularity": "aggregate-only",
            "score_field": "score_reward",
            "success_field": "rollout_success",
            "raw_jsonl_included": False,
        },
        "tasks": tasks,
        "global_leaderboard": build_global_leaderboard(tasks),
        "skipped_tasks": skipped,
        "warnings": duplicate_warnings,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {output} with {len(tasks)} task leaderboards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
