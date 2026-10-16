// Generated from manifold-core graph metadata. Run scripts/update-port-catalog.sh.
export const PORT_CATALOG = {
  "adsr": {
    "args": {},
    "code": 12,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.05,
        "discrete": false,
        "id": 0,
        "max": 5.0,
        "min": 0.001
      },
      {
        "default": 0.2,
        "discrete": false,
        "id": 1,
        "max": 5.0,
        "min": 0.001
      },
      {
        "default": 0.7,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.4,
        "discrete": false,
        "id": 3,
        "max": 10.0,
        "min": 0.001
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 5,
        "max": 1000000.0,
        "min": 0.0
      }
    ]
  },
  "attenuverter-bias": {
    "args": {
      "a": 1.0,
      "b": 0.0
    },
    "code": 31,
    "configuration": {},
    "inputs": [
      {
        "name": "cv",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "control"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": -1.0
      }
    ]
  },
  "audio-fm": {
    "args": {},
    "code": 71,
    "configuration": {},
    "inputs": [
      {
        "name": "carrier",
        "signal": "audio"
      },
      {
        "name": "modulator",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "audio-sync": {
    "args": {},
    "code": 72,
    "configuration": {},
    "inputs": [
      {
        "name": "carrier",
        "signal": "audio"
      },
      {
        "name": "modulator",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "bit-crusher": {
    "args": {},
    "code": 44,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      },
      {
        "name": "sidechain",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 8.0,
        "discrete": false,
        "id": 0,
        "max": 16.0,
        "min": 2.0
      },
      {
        "default": 4.0,
        "discrete": false,
        "id": 1,
        "max": 64.0,
        "min": 1.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.8,
        "discrete": false,
        "id": 3,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 4,
        "max": 2.0,
        "min": 0.0
      }
    ]
  },
  "chorus": {
    "args": {
      "a": 0.6,
      "b": 0.45
    },
    "code": 35,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.6,
        "discrete": false,
        "id": 0,
        "max": 10.0,
        "min": 0.05
      },
      {
        "default": 0.45,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 3.0,
        "discrete": true,
        "id": 2,
        "max": 4.0,
        "min": 1.0
      },
      {
        "default": 0.7,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.1,
        "discrete": false,
        "id": 4,
        "max": 0.95,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 5,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 6,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "compressor": {
    "args": {
      "a": -12.0,
      "b": 4.0
    },
    "code": 24,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": -12.0,
        "discrete": false,
        "id": 0,
        "max": 0.0,
        "min": -60.0
      },
      {
        "default": 4.0,
        "discrete": false,
        "id": 1,
        "max": 100.0,
        "min": 1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 5,
        "max": 40.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 10,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "constant": {
    "args": {
      "a": 0.0
    },
    "code": 2,
    "configuration": {},
    "inputs": [],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": -1.0
      }
    ]
  },
  "crossfader": {
    "args": {
      "a": 0.0,
      "b": 1.0
    },
    "code": 8,
    "configuration": {},
    "inputs": [
      {
        "name": "a",
        "signal": "audio"
      },
      {
        "name": "b",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "cv-compare": {
    "args": {},
    "code": 68,
    "configuration": {},
    "inputs": [
      {
        "name": "cv",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "gate",
        "signal": "control"
      },
      {
        "name": "trig",
        "signal": "control"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.05,
        "discrete": false,
        "id": 2,
        "max": 0.5,
        "min": 0.0
      }
    ]
  },
  "cv-mix": {
    "args": {
      "a": 1.0,
      "b": 0.5
    },
    "code": 33,
    "configuration": {},
    "inputs": [
      {
        "name": "in-1",
        "signal": "control"
      },
      {
        "name": "in-2",
        "signal": "control"
      },
      {
        "name": "in-3",
        "signal": "control"
      },
      {
        "name": "in-4",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "control"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": -1.0
      }
    ]
  },
  "cv-range": {
    "args": {},
    "code": 69,
    "configuration": {},
    "inputs": [
      {
        "name": "cv",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "control"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "distortion": {
    "args": {
      "a": 4.0,
      "b": 0.7
    },
    "code": 17,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 4.0,
        "discrete": false,
        "id": 0,
        "max": 30.0,
        "min": 1.0
      },
      {
        "default": 0.7,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.8,
        "discrete": false,
        "id": 2,
        "max": 2.0,
        "min": 0.0
      }
    ]
  },
  "effect-slot-legacy": {
    "args": {
      "a": 0.0,
      "b": 0.0
    },
    "code": 52,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 20.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.2,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.6,
        "discrete": false,
        "id": 5,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.4,
        "discrete": false,
        "id": 6,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "envelope-control": {
    "args": {
      "a": 10.0,
      "b": 120.0
    },
    "code": 23,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "control"
      }
    ],
    "parameters": [
      {
        "default": 10.0,
        "discrete": false,
        "id": 0,
        "max": 500.0,
        "min": 0.01
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 1,
        "max": 5000.0,
        "min": 0.1
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 16.0,
        "min": 0.01
      },
      {
        "default": 80.0,
        "discrete": false,
        "id": 3,
        "max": 4000.0,
        "min": 5.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 4,
        "max": 2.0,
        "min": 0.0
      }
    ]
  },
  "envelope-follower": {
    "args": {
      "a": 10.0,
      "b": 120.0
    },
    "code": 22,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 10.0,
        "discrete": false,
        "id": 0,
        "max": 500.0,
        "min": 0.01
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 1,
        "max": 5000.0,
        "min": 0.1
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 16.0,
        "min": 0.01
      },
      {
        "default": 80.0,
        "discrete": false,
        "id": 3,
        "max": 4000.0,
        "min": 5.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 4,
        "max": 2.0,
        "min": 0.0
      }
    ]
  },
  "eq8": {
    "args": {},
    "code": 36,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 1,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 60.0,
        "discrete": false,
        "id": 2,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 3,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 4,
        "max": 24.0,
        "min": 0.1
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 5,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 6,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 7,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 8,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 9,
        "max": 24.0,
        "min": 0.1
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 10,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 11,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 250.0,
        "discrete": false,
        "id": 12,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 13,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 14,
        "max": 24.0,
        "min": 0.1
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 15,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 16,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 500.0,
        "discrete": false,
        "id": 17,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 18,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 19,
        "max": 24.0,
        "min": 0.1
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 20,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 21,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 1000.0,
        "discrete": false,
        "id": 22,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 23,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 24,
        "max": 24.0,
        "min": 0.1
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 25,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 26,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 2500.0,
        "discrete": false,
        "id": 27,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 28,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 29,
        "max": 24.0,
        "min": 0.1
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 30,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 31,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 6000.0,
        "discrete": false,
        "id": 32,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 33,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 34,
        "max": 24.0,
        "min": 0.1
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 35,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 2.0,
        "discrete": true,
        "id": 36,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 12000.0,
        "discrete": false,
        "id": 37,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 38,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 39,
        "max": 24.0,
        "min": 0.1
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 40,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 41,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "extended-oscillator": {
    "args": {
      "a": 220.0,
      "b": 0.0
    },
    "code": 73,
    "configuration": {},
    "inputs": [
      {
        "name": "sync",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": true,
        "id": 0,
        "max": 7.0,
        "min": 0.0
      },
      {
        "default": 220.0,
        "discrete": false,
        "id": 1,
        "max": 16000.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 4,
        "max": 0.99,
        "min": 0.01
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 5,
        "max": 20.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 6,
        "max": 3.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 7,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 8,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 9,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 10,
        "max": 8.0,
        "min": 1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 11,
        "max": 100.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 12,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 13,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 8.0,
        "discrete": false,
        "id": 14,
        "max": 32.0,
        "min": 1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 15,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 16,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "fft-spectrum": {
    "args": {
      "a": 0.45,
      "b": -72.0
    },
    "code": 28,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.45,
        "discrete": false,
        "id": 0,
        "max": 0.99,
        "min": 0.0
      },
      {
        "default": -72.0,
        "discrete": false,
        "id": 1,
        "max": -24.0,
        "min": -96.0
      }
    ]
  },
  "fixed-gain": {
    "args": {
      "a": 4.0
    },
    "code": 67,
    "configuration": {
      "gain": {
        "argument": "a",
        "default": 4.0,
        "max": 4.0,
        "min": 0.0
      }
    },
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": []
  },
  "formant-filter": {
    "args": {},
    "code": 46,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 4.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 12.0,
        "min": -12.0
      },
      {
        "default": 6.0,
        "discrete": false,
        "id": 2,
        "max": 20.0,
        "min": 1.0
      },
      {
        "default": 1.2,
        "discrete": false,
        "id": 3,
        "max": 8.0,
        "min": 0.5
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "gain": {
    "args": {
      "a": 0.7
    },
    "code": 3,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.7,
        "discrete": false,
        "id": 0,
        "max": 8.0,
        "min": 0.0
      }
    ]
  },
  "granulator": {
    "args": {},
    "code": 51,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 80.0,
        "discrete": false,
        "id": 0,
        "max": 500.0,
        "min": 1.0
      },
      {
        "default": 20.0,
        "discrete": false,
        "id": 1,
        "max": 100.0,
        "min": 1.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 3,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 0.2,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 5,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 6,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 7,
        "max": 4.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 8,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 9,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 10,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "input.raw": {
    "args": {},
    "code": 0,
    "configuration": {},
    "inputs": [],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": []
  },
  "input.sidechain": {
    "args": {},
    "code": 65,
    "configuration": {},
    "inputs": [],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": []
  },
  "legacy-filter": {
    "args": {},
    "code": 39,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1400.0,
        "discrete": false,
        "id": 0,
        "max": 18000.0,
        "min": 20.0
      },
      {
        "default": 0.1,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "lfo": {
    "args": {
      "a": 2.0
    },
    "code": 14,
    "configuration": {},
    "inputs": [],
    "outputs": [
      {
        "name": "out",
        "signal": "control"
      },
      {
        "name": "inv",
        "signal": "control"
      },
      {
        "name": "uni",
        "signal": "control"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 2.0,
        "discrete": false,
        "id": 1,
        "max": 20.0,
        "min": 0.05
      }
    ]
  },
  "limiter": {
    "args": {
      "a": -1.0,
      "b": 60.0
    },
    "code": 25,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": -1.0,
        "discrete": false,
        "id": 0,
        "max": 0.0,
        "min": -24.0
      },
      {
        "default": 60.0,
        "discrete": false,
        "id": 1,
        "max": 500.0,
        "min": 1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 2,
        "max": 18.0,
        "min": 0.0
      },
      {
        "default": 0.2,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "linear-blend": {
    "args": {
      "a": 0.5
    },
    "code": 5,
    "configuration": {},
    "inputs": [
      {
        "name": "a",
        "signal": "audio"
      },
      {
        "name": "b",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.5,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "loop-capture": {
    "args": {
      "a": 2.0,
      "b": 1.0
    },
    "code": 20,
    "configuration": {
      "capacitySeconds": {
        "argument": "a",
        "default": 2.0,
        "min": 0.0
      }
    },
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 3,
        "max": 2.0,
        "min": 0.25
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 5,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 6,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "main-voice-bank": {
    "args": {
      "a": 9.0
    },
    "code": 64,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 4.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 60.0,
        "discrete": false,
        "id": 2,
        "max": 84.0,
        "min": 36.0
      },
      {
        "default": 2.0,
        "discrete": true,
        "id": 3,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 4,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 5,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 6,
        "max": 5.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 7,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 8,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 9,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 10,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.005,
        "discrete": false,
        "id": 11,
        "max": 0.5,
        "min": 0.001
      },
      {
        "default": 0.08,
        "discrete": false,
        "id": 12,
        "max": 1.0,
        "min": 0.001
      },
      {
        "default": 0.8,
        "discrete": false,
        "id": 13,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.16,
        "discrete": false,
        "id": 14,
        "max": 2.0,
        "min": 0.001
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 15,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 16,
        "max": 4.0,
        "min": 0.25
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 17,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.2,
        "discrete": false,
        "id": 18,
        "max": 0.6,
        "min": 0.05
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 19,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "midi-arpeggiator": {
    "args": {
      "a": 8.0,
      "b": 0.0
    },
    "code": 59,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "midi"
      }
    ],
    "parameters": [
      {
        "default": 8.0,
        "discrete": false,
        "id": 0,
        "max": 20.0,
        "min": 0.25
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 1,
        "max": 3.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 2,
        "max": 4.0,
        "min": 1.0
      },
      {
        "default": 0.6,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.05
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "midi-input": {
    "args": {},
    "code": 54,
    "configuration": {},
    "inputs": [],
    "outputs": [
      {
        "name": "out",
        "signal": "midi"
      }
    ],
    "parameters": []
  },
  "midi-note-filter": {
    "args": {
      "a": 36.0,
      "b": 96.0
    },
    "code": 56,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "midi"
      }
    ],
    "parameters": [
      {
        "default": 36.0,
        "discrete": true,
        "id": 0,
        "max": 127.0,
        "min": 0.0
      },
      {
        "default": 96.0,
        "discrete": true,
        "id": 1,
        "max": 127.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "midi-scale-quantizer": {
    "args": {
      "a": 0.0,
      "b": 1.0
    },
    "code": 57,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "midi"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 11.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 1,
        "max": 6.0,
        "min": 1.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 2,
        "max": 3.0,
        "min": 1.0
      }
    ]
  },
  "midi-transpose": {
    "args": {
      "a": 0.0
    },
    "code": 55,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "midi"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 24.0,
        "min": -24.0
      }
    ]
  },
  "midi-velocity-mapper": {
    "args": {
      "a": 1.0,
      "b": 0.0
    },
    "code": 58,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "midi"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 1,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": -1.0
      }
    ]
  },
  "mixer": {
    "args": {
      "a": 32.0,
      "b": 1.0
    },
    "code": 9,
    "configuration": {
      "inputs": {
        "argument": "a",
        "default": 32.0,
        "min": 1.0
      }
    },
    "inputs": [
      {
        "name": "in-1",
        "signal": "audio"
      },
      {
        "name": "in-2",
        "signal": "audio"
      },
      {
        "name": "in-3",
        "signal": "audio"
      },
      {
        "name": "in-4",
        "signal": "audio"
      },
      {
        "name": "in-5",
        "signal": "audio"
      },
      {
        "name": "in-6",
        "signal": "audio"
      },
      {
        "name": "in-7",
        "signal": "audio"
      },
      {
        "name": "in-8",
        "signal": "audio"
      },
      {
        "name": "in-9",
        "signal": "audio"
      },
      {
        "name": "in-10",
        "signal": "audio"
      },
      {
        "name": "in-11",
        "signal": "audio"
      },
      {
        "name": "in-12",
        "signal": "audio"
      },
      {
        "name": "in-13",
        "signal": "audio"
      },
      {
        "name": "in-14",
        "signal": "audio"
      },
      {
        "name": "in-15",
        "signal": "audio"
      },
      {
        "name": "in-16",
        "signal": "audio"
      },
      {
        "name": "in-17",
        "signal": "audio"
      },
      {
        "name": "in-18",
        "signal": "audio"
      },
      {
        "name": "in-19",
        "signal": "audio"
      },
      {
        "name": "in-20",
        "signal": "audio"
      },
      {
        "name": "in-21",
        "signal": "audio"
      },
      {
        "name": "in-22",
        "signal": "audio"
      },
      {
        "name": "in-23",
        "signal": "audio"
      },
      {
        "name": "in-24",
        "signal": "audio"
      },
      {
        "name": "in-25",
        "signal": "audio"
      },
      {
        "name": "in-26",
        "signal": "audio"
      },
      {
        "name": "in-27",
        "signal": "audio"
      },
      {
        "name": "in-28",
        "signal": "audio"
      },
      {
        "name": "in-29",
        "signal": "audio"
      },
      {
        "name": "in-30",
        "signal": "audio"
      },
      {
        "name": "in-31",
        "signal": "audio"
      },
      {
        "name": "in-32",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 1,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 3,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 4,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 5,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 6,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 7,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 8,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 9,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 10,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 11,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 12,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 13,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 14,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 15,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 16,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 17,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 18,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 19,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 20,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 21,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 22,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 23,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 24,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 25,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 26,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 27,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 28,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 29,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 30,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 31,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 32,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 33,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 34,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 35,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 36,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 37,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 38,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 39,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 40,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 41,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 42,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 43,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 44,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 45,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 46,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 47,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 48,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 49,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 50,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 51,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 52,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 53,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 54,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 55,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 56,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 57,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 58,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 59,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 60,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 61,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 62,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 63,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 64,
        "max": 1.0,
        "min": -1.0
      }
    ]
  },
  "mixer9": {
    "args": {
      "a": 9.0,
      "b": 1.0
    },
    "code": 9,
    "configuration": {},
    "inputs": [
      {
        "name": "in-1",
        "signal": "audio"
      },
      {
        "name": "in-2",
        "signal": "audio"
      },
      {
        "name": "in-3",
        "signal": "audio"
      },
      {
        "name": "in-4",
        "signal": "audio"
      },
      {
        "name": "in-5",
        "signal": "audio"
      },
      {
        "name": "in-6",
        "signal": "audio"
      },
      {
        "name": "in-7",
        "signal": "audio"
      },
      {
        "name": "in-8",
        "signal": "audio"
      },
      {
        "name": "in-9",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 2.0,
        "min": 0.0
      }
    ]
  },
  "modulated-gain": {
    "args": {
      "a": 0.5,
      "b": 0.4
    },
    "code": 15,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      },
      {
        "name": "cv",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.5,
        "discrete": false,
        "id": 0,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 0.4,
        "discrete": false,
        "id": 1,
        "max": 2.0,
        "min": -2.0
      }
    ]
  },
  "modulated-svf": {
    "args": {
      "a": 2000.0
    },
    "code": 16,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      },
      {
        "name": "cv",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 3.0,
        "min": 0.0
      },
      {
        "default": 3200.0,
        "discrete": false,
        "id": 1,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.75,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.1
      },
      {
        "default": 2000.0,
        "discrete": false,
        "id": 3,
        "max": 20000.0,
        "min": 0.0
      }
    ]
  },
  "multitap-delay": {
    "args": {},
    "code": 41,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 4.0,
        "discrete": true,
        "id": 0,
        "max": 8.0,
        "min": 1.0
      },
      {
        "default": 0.3,
        "discrete": false,
        "id": 1,
        "max": 0.95,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 3,
        "max": 3000.0,
        "min": 1.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": -0.5,
        "discrete": false,
        "id": 5,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 240.0,
        "discrete": false,
        "id": 6,
        "max": 3000.0,
        "min": 1.0
      },
      {
        "default": 0.25,
        "discrete": false,
        "id": 7,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 8,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 360.0,
        "discrete": false,
        "id": 9,
        "max": 3000.0,
        "min": 1.0
      },
      {
        "default": 0.16666666666666666,
        "discrete": false,
        "id": 10,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": -0.5,
        "discrete": false,
        "id": 11,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 480.0,
        "discrete": false,
        "id": 12,
        "max": 3000.0,
        "min": 1.0
      },
      {
        "default": 0.125,
        "discrete": false,
        "id": 13,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 14,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 600.0,
        "discrete": false,
        "id": 15,
        "max": 3000.0,
        "min": 1.0
      },
      {
        "default": 0.1,
        "discrete": false,
        "id": 16,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": -0.5,
        "discrete": false,
        "id": 17,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 720.0,
        "discrete": false,
        "id": 18,
        "max": 3000.0,
        "min": 1.0
      },
      {
        "default": 0.08333333333333333,
        "discrete": false,
        "id": 19,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 20,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 840.0,
        "discrete": false,
        "id": 21,
        "max": 3000.0,
        "min": 1.0
      },
      {
        "default": 0.07142857142857142,
        "discrete": false,
        "id": 22,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": -0.5,
        "discrete": false,
        "id": 23,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 960.0,
        "discrete": false,
        "id": 24,
        "max": 3000.0,
        "min": 1.0
      },
      {
        "default": 0.0625,
        "discrete": false,
        "id": 25,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 26,
        "max": 1.0,
        "min": -1.0
      }
    ]
  },
  "noise": {
    "args": {
      "a": 0.08,
      "b": 0.5
    },
    "code": 13,
    "configuration": {},
    "inputs": [],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.08,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "oscillator": {
    "args": {
      "a": 220.0,
      "b": 0.4
    },
    "code": 11,
    "configuration": {},
    "inputs": [
      {
        "name": "sync",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 4.0,
        "min": 0.0
      },
      {
        "default": 220.0,
        "discrete": false,
        "id": 1,
        "max": 16000.0,
        "min": 20.0
      },
      {
        "default": 0.4,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "output": {
    "args": {},
    "code": 7,
    "configuration": {},
    "inputs": [
      {
        "name": "in",
        "signal": "audio"
      }
    ],
    "outputs": [],
    "parameters": []
  },
  "phase-vocoder": {
    "args": {},
    "code": 62,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 4.0,
        "min": 0.25
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 11.0,
        "discrete": true,
        "id": 4,
        "max": 12.0,
        "min": 9.0
      }
    ]
  },
  "phaser": {
    "args": {
      "a": 0.4,
      "b": 0.7
    },
    "code": 34,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.4,
        "discrete": false,
        "id": 0,
        "max": 10.0,
        "min": 0.1
      },
      {
        "default": 0.7,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 6.0,
        "discrete": true,
        "id": 2,
        "max": 12.0,
        "min": 6.0
      },
      {
        "default": 0.2,
        "discrete": false,
        "id": 3,
        "max": 0.95,
        "min": -0.95
      },
      {
        "default": 90.0,
        "discrete": false,
        "id": 4,
        "max": 180.0,
        "min": 0.0
      }
    ]
  },
  "phrase-gain": {
    "args": {
      "a": 1.0,
      "b": 0.2
    },
    "code": 63,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      },
      {
        "name": "cv",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.2,
        "discrete": false,
        "id": 1,
        "max": 0.6,
        "min": 0.05
      }
    ]
  },
  "pitch-shifter": {
    "args": {},
    "code": 49,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 80.0,
        "discrete": false,
        "id": 1,
        "max": 200.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 2,
        "max": 0.95,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "pulse-oscillator": {
    "args": {
      "a": 220.0,
      "b": 0.4
    },
    "code": 70,
    "configuration": {},
    "inputs": [
      {
        "name": "sync",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 220.0,
        "discrete": false,
        "id": 1,
        "max": 16000.0,
        "min": 20.0
      },
      {
        "default": 0.4,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.25,
        "discrete": false,
        "id": 4,
        "max": 0.99,
        "min": 0.01
      }
    ]
  },
  "resonator": {
    "args": {},
    "code": 60,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 4.0,
        "min": 0.0
      },
      {
        "default": 1000.0,
        "discrete": false,
        "id": 1,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 10.0,
        "discrete": false,
        "id": 2,
        "max": 500.0,
        "min": 0.01
      }
    ]
  },
  "retrospective-capture": {
    "args": {
      "a": 30.0,
      "b": 0.0
    },
    "code": 66,
    "configuration": {
      "capacitySeconds": {
        "argument": "a",
        "default": 30.0,
        "min": 0.0
      }
    },
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": []
  },
  "reverb": {
    "args": {},
    "code": 40,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.5,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.33,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.4,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "reverse-delay": {
    "args": {},
    "code": 47,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 420.0,
        "discrete": false,
        "id": 0,
        "max": 2000.0,
        "min": 50.0
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 1,
        "max": 400.0,
        "min": 20.0
      },
      {
        "default": 0.35,
        "discrete": false,
        "id": 2,
        "max": 0.95,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "ring-modulator": {
    "args": {},
    "code": 42,
    "configuration": {},
    "inputs": [
      {
        "name": "carrier",
        "signal": "audio"
      },
      {
        "name": "modulator",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 180.0,
        "discrete": false,
        "id": 0,
        "max": 8000.0,
        "min": 0.1
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 3,
        "max": 180.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "sample-hold": {
    "args": {
      "a": 0.0
    },
    "code": 32,
    "configuration": {},
    "inputs": [
      {
        "name": "cv",
        "signal": "control"
      },
      {
        "name": "trigger",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "control"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 2.0,
        "min": 0.0
      }
    ]
  },
  "sample-instrument": {
    "args": {},
    "code": 27,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 60.0,
        "discrete": false,
        "id": 0,
        "max": 84.0,
        "min": 36.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.25,
        "discrete": false,
        "id": 2,
        "max": 0.5,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 3,
        "max": 2.0,
        "min": 0.25
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 5,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 6,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 7,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 8,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.08,
        "discrete": false,
        "id": 9,
        "max": 0.5,
        "min": 0.0
      },
      {
        "default": 0.01,
        "discrete": false,
        "id": 10,
        "max": 0.2,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 11,
        "max": 4.0,
        "min": 1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 12,
        "max": 100.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 13,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "sample-region": {
    "args": {},
    "code": 26,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 2.0,
        "min": 0.25
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 5,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.08,
        "discrete": false,
        "id": 8,
        "max": 0.5,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 9,
        "max": 8.0,
        "min": 1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 10,
        "max": 100.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 11,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "shimmer": {
    "args": {},
    "code": 50,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.6,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 12.0,
        "discrete": false,
        "id": 1,
        "max": 12.0,
        "min": -12.0
      },
      {
        "default": 0.65,
        "discrete": false,
        "id": 2,
        "max": 0.99,
        "min": 0.0
      },
      {
        "default": 0.45,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.25,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 6000.0,
        "discrete": false,
        "id": 5,
        "max": 12000.0,
        "min": 100.0
      }
    ]
  },
  "slew-audio": {
    "args": {
      "a": 64.0,
      "b": 64.0
    },
    "code": 29,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 64.0,
        "discrete": false,
        "id": 0,
        "max": 96000.0,
        "min": 1.0
      },
      {
        "default": 64.0,
        "discrete": false,
        "id": 1,
        "max": 96000.0,
        "min": 1.0
      }
    ]
  },
  "slew-control": {
    "args": {
      "a": 16.0,
      "b": 16.0
    },
    "code": 30,
    "configuration": {},
    "inputs": [
      {
        "name": "cv",
        "signal": "control"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "control"
      }
    ],
    "parameters": [
      {
        "default": 16.0,
        "discrete": false,
        "id": 0,
        "max": 1024.0,
        "min": 1.0
      },
      {
        "default": 16.0,
        "discrete": false,
        "id": 1,
        "max": 1024.0,
        "min": 1.0
      }
    ]
  },
  "spectrum-analyzer": {
    "args": {
      "a": 1.0,
      "b": 0.85
    },
    "code": 21,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 8.0,
        "min": 0.1
      },
      {
        "default": 0.85,
        "discrete": false,
        "id": 1,
        "max": 0.999,
        "min": 0.0
      },
      {
        "default": -72.0,
        "discrete": false,
        "id": 2,
        "max": -12.0,
        "min": -96.0
      }
    ]
  },
  "stereo-delay": {
    "args": {
      "a": 250.0,
      "b": 375.0
    },
    "code": 18,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 250.0,
        "discrete": false,
        "id": 0,
        "max": 5000.0,
        "min": 1.0
      },
      {
        "default": 375.0,
        "discrete": false,
        "id": 1,
        "max": 5000.0,
        "min": 1.0
      },
      {
        "default": 0.3,
        "discrete": false,
        "id": 2,
        "max": 1.2,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 4000.0,
        "discrete": false,
        "id": 5,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 7,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 8,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 9,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 10,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 11,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": true,
        "id": 12,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 3.0,
        "discrete": true,
        "id": 13,
        "max": 10.0,
        "min": 0.0
      },
      {
        "default": 6.0,
        "discrete": true,
        "id": 14,
        "max": 10.0,
        "min": 0.0
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 15,
        "max": 300.0,
        "min": 20.0
      }
    ]
  },
  "stereo-widener": {
    "args": {},
    "code": 38,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 1.0,
        "discrete": false,
        "id": 0,
        "max": 2.0,
        "min": 0.0
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 1,
        "max": 500.0,
        "min": 20.0
      },
      {
        "default": 1.0,
        "discrete": true,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "stutter": {
    "args": {},
    "code": 48,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.5,
        "discrete": false,
        "id": 0,
        "max": 8.0,
        "min": 0.125
      },
      {
        "default": 0.8,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.3,
        "discrete": false,
        "id": 2,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.2,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.5,
        "discrete": false,
        "id": 4,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 255.0,
        "discrete": true,
        "id": 5,
        "max": 255.0,
        "min": 0.0
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 6,
        "max": 300.0,
        "min": 20.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 7,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "sum2": {
    "args": {
      "a": 1.0,
      "b": 1.0
    },
    "code": 4,
    "configuration": {},
    "inputs": [
      {
        "name": "a",
        "signal": "audio"
      },
      {
        "name": "b",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": []
  },
  "svf": {
    "args": {},
    "code": 6,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 3.0,
        "min": 0.0
      },
      {
        "default": 3200.0,
        "discrete": false,
        "id": 1,
        "max": 20000.0,
        "min": 20.0
      },
      {
        "default": 0.75,
        "discrete": false,
        "id": 2,
        "max": 2.0,
        "min": 0.1
      }
    ]
  },
  "three-band-eq": {
    "args": {},
    "code": 45,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": false,
        "id": 0,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 120.0,
        "discrete": false,
        "id": 1,
        "max": 400.0,
        "min": 20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 2,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1000.0,
        "discrete": false,
        "id": 3,
        "max": 8000.0,
        "min": 120.0
      },
      {
        "default": 0.7,
        "discrete": false,
        "id": 4,
        "max": 12.0,
        "min": 0.2
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 5,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 8000.0,
        "discrete": false,
        "id": 6,
        "max": 16000.0,
        "min": 2000.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 7,
        "max": 24.0,
        "min": -24.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 8,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "transient-shaper": {
    "args": {},
    "code": 43,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.5,
        "discrete": false,
        "id": 0,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 1,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 2,
        "max": 4.0,
        "min": 0.1
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "voice-synth": {
    "args": {},
    "code": 10,
    "configuration": {},
    "inputs": [
      {
        "name": "midi",
        "signal": "midi"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 3.0,
        "min": 0.0
      },
      {
        "default": 0.01,
        "discrete": false,
        "id": 1,
        "max": 2.0,
        "min": 0.001
      },
      {
        "default": 0.12,
        "discrete": false,
        "id": 2,
        "max": 2.0,
        "min": 0.001
      },
      {
        "default": 0.65,
        "discrete": false,
        "id": 3,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 0.18,
        "discrete": false,
        "id": 4,
        "max": 3.0,
        "min": 0.001
      },
      {
        "default": 0.25,
        "discrete": false,
        "id": 5,
        "max": 1.0,
        "min": 0.0
      }
    ]
  },
  "wave-shaper": {
    "args": {},
    "code": 37,
    "configuration": {},
    "inputs": [
      {
        "name": "audio",
        "signal": "audio"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "signal": "audio"
      }
    ],
    "parameters": [
      {
        "default": 0.0,
        "discrete": true,
        "id": 0,
        "max": 6.0,
        "min": 0.0
      },
      {
        "default": 12.0,
        "discrete": false,
        "id": 1,
        "max": 40.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 2,
        "max": 20.0,
        "min": -20.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 3,
        "max": 20000.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 4,
        "max": 20000.0,
        "min": 0.0
      },
      {
        "default": 0.0,
        "discrete": false,
        "id": 5,
        "max": 1.0,
        "min": -1.0
      },
      {
        "default": 1.0,
        "discrete": false,
        "id": 6,
        "max": 1.0,
        "min": 0.0
      },
      {
        "default": 2.0,
        "discrete": true,
        "id": 7,
        "max": 4.0,
        "min": 1.0
      }
    ]
  }
};
