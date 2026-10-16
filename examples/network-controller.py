#!/usr/bin/env python3
"""Send a real control message to the addresses shown by the networking example.
Usage: python examples/network-controller.py udp 127.0.0.1:12345 /network/tone 440
TCP uses newline-framed JSON. OSC uses the standard float packet format.
"""
import argparse
import json
import socket
import struct

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('protocol', choices=['tcp', 'udp', 'osc'])
parser.add_argument('address')
parser.add_argument('path')
parser.add_argument('value', type=float)
args = parser.parse_args()
host, port = args.address.rsplit(':', 1)
address = (host.strip('[]'), int(port))
family = socket.AF_INET6 if ':' in address[0] else socket.AF_INET

def osc_string(text):
    data = text.encode() + b'\0'
    return data + b'\0' * (-len(data) % 4)

payload = (json.dumps({'path': args.path, 'value': args.value}) + '\n').encode()
if args.protocol == 'osc':
    payload = osc_string(args.path) + osc_string(',f') + struct.pack('>f', args.value)

with socket.socket(family, socket.SOCK_STREAM if args.protocol == 'tcp' else socket.SOCK_DGRAM) as peer:
    peer.settimeout(5)
    if args.protocol == 'tcp':
        peer.connect(address)
        peer.sendall(payload)
        response = b''
        while b'\n' not in response:
            chunk = peer.recv(16_384)
            if not chunk:
                raise RuntimeError('Connection closed before acknowledgement')
            response += chunk
        print(json.dumps(json.loads(response.split(b'\n')[0]), indent=2))
    else:
        peer.sendto(payload, address)
        response, sender = peer.recvfrom(16_384)
        if args.protocol == 'osc':
            print({'sender': sender, 'osc_packet': response.hex(), 'accepted_value': struct.unpack('>f', response[-4:])[0]})
        else:
            print(json.dumps(json.loads(response), indent=2))
