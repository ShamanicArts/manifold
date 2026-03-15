#!/usr/bin/env python3
import argparse
import glob
import os
import socket
import sys
import time
from typing import Optional


def list_candidate_sockets() -> list[str]:
    candidates = [path for path in glob.glob('/tmp/manifold_*.sock') if os.path.exists(path)]
    candidates.sort(key=lambda path: os.path.getmtime(path), reverse=True)
    return candidates


def find_latest_socket() -> Optional[str]:
    candidates = list_candidate_sockets()
    return candidates[0] if candidates else None


def send_command(sock_path: str, command: str) -> str:
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        client.connect(sock_path)
        client.sendall((command.rstrip('\n') + '\n').encode('utf-8'))
        chunks = []
        while True:
            data = client.recv(4096)
            if not data:
                break
            chunks.append(data)
            if b'\n' in data:
                break
        return b''.join(chunks).decode('utf-8', errors='replace').strip()
    finally:
        client.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Send a single command to the running Manifold IPC socket.')
    parser.add_argument('command', nargs='+', help='Command tokens to send, e.g. UIRENDERER imgui-replace')
    parser.add_argument('--socket', dest='socket_path', help='Explicit socket path. Defaults to newest /tmp/manifold_*.sock')
    parser.add_argument('--print-socket', action='store_true', help='Print the resolved socket path to stderr')
    parser.add_argument('--retries', type=int, default=20, help='Connection retry attempts when the socket exists but is not ready yet')
    parser.add_argument('--retry-delay', type=float, default=0.1, help='Seconds to wait between retries')
    args = parser.parse_args()

    command = ' '.join(args.command)

    if args.socket_path:
        candidates = [args.socket_path]
    else:
        candidates = list_candidate_sockets()

    if not candidates:
        print('error: no manifold socket found under /tmp/manifold_*.sock', file=sys.stderr)
        sys.exit(1)

    last_error = None
    for attempt in range(max(1, args.retries)):
        for sock_path in candidates:
            try:
                if args.print_socket:
                    print(sock_path, file=sys.stderr)
                print(send_command(sock_path, command))
                sys.exit(0)
            except OSError as exc:
                last_error = (sock_path, exc)
                continue

        if attempt + 1 < max(1, args.retries):
            time.sleep(max(0.0, args.retry_delay))
            if not args.socket_path:
                candidates = list_candidate_sockets()

    assert last_error is not None
    sock_path, exc = last_error
    print(f'error: failed to send command to {sock_path}: {exc}', file=sys.stderr)
    sys.exit(1)
