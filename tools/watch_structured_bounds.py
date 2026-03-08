import glob
import os
import socket
import time


def latest_socket():
    paths = sorted(glob.glob("/tmp/manifold_*.sock"), key=os.path.getmtime)
    return paths[-1] if paths else None


def eval_lua(sock_path, script):
    sock = socket.socket(socket.AF_UNIX)
    sock.connect(sock_path)
    cmd = "EVAL " + script.replace("\n", "\\n") + "\n"
    sock.sendall(cmd.encode())
    data = sock.recv(262144).decode(errors="replace").strip()
    sock.close()
    return data


LUA_SCRIPT = r"""
local runtime = _G.__manifoldStructuredUiRuntime
if type(runtime) ~= "table" or type(runtime.layoutTree) ~= "table" then
  return "NO_RUNTIME"
end

local out = {}

local function visit(record, parentX, parentY)
  if type(record) ~= "table" then
    return
  end
  if runtime.isRecordActive and runtime:isRecordActive(record) ~= true then
    return
  end

  local widget = record.widget
  local node = widget and widget.node or nil
  if node == nil then
    return
  end

  local x, y, w, h = node:getBounds()
  local absX = (parentX or 0) + (x or 0)
  local absY = (parentY or 0) + (y or 0)
  local src = node.getUserData and node:getUserData("_structuredSource") or nil
  local inst = node.getUserData and node:getUserData("_structuredInstanceSource") or nil
  local id = (type(src) == "table" and src.globalId) or record.globalId or (type(record.spec) == "table" and record.spec.id) or "?"
  if type(inst) == "table" and type(inst.nodeId) == "string" and inst.nodeId ~= "" then
    id = id .. "@" .. inst.nodeId
  end

  out[#out + 1] = string.format("%s|%d|%d|%d|%d|%d|%d", id, x or 0, y or 0, w or 0, h or 0, absX, absY)

  for _, child in ipairs(record.children or {}) do
    visit(child, absX, absY)
  end
end

visit(runtime.layoutTree, 0, 0)
return table.concat(out, string.char(10))
"""


def main():
    print("watching active scene bounds; move widgets now", flush=True)
    previous = {}
    last_socket = None

    while True:
        sock_path = latest_socket()
        if not sock_path:
            if last_socket is not None:
                print("socket disappeared", flush=True)
                last_socket = None
                previous = {}
            time.sleep(0.2)
            continue

        if sock_path != last_socket:
            print(f"socket {sock_path}", flush=True)
            last_socket = sock_path
            previous = {}

        try:
            response = eval_lua(sock_path, LUA_SCRIPT)
        except Exception as exc:
            print(f"ipc error: {exc}", flush=True)
            time.sleep(0.2)
            continue

        if response == "OK":
            payload = ""
        elif response.startswith("OK "):
            payload = response[3:]
        else:
            print(response, flush=True)
            time.sleep(0.2)
            continue

        current = {}
        for line in payload.split("\n"):
            if not line:
                continue
            parts = line.split("|")
            if len(parts) != 7:
                continue
            current[parts[0]] = tuple(parts[1:])

        changes = []
        for key, value in current.items():
            if previous.get(key) != value:
                changes.append((key, previous.get(key), value))

        if changes:
            print("--- change ---", flush=True)
            for key, old, new in changes:
                print(f"{key}: {old} -> {new}", flush=True)

        previous = current
        time.sleep(0.2)


if __name__ == "__main__":
    main()
