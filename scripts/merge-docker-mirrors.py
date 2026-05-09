#!/usr/bin/env python3
"""Merge registry mirrors into /etc/docker/daemon.json without wiping other keys.

Mirrors listed below are oriented toward mainland China Docker Hub acceleration.
Overseas hosts should skip calling this script (see deploy workflow DEPLOY_REGION).

Prints one line to stdout: 'restart' if file changed (caller should restart docker), else 'ok'.
"""

from __future__ import annotations

import json
import os
import sys

DAEMON_JSON = "/etc/docker/daemon.json"
DEFAULT_MIRRORS = [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://docker.rainbond.cc",
]


def main() -> int:
    data: dict = {}
    if os.path.exists(DAEMON_JSON):
        try:
            with open(DAEMON_JSON, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}

    reg = list(data.get("registry-mirrors") or [])
    for m in DEFAULT_MIRRORS:
        if m not in reg:
            reg.append(m)
    data["registry-mirrors"] = reg

    new_body = json.dumps(data, indent=2) + "\n"
    old_body = ""
    if os.path.exists(DAEMON_JSON):
        with open(DAEMON_JSON, encoding="utf-8") as f:
            old_body = f.read()

    if new_body != old_body:
        with open(DAEMON_JSON, "w", encoding="utf-8") as f:
            f.write(new_body)
        print("restart")
    else:
        print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
