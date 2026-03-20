#!/usr/bin/env python3
"""Small helpers for talking to Manifold via OSC UDP and OSCQuery HTTP.

This exists because hand-rolled OSC packet builders are easy to fuck up.
In particular, OSC strings MUST include a NUL terminator and then be padded
out to a 4-byte boundary.
"""

from __future__ import annotations

import json
import socket
import struct
import urllib.request
from dataclasses import dataclass
from typing import Any, Iterable


DEFAULT_OSC_HOST = "127.0.0.1"
DEFAULT_OSC_PORT = 9000
DEFAULT_QUERY_BASE = "http://127.0.0.1:9001"


@dataclass(frozen=True)
class OscEndpoint:
    path: str
    type_tag: str | None
    access: int | None
    min_value: float | int | None
    max_value: float | int | None
    description: str

    @property
    def readable(self) -> bool:
        return self.access in (1, 3)

    @property
    def writable(self) -> bool:
        return self.access in (2, 3)


def osc_string(value: str) -> bytes:
    data = value.encode("utf-8") + b"\x00"
    while len(data) % 4 != 0:
        data += b"\x00"
    return data


def build_osc_message(address: str, args: Iterable[tuple[str, Any]]) -> bytes:
    encoded = bytearray()
    encoded += osc_string(address)
    encoded += osc_string("," + "".join(type_tag for type_tag, _ in args))

    for type_tag, value in args:
        if type_tag == "f":
            encoded += struct.pack(">f", float(value))
        elif type_tag == "i":
            encoded += struct.pack(">i", int(value))
        elif type_tag == "s":
            encoded += osc_string(str(value))
        else:
            raise ValueError(f"unsupported OSC arg type: {type_tag}")

    return bytes(encoded)


def send_osc(address: str, *args: tuple[str, Any], host: str = DEFAULT_OSC_HOST, port: int = DEFAULT_OSC_PORT) -> None:
    message = build_osc_message(address, args)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.sendto(message, (host, port))
    finally:
        sock.close()


def send_float(address: str, value: float, host: str = DEFAULT_OSC_HOST, port: int = DEFAULT_OSC_PORT) -> None:
    send_osc(address, ("f", value), host=host, port=port)


def send_int(address: str, value: int, host: str = DEFAULT_OSC_HOST, port: int = DEFAULT_OSC_PORT) -> None:
    send_osc(address, ("i", value), host=host, port=port)


def send_string(address: str, value: str, host: str = DEFAULT_OSC_HOST, port: int = DEFAULT_OSC_PORT) -> None:
    send_osc(address, ("s", value), host=host, port=port)


def http_get_json(url: str) -> Any:
    with urllib.request.urlopen(url) as response:
        return json.loads(response.read().decode("utf-8"))


def oscquery_get_value(path: str, base_url: str = DEFAULT_QUERY_BASE) -> Any:
    payload = http_get_json(base_url.rstrip("/") + path)
    return payload.get("VALUE")


def oscquery_tree(base_url: str = DEFAULT_QUERY_BASE) -> dict[str, Any]:
    return http_get_json(base_url.rstrip("/") + "/")


def flatten_oscquery_tree(tree: dict[str, Any]) -> list[OscEndpoint]:
    endpoints: list[OscEndpoint] = []

    def walk(node: dict[str, Any]) -> None:
        full_path = node.get("FULL_PATH")
        if full_path and "TYPE" in node:
            range_block = None
            ranges = node.get("RANGE") or []
            if ranges:
                range_block = ranges[0]
            endpoints.append(
                OscEndpoint(
                    path=full_path,
                    type_tag=node.get("TYPE"),
                    access=node.get("ACCESS"),
                    min_value=None if range_block is None else range_block.get("MIN"),
                    max_value=None if range_block is None else range_block.get("MAX"),
                    description=node.get("DESCRIPTION") or "",
                )
            )

        for child in (node.get("CONTENTS") or {}).values():
            walk(child)

    walk(tree)
    endpoints.sort(key=lambda endpoint: endpoint.path)
    return endpoints
