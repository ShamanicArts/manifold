#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import struct
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
RIFF_SIGNATURE = b"RIFF"
MGRAPHICS_MARKER = b"mgraphics.init()"


def find_all(data: bytes, needle: bytes) -> list[int]:
    positions: list[int] = []
    start = 0
    while True:
        idx = data.find(needle, start)
        if idx == -1:
            return positions
        positions.append(idx)
        start = idx + 1


def slugify(value: str, fallback: str = "resource") -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip()).strip("_").lower()
    return slug or fallback


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def json_dump(path: Path, payload: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, indent=2, sort_keys=False, ensure_ascii=False) + "\n")


def text_dump(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    path.write_text(text)


def read_bytes(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except OSError as exc:
        raise SystemExit(f"failed to read {path}: {exc}") from exc


class AmxdParseError(RuntimeError):
    pass


def find_balanced_json_region(data: bytes) -> tuple[int, int]:
    start = data.find(b"{")
    if start == -1:
        raise AmxdParseError("could not find JSON start")

    depth = 0
    in_string = False
    escaped = False
    end = -1

    for index in range(start, len(data)):
        char = data[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == 0x5C:  # \\
                escaped = True
            elif char == 0x22:  # "
                in_string = False
            continue

        if char == 0x22:  # "
            in_string = True
        elif char == 0x7B:  # {
            depth += 1
        elif char == 0x7D:  # }
            depth -= 1
            if depth == 0:
                end = index + 1
                break

    if end == -1:
        raise AmxdParseError("could not find balanced JSON end")

    return start, end


class AmxdArchive:
    def __init__(self, path: str | os.PathLike[str]):
        self.path = Path(path)
        self.data = read_bytes(self.path)
        self.json_start, self.json_end = find_balanced_json_region(self.data)
        try:
            self.document = json.loads(self.data[self.json_start:self.json_end])
        except json.JSONDecodeError as exc:
            raise AmxdParseError(f"failed to decode embedded JSON: {exc}") from exc

        if not isinstance(self.document, dict) or "patcher" not in self.document:
            raise AmxdParseError("embedded JSON does not contain a top-level 'patcher'")

        self.root = self.document["patcher"]

    def json_region(self) -> dict[str, Any]:
        return {
            "start": self.json_start,
            "end": self.json_end,
            "length": self.json_end - self.json_start,
            "trailing_bytes": len(self.data) - self.json_end,
        }

    def _walk_patcher(self, patcher: dict[str, Any], patcher_path: str = "root") -> Iterable[dict[str, Any]]:
        yield {
            "path": patcher_path,
            "boxes": len(patcher.get("boxes", [])),
            "lines": len(patcher.get("lines", [])),
            "patcher": patcher,
        }

        for index, entry in enumerate(patcher.get("boxes", [])):
            box = entry.get("box", {})
            subpatcher = box.get("patcher")
            if not isinstance(subpatcher, dict):
                continue
            label = box.get("text") or box.get("varname") or box.get("maxclass") or f"box{index}"
            child_path = f"{patcher_path}/{box.get('id') or f'box{index}'}:{label}"
            yield from self._walk_patcher(subpatcher, child_path)

    def patchers(self) -> list[dict[str, Any]]:
        return list(self._walk_patcher(self.root))

    def _walk_boxes(self, patcher: dict[str, Any], patcher_path: str = "root") -> Iterable[dict[str, Any]]:
        for index, entry in enumerate(patcher.get("boxes", [])):
            box = entry.get("box", {})
            label = box.get("text") or box.get("varname") or box.get("maxclass") or f"box{index}"
            box_path = f"{patcher_path}/{box.get('id') or f'box{index}'}:{label}"
            yield {
                "patcher_path": patcher_path,
                "box_path": box_path,
                "index": index,
                "box": box,
            }
            subpatcher = box.get("patcher")
            if isinstance(subpatcher, dict):
                yield from self._walk_boxes(subpatcher, box_path)

    def boxes(self) -> list[dict[str, Any]]:
        return list(self._walk_boxes(self.root))

    def class_counts(self) -> Counter:
        counts: Counter[str] = Counter()
        for record in self.boxes():
            counts[str(record["box"].get("maxclass") or "")] += 1
        return counts

    def newobj_type_counts(self) -> Counter:
        counts: Counter[str] = Counter()
        for record in self.boxes():
            box = record["box"]
            if box.get("maxclass") != "newobj":
                continue
            text = str(box.get("text") or "")
            name = text.split()[0] if text else ""
            counts[name] += 1
        return counts

    def summary(self) -> dict[str, Any]:
        patchers = self.patchers()
        box_records = self.boxes()
        class_counts = self.class_counts()
        newobj_counts = self.newobj_type_counts()
        resources = self.resource_catalog()
        root_param_boxes = self.parameter_boxes(root_only=True, visible_only=False)
        root_visible_param_boxes = self.parameter_boxes(root_only=True, visible_only=True)
        pattr_targets = self.pattr_target_summary()

        return {
            "source": str(self.path),
            "json_region": self.json_region(),
            "patcher_count": len(patchers),
            "total_box_refs": len(box_records),
            "class_counts": dict(class_counts.most_common()),
            "unique_newobj_types": len(newobj_counts),
            "top_newobj_types": newobj_counts.most_common(120),
            "exact_pattr_count": pattr_targets["exact_pattr_count"],
            "unique_pattr_leaf_targets": pattr_targets["unique_leaf_count"],
            "root_parameter_enabled_count": len(root_param_boxes),
            "root_visible_parameter_enabled_count": len(root_visible_param_boxes),
            "root_hidden_parameter_enabled_count": len(root_param_boxes) - len(root_visible_param_boxes),
            "resource_counts": {
                "wav": len(resources["riff_waves"]),
                "png": len(resources["png_images"]),
                "embedded_scripts": len(resources["script_blobs"]),
                "dependency_cache_entries": len(resources["dependency_cache"]),
            },
        }

    def parameter_boxes(self, root_only: bool, visible_only: bool) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for record in self.boxes():
            if root_only and record["patcher_path"] != "root":
                continue
            box = record["box"]
            if box.get("parameter_enable") != 1:
                continue

            valueof = box.get("saved_attribute_attributes", {}).get("valueof", {})
            invisible = int(valueof.get("parameter_invisible", 0) or 0)
            if visible_only and invisible:
                continue

            out.append({
                "patcher_path": record["patcher_path"],
                "box_path": record["box_path"],
                "id": box.get("id"),
                "maxclass": box.get("maxclass"),
                "text": box.get("text"),
                "varname": box.get("varname"),
                "patching_rect": box.get("patching_rect"),
                "visible": invisible == 0,
                "parameter_longname": valueof.get("parameter_longname"),
                "parameter_shortname": valueof.get("parameter_shortname"),
                "parameter_type": valueof.get("parameter_type"),
                "parameter_mmin": valueof.get("parameter_mmin"),
                "parameter_mmax": valueof.get("parameter_mmax"),
                "parameter_enum": valueof.get("parameter_enum"),
                "parameter_info": valueof.get("parameter_info"),
                "parameter_unitstyle": valueof.get("parameter_unitstyle"),
            })
        return out

    def pattr_target_summary(self) -> dict[str, Any]:
        pattr_boxes: list[dict[str, Any]] = []
        leaf_counts: Counter[str] = Counter()
        pattern = re.compile(r"@bindto\s+([^\s]+)")

        for record in self.boxes():
            box = record["box"]
            if box.get("maxclass") != "newobj":
                continue
            text = str(box.get("text") or "")
            parts = text.split()
            if not parts or parts[0] != "pattr":
                continue

            bindto = None
            match = pattern.search(text)
            if match:
                bindto = match.group(1)
                leaf = bindto.split("::")[-1]
                leaf_counts[leaf] += 1
            else:
                leaf = None

            pattr_boxes.append({
                "patcher_path": record["patcher_path"],
                "box_path": record["box_path"],
                "id": box.get("id"),
                "text": text,
                "varname": box.get("varname"),
                "bindto": bindto,
                "leaf_target": leaf,
            })

        return {
            "exact_pattr_count": len(pattr_boxes),
            "unique_leaf_count": len(leaf_counts),
            "leaf_counts": leaf_counts.most_common(200),
            "pattr_boxes": pattr_boxes,
        }

    def project_media_names(self) -> list[str]:
        media = self.root.get("project", {}).get("contents", {}).get("media", {})
        if not isinstance(media, dict):
            return []
        return list(media.keys())

    def dependency_cache_summary(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for entry in self.root.get("dependency_cache", []):
            if not isinstance(entry, dict):
                continue
            out.append({
                "name": entry.get("name"),
                "type": entry.get("type"),
                "bootpath": entry.get("bootpath"),
                "patcherrelativepath": entry.get("patcherrelativepath"),
                "implicit": entry.get("implicit"),
            })
        return out

    def riff_waves(self) -> list[dict[str, Any]]:
        resources: list[dict[str, Any]] = []
        media_names = self.project_media_names()
        positions = find_all(self.data, RIFF_SIGNATURE)

        for index, offset in enumerate(positions):
            if offset + 12 > len(self.data):
                continue
            size = struct.unpack_from("<I", self.data, offset + 4)[0]
            if offset + 8 + size > len(self.data):
                continue
            if self.data[offset + 8:offset + 12] != b"WAVE":
                continue

            end = offset + 8 + size
            cursor = offset + 12
            fmt = None
            data_chunk_size = None
            while cursor + 8 <= end:
                chunk_id = self.data[cursor:cursor + 4]
                chunk_size = struct.unpack_from("<I", self.data, cursor + 4)[0]
                chunk_data = cursor + 8
                if chunk_data + chunk_size > len(self.data):
                    break
                if chunk_id == b"fmt " and chunk_size >= 16:
                    fmt = struct.unpack_from("<HHIIHH", self.data, chunk_data)
                elif chunk_id == b"data":
                    data_chunk_size = chunk_size
                cursor = chunk_data + chunk_size + (chunk_size % 2)

            duration_seconds = None
            fmt_summary = None
            if fmt is not None:
                audio_format, channels, sample_rate, byte_rate, block_align, bits_per_sample = fmt
                fmt_summary = {
                    "audio_format": audio_format,
                    "channels": channels,
                    "sample_rate": sample_rate,
                    "byte_rate": byte_rate,
                    "block_align": block_align,
                    "bits_per_sample": bits_per_sample,
                }
                if data_chunk_size and block_align and sample_rate:
                    duration_seconds = data_chunk_size / float(sample_rate * block_align)

            suggested_name = media_names[index] if index < len(media_names) else f"wave_{index:02d}.wav"
            resources.append({
                "index": index,
                "offset": offset,
                "end": end,
                "size": end - offset,
                "suggested_name": suggested_name,
                "fmt": fmt_summary,
                "data_chunk_size": data_chunk_size,
                "duration_seconds": duration_seconds,
            })
        return resources

    def png_images(self) -> list[dict[str, Any]]:
        resources: list[dict[str, Any]] = []
        dependency_png_names = [entry["name"] for entry in self.dependency_cache_summary() if str(entry.get("type") or "").upper() == "PNG"]
        positions = find_all(self.data, PNG_SIGNATURE)
        for index, offset in enumerate(positions):
            if offset + 24 > len(self.data):
                continue
            ihdr_length = struct.unpack_from(">I", self.data, offset + 8)[0]
            chunk_type = self.data[offset + 12:offset + 16]
            width = None
            height = None
            if chunk_type == b"IHDR" and ihdr_length >= 8:
                width, height = struct.unpack_from(">II", self.data, offset + 16)
            suggested_name = dependency_png_names[index] if index < len(dependency_png_names) else f"image_{index:02d}.png"
            resources.append({
                "index": index,
                "offset": offset,
                "suggested_name": suggested_name,
                "width": width,
                "height": height,
            })
        return resources

    def script_blobs(self) -> list[dict[str, Any]]:
        init_positions = find_all(self.data, MGRAPHICS_MARKER)
        binary_boundaries = sorted(find_all(self.data, PNG_SIGNATURE) + find_all(self.data, RIFF_SIGNATURE))
        scripts: list[dict[str, Any]] = []
        seen_spans: set[tuple[int, int]] = set()

        for script_index, init_pos in enumerate(init_positions):
            start = self.data.rfind(b"/*", max(0, init_pos - 8192), init_pos)
            if start == -1:
                start = init_pos

            candidates = [boundary for boundary in init_positions if boundary > init_pos]
            candidates.extend(boundary for boundary in binary_boundaries if boundary > init_pos)
            end = min(candidates) if candidates else len(self.data)
            span = (start, end)
            if span in seen_spans:
                continue
            seen_spans.add(span)

            raw = self.data[start:end]
            text = raw.decode("utf-8", errors="ignore").strip("\x00\r\n ")
            if "mgraphics.init" not in text:
                continue

            comment_match = re.search(r"/\*\s*(.*?)\*/", text, re.S)
            header = None
            if comment_match:
                lines = [line.strip(" *\t") for line in comment_match.group(1).splitlines() if line.strip(" *\t")]
                header = lines[0] if lines else None
            function_names = re.findall(r"function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", text)
            filename_match = re.search(r"([A-Za-z0-9 _.-]+\.js)", header or "")
            if filename_match:
                suggested_name = filename_match.group(1)
            else:
                stem = slugify(header or (function_names[0] if function_names else f"script_{script_index:02d}"), fallback=f"script_{script_index:02d}")
                suggested_name = f"{stem}.js"

            scripts.append({
                "index": script_index,
                "offset": start,
                "end": end,
                "size": end - start,
                "suggested_name": suggested_name,
                "header": header,
                "functions": function_names,
                "preview": "\n".join(text.splitlines()[:20]),
                "text": text,
            })
        return scripts

    def jsui_boxes(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for record in self.boxes():
            box = record["box"]
            if box.get("maxclass") != "jsui":
                continue
            out.append({
                "patcher_path": record["patcher_path"],
                "box_path": record["box_path"],
                "id": box.get("id"),
                "varname": box.get("varname"),
                "filename": box.get("filename"),
                "patching_rect": box.get("patching_rect"),
                "numinlets": box.get("numinlets"),
                "numoutlets": box.get("numoutlets"),
            })
        return out

    def root_boxes(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for entry in self.root.get("boxes", []):
            box = entry.get("box", {})
            out.append({
                "id": box.get("id"),
                "maxclass": box.get("maxclass"),
                "text": box.get("text"),
                "varname": box.get("varname"),
                "patching_rect": box.get("patching_rect"),
                "parameter_enable": box.get("parameter_enable"),
                "has_subpatcher": isinstance(box.get("patcher"), dict),
            })
        return out

    def patcher_tree_text(self) -> str:
        lines: list[str] = []
        for patcher_record in self.patchers():
            patcher = patcher_record["patcher"]
            path = patcher_record["path"]
            depth = path.count("/")
            class_counts: Counter[str] = Counter()
            newobj_counts: Counter[str] = Counter()
            for entry in patcher.get("boxes", []):
                box = entry.get("box", {})
                maxclass = str(box.get("maxclass") or "")
                class_counts[maxclass] += 1
                if maxclass == "newobj":
                    text = str(box.get("text") or "")
                    newobj_counts[text.split()[0] if text else ""] += 1
            top_newobj = ", ".join(f"{name}:{count}" for name, count in newobj_counts.most_common(10))
            lines.append(
                f"{'  ' * depth}- {path}: boxes={patcher_record['boxes']} lines={patcher_record['lines']} top_newobj=[{top_newobj}]"
            )
        return "\n".join(lines) + "\n"

    def search(self, query: str, field: str, include_comments: bool) -> list[dict[str, Any]]:
        needle = query.lower()
        out: list[dict[str, Any]] = []
        for record in self.boxes():
            box = record["box"]
            maxclass = str(box.get("maxclass") or "")
            if not include_comments and maxclass == "comment":
                continue
            haystacks: list[tuple[str, str]] = []
            if field in ("all", "text"):
                haystacks.append(("text", str(box.get("text") or "")))
            if field in ("all", "maxclass"):
                haystacks.append(("maxclass", maxclass))
            if field in ("all", "varname"):
                haystacks.append(("varname", str(box.get("varname") or "")))
            matched_fields = [name for name, value in haystacks if needle in value.lower()]
            if not matched_fields:
                continue
            out.append({
                "patcher_path": record["patcher_path"],
                "box_path": record["box_path"],
                "id": box.get("id"),
                "maxclass": maxclass,
                "text": box.get("text"),
                "varname": box.get("varname"),
                "matched_fields": matched_fields,
            })
        return out

    def find_boxes_by_id(self, box_id: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for record in self.boxes():
            box = record["box"]
            if str(box.get("id")) != box_id:
                continue
            payload = dict(box)
            payload["patcher_path"] = record["patcher_path"]
            payload["box_path"] = record["box_path"]
            out.append(payload)
        return out

    def resource_catalog(self) -> dict[str, Any]:
        script_blobs = self.script_blobs()
        script_summaries = [
            {
                "index": entry["index"],
                "offset": entry["offset"],
                "end": entry["end"],
                "size": entry["size"],
                "suggested_name": entry["suggested_name"],
                "header": entry["header"],
                "functions": entry["functions"],
            }
            for entry in script_blobs
        ]
        return {
            "json_region": self.json_region(),
            "dependency_cache": self.dependency_cache_summary(),
            "project_media_names": self.project_media_names(),
            "riff_waves": self.riff_waves(),
            "png_images": self.png_images(),
            "script_blobs": script_summaries,
        }

    def extract_assets(
        self,
        outdir: Path,
        include_json: bool,
        include_media: bool,
        include_images: bool,
        include_scripts: bool,
    ) -> dict[str, list[str]]:
        written: dict[str, list[str]] = {"json": [], "media": [], "images": [], "scripts": []}
        ensure_dir(outdir)

        if include_json:
            target = outdir / "patcher.json"
            target.write_bytes(self.data[self.json_start:self.json_end])
            written["json"].append(str(target))

        if include_media:
            media_dir = outdir / "media"
            ensure_dir(media_dir)
            for entry in self.riff_waves():
                blob = self.data[entry["offset"]:entry["end"]]
                target = media_dir / entry["suggested_name"]
                target.write_bytes(blob)
                written["media"].append(str(target))

        if include_images:
            image_dir = outdir / "images"
            ensure_dir(image_dir)
            for entry in self.png_images():
                start = entry["offset"]
                next_candidates = [img["offset"] for img in self.png_images() if img["offset"] > start]
                next_candidates.extend(wav["offset"] for wav in self.riff_waves() if wav["offset"] > start)
                end = min(next_candidates) if next_candidates else len(self.data)
                blob = self.data[start:end]
                target = image_dir / entry["suggested_name"]
                target.write_bytes(blob)
                written["images"].append(str(target))

        if include_scripts:
            script_dir = outdir / "scripts"
            ensure_dir(script_dir)
            used_names: set[str] = set()
            for entry in self.script_blobs():
                base_name = entry["suggested_name"]
                stem = Path(base_name).stem
                suffix = Path(base_name).suffix or ".js"
                target_name = base_name
                counter = 2
                while target_name in used_names:
                    target_name = f"{stem}_{counter:02d}{suffix}"
                    counter += 1
                used_names.add(target_name)
                target = script_dir / target_name
                target.write_text(entry["text"])
                written["scripts"].append(str(target))

        return written


def print_json(payload: Any) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False))


def command_summary(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    print_json(archive.summary())
    return 0


def command_inventory(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    payload = {
        "class_counts": archive.class_counts().most_common(),
        "newobj_counts": archive.newobj_type_counts().most_common(args.limit_newobj),
    }
    print_json(payload)
    return 0


def command_params(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    payload = archive.parameter_boxes(root_only=not args.all_patchers, visible_only=args.visible_only)
    print_json(payload)
    return 0


def command_pattrs(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    payload = archive.pattr_target_summary()
    if not args.include_boxes:
        payload = {
            "exact_pattr_count": payload["exact_pattr_count"],
            "unique_leaf_count": payload["unique_leaf_count"],
            "leaf_counts": payload["leaf_counts"],
        }
    print_json(payload)
    return 0


def command_tree(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    print(archive.patcher_tree_text(), end="")
    return 0


def command_resources(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    print_json(archive.resource_catalog())
    return 0


def command_jsui(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    payload = {
        "boxes": archive.jsui_boxes(),
        "scripts": [
            {
                "index": entry["index"],
                "offset": entry["offset"],
                "end": entry["end"],
                "size": entry["size"],
                "suggested_name": entry["suggested_name"],
                "header": entry["header"],
                "functions": entry["functions"],
                "preview": entry["preview"],
            }
            for entry in archive.script_blobs()
        ],
    }
    print_json(payload)
    return 0


def command_search(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    print_json(archive.search(args.query, args.field, args.include_comments))
    return 0


def command_box(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    payload = archive.find_boxes_by_id(args.box_id)
    print_json(payload)
    return 0


def command_extract(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    outdir = Path(args.outdir)
    written = archive.extract_assets(
        outdir=outdir,
        include_json=args.json,
        include_media=args.media,
        include_images=args.images,
        include_scripts=args.scripts,
    )
    print_json({"outdir": str(outdir), "written": written})
    return 0


def command_report(args: argparse.Namespace) -> int:
    archive = AmxdArchive(args.amxd)
    outdir = Path(args.outdir)
    ensure_dir(outdir)

    summary = archive.summary()
    inventory = {
        "class_counts": archive.class_counts().most_common(),
        "newobj_counts": archive.newobj_type_counts().most_common(200),
    }
    root_params = archive.parameter_boxes(root_only=True, visible_only=False)
    root_visible_params = archive.parameter_boxes(root_only=True, visible_only=True)
    pattrs = archive.pattr_target_summary()
    resources = archive.resource_catalog()
    jsui = {
        "boxes": archive.jsui_boxes(),
        "scripts": [
            {
                "index": entry["index"],
                "offset": entry["offset"],
                "end": entry["end"],
                "size": entry["size"],
                "suggested_name": entry["suggested_name"],
                "header": entry["header"],
                "functions": entry["functions"],
            }
            for entry in archive.script_blobs()
        ],
    }

    json_dump(outdir / "summary.json", summary)
    json_dump(outdir / "inventory.json", inventory)
    json_dump(outdir / "root_parameter_enabled.json", root_params)
    json_dump(outdir / "root_visible_parameter_enabled.json", root_visible_params)
    json_dump(outdir / "pattr_targets.json", {
        "exact_pattr_count": pattrs["exact_pattr_count"],
        "unique_leaf_count": pattrs["unique_leaf_count"],
        "leaf_counts": pattrs["leaf_counts"],
    })
    json_dump(outdir / "resources.json", resources)
    json_dump(outdir / "jsui_report.json", jsui)
    json_dump(outdir / "root_boxes.json", archive.root_boxes())
    text_dump(outdir / "patcher_tree.txt", archive.patcher_tree_text())

    if args.include_extract:
        extracted_dir = outdir / "extracted"
        extracted = archive.extract_assets(
            outdir=extracted_dir,
            include_json=True,
            include_media=args.extract_media,
            include_images=True,
            include_scripts=True,
        )
        json_dump(outdir / "extract_manifest.json", extracted)

    print_json({
        "report_dir": str(outdir),
        "files": sorted(str(path.relative_to(outdir)) for path in outdir.rglob("*") if path.is_file()),
    })
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="AMXD inspection toolbox for reverse-engineering Max for Live devices.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    summary = subparsers.add_parser("summary", help="Print a high-level summary for an AMXD.")
    summary.add_argument("amxd", help="Path to the .amxd file")
    summary.set_defaults(func=command_summary)

    inventory = subparsers.add_parser("inventory", help="Print recursive class/newobj inventories.")
    inventory.add_argument("amxd", help="Path to the .amxd file")
    inventory.add_argument("--limit-newobj", type=int, default=120, help="Max newobj rows to print")
    inventory.set_defaults(func=command_inventory)

    params = subparsers.add_parser("params", help="Print parameter-enabled UI boxes.")
    params.add_argument("amxd", help="Path to the .amxd file")
    params.add_argument("--all-patchers", action="store_true", help="Include parameter-enabled boxes from subpatchers")
    params.add_argument("--visible-only", action="store_true", help="Exclude parameter_invisible boxes")
    params.set_defaults(func=command_params)

    pattrs = subparsers.add_parser("pattrs", help="Print pattr target summaries.")
    pattrs.add_argument("amxd", help="Path to the .amxd file")
    pattrs.add_argument("--include-boxes", action="store_true", help="Include every pattr box record")
    pattrs.set_defaults(func=command_pattrs)

    tree = subparsers.add_parser("tree", help="Print the recursive patcher tree.")
    tree.add_argument("amxd", help="Path to the .amxd file")
    tree.set_defaults(func=command_tree)

    resources = subparsers.add_parser("resources", help="Print the resource catalog.")
    resources.add_argument("amxd", help="Path to the .amxd file")
    resources.set_defaults(func=command_resources)

    jsui = subparsers.add_parser("jsui", help="Print jsui box info and embedded script summaries.")
    jsui.add_argument("amxd", help="Path to the .amxd file")
    jsui.set_defaults(func=command_jsui)

    search = subparsers.add_parser("search", help="Search boxes by text, maxclass, or varname.")
    search.add_argument("amxd", help="Path to the .amxd file")
    search.add_argument("query", help="Case-insensitive substring to search for")
    search.add_argument("--field", choices=["all", "text", "maxclass", "varname"], default="all")
    search.add_argument("--include-comments", action="store_true", help="Include comment boxes in results")
    search.set_defaults(func=command_search)

    box = subparsers.add_parser("box", help="Print every box that matches a given box id.")
    box.add_argument("amxd", help="Path to the .amxd file")
    box.add_argument("box_id", help="Box id to search for, e.g. obj-143")
    box.set_defaults(func=command_box)

    extract = subparsers.add_parser("extract", help="Extract JSON and embedded resources from an AMXD.")
    extract.add_argument("amxd", help="Path to the .amxd file")
    extract.add_argument("outdir", help="Directory to write extracted assets into")
    extract.add_argument("--json", action="store_true", help="Extract the embedded patcher JSON")
    extract.add_argument("--media", action="store_true", help="Extract detected WAV assets")
    extract.add_argument("--images", action="store_true", help="Extract detected PNG assets")
    extract.add_argument("--scripts", action="store_true", help="Extract detected embedded JSUI scripts")
    extract.set_defaults(func=command_extract)

    report = subparsers.add_parser("report", help="Write a report bundle for an AMXD.")
    report.add_argument("amxd", help="Path to the .amxd file")
    report.add_argument("outdir", help="Directory to write the report bundle into")
    report.add_argument("--include-extract", action="store_true", help="Also extract patcher JSON/scripts/images into an extracted/ subdir")
    report.add_argument("--extract-media", action="store_true", help="When used with --include-extract, also extract WAV assets")
    report.set_defaults(func=command_report)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except AmxdParseError as exc:
        print(f"parse error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
