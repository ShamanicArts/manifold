var ManifoldProject = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
  var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
  var __privateWrapper = (obj, member, setter, getter) => ({
    set _(value) {
      __privateSet(obj, member, value, setter);
    },
    get _() {
      return __privateGet(obj, member, getter);
    }
  });

  // examples/projects/main-wave-project.mjs
  var main_wave_project_exports = {};
  __export(main_wave_project_exports, {
    createProject: () => createProject2,
    restoreProject: () => restoreProject
  });

  // packages/manifold-author/catalog.generated.js
  var PORT_CATALOG = {
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
          "max": 5,
          "min": 1e-3
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 1,
          "max": 5,
          "min": 1e-3
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 3,
          "max": 10,
          "min": 1e-3
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 1e6,
          "min": 0
        }
      ]
    },
    "attenuverter-bias": {
      "args": {
        "a": 1,
        "b": 0
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": -1
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
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
          "default": 8,
          "discrete": false,
          "id": 0,
          "max": 16,
          "min": 2
        },
        {
          "default": 4,
          "discrete": false,
          "id": 1,
          "max": 64,
          "min": 1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.8,
          "discrete": false,
          "id": 3,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 2,
          "min": 0
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
          "max": 10,
          "min": 0.05
        },
        {
          "default": 0.45,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 3,
          "discrete": true,
          "id": 2,
          "max": 4,
          "min": 1
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.1,
          "discrete": false,
          "id": 4,
          "max": 0.95,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        }
      ]
    },
    "compressor": {
      "args": {
        "a": -12,
        "b": 4
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
          "default": -12,
          "discrete": false,
          "id": 0,
          "max": 0,
          "min": -60
        },
        {
          "default": 4,
          "discrete": false,
          "id": 1,
          "max": 100,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 5,
          "max": 40,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 10,
          "max": 1,
          "min": 0
        }
      ]
    },
    "constant": {
      "args": {
        "a": 0
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": -1
        }
      ]
    },
    "crossfader": {
      "args": {
        "a": 0,
        "b": 1
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": -1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": -1
        },
        {
          "default": 0.05,
          "discrete": false,
          "id": 2,
          "max": 0.5,
          "min": 0
        }
      ]
    },
    "cv-mix": {
      "args": {
        "a": 1,
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": -1
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "distortion": {
      "args": {
        "a": 4,
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
          "default": 4,
          "discrete": false,
          "id": 0,
          "max": 30,
          "min": 1
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.8,
          "discrete": false,
          "id": 2,
          "max": 2,
          "min": 0
        }
      ]
    },
    "effect-slot-legacy": {
      "args": {
        "a": 0,
        "b": 0
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 20,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.6,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        }
      ]
    },
    "envelope-control": {
      "args": {
        "a": 10,
        "b": 120
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
          "default": 10,
          "discrete": false,
          "id": 0,
          "max": 500,
          "min": 0.01
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 5e3,
          "min": 0.1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 16,
          "min": 0.01
        },
        {
          "default": 80,
          "discrete": false,
          "id": 3,
          "max": 4e3,
          "min": 5
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 2,
          "min": 0
        }
      ]
    },
    "envelope-follower": {
      "args": {
        "a": 10,
        "b": 120
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
          "default": 10,
          "discrete": false,
          "id": 0,
          "max": 500,
          "min": 0.01
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 5e3,
          "min": 0.1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 16,
          "min": 0.01
        },
        {
          "default": 80,
          "discrete": false,
          "id": 3,
          "max": 4e3,
          "min": 5
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 2,
          "min": 0
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 1,
          "max": 6,
          "min": 0
        },
        {
          "default": 60,
          "discrete": false,
          "id": 2,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 6,
          "max": 6,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 7,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 8,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 9,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 10,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 11,
          "max": 6,
          "min": 0
        },
        {
          "default": 250,
          "discrete": false,
          "id": 12,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 13,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 14,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 15,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 16,
          "max": 6,
          "min": 0
        },
        {
          "default": 500,
          "discrete": false,
          "id": 17,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 18,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 19,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 20,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 21,
          "max": 6,
          "min": 0
        },
        {
          "default": 1e3,
          "discrete": false,
          "id": 22,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 23,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 24,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 25,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 26,
          "max": 6,
          "min": 0
        },
        {
          "default": 2500,
          "discrete": false,
          "id": 27,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 28,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 29,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 30,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 31,
          "max": 6,
          "min": 0
        },
        {
          "default": 6e3,
          "discrete": false,
          "id": 32,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 33,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 34,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": true,
          "id": 35,
          "max": 1,
          "min": 0
        },
        {
          "default": 2,
          "discrete": true,
          "id": 36,
          "max": 6,
          "min": 0
        },
        {
          "default": 12e3,
          "discrete": false,
          "id": 37,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 38,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 39,
          "max": 24,
          "min": 0.1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 40,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 41,
          "max": 1,
          "min": 0
        }
      ]
    },
    "extended-oscillator": {
      "args": {
        "a": 220,
        "b": 0
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
          "default": 1,
          "discrete": true,
          "id": 0,
          "max": 7,
          "min": 0
        },
        {
          "default": 220,
          "discrete": false,
          "id": 1,
          "max": 16e3,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 4,
          "max": 0.99,
          "min": 0.01
        },
        {
          "default": 0,
          "discrete": false,
          "id": 5,
          "max": 20,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 6,
          "max": 3,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": -1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 9,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 10,
          "max": 8,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 11,
          "max": 100,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 12,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 13,
          "max": 1,
          "min": 0
        },
        {
          "default": 8,
          "discrete": false,
          "id": 14,
          "max": 32,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 15,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 16,
          "max": 1,
          "min": 0
        }
      ]
    },
    "fft-spectrum": {
      "args": {
        "a": 0.45,
        "b": -72
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
          "min": 0
        },
        {
          "default": -72,
          "discrete": false,
          "id": 1,
          "max": -24,
          "min": -96
        }
      ]
    },
    "fixed-gain": {
      "args": {
        "a": 4
      },
      "code": 67,
      "configuration": {
        "gain": {
          "argument": "a",
          "default": 4,
          "max": 4,
          "min": 0
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 4,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 12,
          "min": -12
        },
        {
          "default": 6,
          "discrete": false,
          "id": 2,
          "max": 20,
          "min": 1
        },
        {
          "default": 1.2,
          "discrete": false,
          "id": 3,
          "max": 8,
          "min": 0.5
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
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
          "max": 8,
          "min": 0
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
          "default": 80,
          "discrete": false,
          "id": 0,
          "max": 500,
          "min": 1
        },
        {
          "default": 20,
          "discrete": false,
          "id": 1,
          "max": 100,
          "min": 1
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 24,
          "min": -24
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 6,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 7,
          "max": 4,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 9,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 10,
          "max": 1,
          "min": 0
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
          "default": 1400,
          "discrete": false,
          "id": 0,
          "max": 18e3,
          "min": 20
        },
        {
          "default": 0.1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "lfo": {
      "args": {
        "a": 2
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 2,
          "discrete": false,
          "id": 1,
          "max": 20,
          "min": 0.05
        }
      ]
    },
    "limiter": {
      "args": {
        "a": -1,
        "b": 60
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
          "default": -1,
          "discrete": false,
          "id": 0,
          "max": 0,
          "min": -24
        },
        {
          "default": 60,
          "discrete": false,
          "id": 1,
          "max": 500,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 18,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
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
          "max": 1,
          "min": 0
        }
      ]
    },
    "loop-capture": {
      "args": {
        "a": 2,
        "b": 1
      },
      "code": 20,
      "configuration": {
        "capacitySeconds": {
          "argument": "a",
          "default": 2,
          "min": 0
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 2,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        }
      ]
    },
    "main-voice-bank": {
      "args": {
        "a": 9
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 4,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": -1
        },
        {
          "default": 60,
          "discrete": false,
          "id": 2,
          "max": 84,
          "min": 36
        },
        {
          "default": 2,
          "discrete": true,
          "id": 3,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 4,
          "max": 24,
          "min": -24
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 6,
          "max": 5,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 9,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 10,
          "max": 1,
          "min": 0
        },
        {
          "default": 5e-3,
          "discrete": false,
          "id": 11,
          "max": 0.5,
          "min": 1e-3
        },
        {
          "default": 0.08,
          "discrete": false,
          "id": 12,
          "max": 1,
          "min": 1e-3
        },
        {
          "default": 0.8,
          "discrete": false,
          "id": 13,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.16,
          "discrete": false,
          "id": 14,
          "max": 2,
          "min": 1e-3
        },
        {
          "default": 1,
          "discrete": false,
          "id": 15,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 16,
          "max": 4,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": false,
          "id": 17,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 18,
          "max": 0.6,
          "min": 0.05
        },
        {
          "default": 0,
          "discrete": true,
          "id": 19,
          "max": 1,
          "min": 0
        }
      ]
    },
    "midi-arpeggiator": {
      "args": {
        "a": 8,
        "b": 0
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
          "default": 8,
          "discrete": false,
          "id": 0,
          "max": 20,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": true,
          "id": 1,
          "max": 3,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 2,
          "max": 4,
          "min": 1
        },
        {
          "default": 0.6,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0.05
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
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
        "a": 36,
        "b": 96
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
          "default": 36,
          "discrete": true,
          "id": 0,
          "max": 127,
          "min": 0
        },
        {
          "default": 96,
          "discrete": true,
          "id": 1,
          "max": 127,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        }
      ]
    },
    "midi-scale-quantizer": {
      "args": {
        "a": 0,
        "b": 1
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 11,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 1,
          "max": 6,
          "min": 1
        },
        {
          "default": 1,
          "discrete": true,
          "id": 2,
          "max": 3,
          "min": 1
        }
      ]
    },
    "midi-transpose": {
      "args": {
        "a": 0
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 24,
          "min": -24
        }
      ]
    },
    "midi-velocity-mapper": {
      "args": {
        "a": 1,
        "b": 0
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 1,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": -1
        }
      ]
    },
    "mixer": {
      "args": {
        "a": 32,
        "b": 1
      },
      "code": 9,
      "configuration": {
        "inputs": {
          "argument": "a",
          "default": 32,
          "min": 1
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 5,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 6,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 7,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 8,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 9,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 10,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 11,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 12,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 13,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 14,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 15,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 16,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 17,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 18,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 19,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 20,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 21,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 22,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 23,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 24,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 25,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 26,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 27,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 28,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 29,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 30,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 31,
          "max": 2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 32,
          "max": 2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 33,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 34,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 35,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 36,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 37,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 38,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 39,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 40,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 41,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 42,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 43,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 44,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 45,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 46,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 47,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 48,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 49,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 50,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 51,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 52,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 53,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 54,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 55,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 56,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 57,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 58,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 59,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 60,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 61,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 62,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 63,
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 64,
          "max": 1,
          "min": -1
        }
      ]
    },
    "mixer9": {
      "args": {
        "a": 9,
        "b": 1
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0
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
          "max": 2,
          "min": 0
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 1,
          "max": 2,
          "min": -2
        }
      ]
    },
    "modulated-svf": {
      "args": {
        "a": 2e3
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 3,
          "min": 0
        },
        {
          "default": 3200,
          "discrete": false,
          "id": 1,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0.75,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0.1
        },
        {
          "default": 2e3,
          "discrete": false,
          "id": 3,
          "max": 2e4,
          "min": 0
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
          "default": 4,
          "discrete": true,
          "id": 0,
          "max": 8,
          "min": 1
        },
        {
          "default": 0.3,
          "discrete": false,
          "id": 1,
          "max": 0.95,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 3,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": -0.5,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": -1
        },
        {
          "default": 240,
          "discrete": false,
          "id": 6,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": -1
        },
        {
          "default": 360,
          "discrete": false,
          "id": 9,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.16666666666666666,
          "discrete": false,
          "id": 10,
          "max": 1,
          "min": 0
        },
        {
          "default": -0.5,
          "discrete": false,
          "id": 11,
          "max": 1,
          "min": -1
        },
        {
          "default": 480,
          "discrete": false,
          "id": 12,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.125,
          "discrete": false,
          "id": 13,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 14,
          "max": 1,
          "min": -1
        },
        {
          "default": 600,
          "discrete": false,
          "id": 15,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.1,
          "discrete": false,
          "id": 16,
          "max": 1,
          "min": 0
        },
        {
          "default": -0.5,
          "discrete": false,
          "id": 17,
          "max": 1,
          "min": -1
        },
        {
          "default": 720,
          "discrete": false,
          "id": 18,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.08333333333333333,
          "discrete": false,
          "id": 19,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 20,
          "max": 1,
          "min": -1
        },
        {
          "default": 840,
          "discrete": false,
          "id": 21,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.07142857142857142,
          "discrete": false,
          "id": 22,
          "max": 1,
          "min": 0
        },
        {
          "default": -0.5,
          "discrete": false,
          "id": 23,
          "max": 1,
          "min": -1
        },
        {
          "default": 960,
          "discrete": false,
          "id": 24,
          "max": 3e3,
          "min": 1
        },
        {
          "default": 0.0625,
          "discrete": false,
          "id": 25,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 26,
          "max": 1,
          "min": -1
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
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        }
      ]
    },
    "oscillator": {
      "args": {
        "a": 220,
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 4,
          "min": 0
        },
        {
          "default": 220,
          "discrete": false,
          "id": 1,
          "max": 16e3,
          "min": 20
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 4,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 11,
          "discrete": true,
          "id": 4,
          "max": 12,
          "min": 9
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
          "max": 10,
          "min": 0.1
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 6,
          "discrete": true,
          "id": 2,
          "max": 12,
          "min": 6
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 3,
          "max": 0.95,
          "min": -0.95
        },
        {
          "default": 90,
          "discrete": false,
          "id": 4,
          "max": 180,
          "min": 0
        }
      ]
    },
    "phrase-gain": {
      "args": {
        "a": 1,
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 1,
          "min": 0
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 24,
          "min": -24
        },
        {
          "default": 80,
          "discrete": false,
          "id": 1,
          "max": 200,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 0.95,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        }
      ]
    },
    "pulse-oscillator": {
      "args": {
        "a": 220,
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
          "default": 220,
          "discrete": false,
          "id": 1,
          "max": 16e3,
          "min": 20
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 4,
          "min": 0
        },
        {
          "default": 1e3,
          "discrete": false,
          "id": 1,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 10,
          "discrete": false,
          "id": 2,
          "max": 500,
          "min": 0.01
        }
      ]
    },
    "retrospective-capture": {
      "args": {
        "a": 30,
        "b": 0
      },
      "code": 66,
      "configuration": {
        "capacitySeconds": {
          "argument": "a",
          "default": 30,
          "min": 0
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
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.33,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.4,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
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
          "default": 420,
          "discrete": false,
          "id": 0,
          "max": 2e3,
          "min": 50
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 400,
          "min": 20
        },
        {
          "default": 0.35,
          "discrete": false,
          "id": 2,
          "max": 0.95,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
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
          "default": 180,
          "discrete": false,
          "id": 0,
          "max": 8e3,
          "min": 0.1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 180,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        }
      ]
    },
    "sample-hold": {
      "args": {
        "a": 0
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 2,
          "min": 0
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
          "default": 60,
          "discrete": false,
          "id": 0,
          "max": 84,
          "min": 36
        },
        {
          "default": 1,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 2,
          "max": 0.5,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 2,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.08,
          "discrete": false,
          "id": 9,
          "max": 0.5,
          "min": 0
        },
        {
          "default": 0.01,
          "discrete": false,
          "id": 10,
          "max": 0.2,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 11,
          "max": 4,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 12,
          "max": 100,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 13,
          "max": 1,
          "min": 0
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0.25
        },
        {
          "default": 0,
          "discrete": true,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.08,
          "discrete": false,
          "id": 8,
          "max": 0.5,
          "min": 0
        },
        {
          "default": 1,
          "discrete": true,
          "id": 9,
          "max": 8,
          "min": 1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 10,
          "max": 100,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 11,
          "max": 1,
          "min": 0
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
          "max": 1,
          "min": 0
        },
        {
          "default": 12,
          "discrete": false,
          "id": 1,
          "max": 12,
          "min": -12
        },
        {
          "default": 0.65,
          "discrete": false,
          "id": 2,
          "max": 0.99,
          "min": 0
        },
        {
          "default": 0.45,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 6e3,
          "discrete": false,
          "id": 5,
          "max": 12e3,
          "min": 100
        }
      ]
    },
    "slew-audio": {
      "args": {
        "a": 64,
        "b": 64
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
          "default": 64,
          "discrete": false,
          "id": 0,
          "max": 96e3,
          "min": 1
        },
        {
          "default": 64,
          "discrete": false,
          "id": 1,
          "max": 96e3,
          "min": 1
        }
      ]
    },
    "slew-control": {
      "args": {
        "a": 16,
        "b": 16
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
          "default": 16,
          "discrete": false,
          "id": 0,
          "max": 1024,
          "min": 1
        },
        {
          "default": 16,
          "discrete": false,
          "id": 1,
          "max": 1024,
          "min": 1
        }
      ]
    },
    "spectrum-analyzer": {
      "args": {
        "a": 1,
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 8,
          "min": 0.1
        },
        {
          "default": 0.85,
          "discrete": false,
          "id": 1,
          "max": 0.999,
          "min": 0
        },
        {
          "default": -72,
          "discrete": false,
          "id": 2,
          "max": -12,
          "min": -96
        }
      ]
    },
    "stereo-delay": {
      "args": {
        "a": 250,
        "b": 375
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
          "default": 250,
          "discrete": false,
          "id": 0,
          "max": 5e3,
          "min": 1
        },
        {
          "default": 375,
          "discrete": false,
          "id": 1,
          "max": 5e3,
          "min": 1
        },
        {
          "default": 0.3,
          "discrete": false,
          "id": 2,
          "max": 1.2,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 4e3,
          "discrete": false,
          "id": 5,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 8,
          "max": 1,
          "min": 0
        },
        {
          "default": 1,
          "discrete": false,
          "id": 9,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 10,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 11,
          "max": 1,
          "min": 0
        },
        {
          "default": 0,
          "discrete": true,
          "id": 12,
          "max": 1,
          "min": 0
        },
        {
          "default": 3,
          "discrete": true,
          "id": 13,
          "max": 10,
          "min": 0
        },
        {
          "default": 6,
          "discrete": true,
          "id": 14,
          "max": 10,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 15,
          "max": 300,
          "min": 20
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
          "default": 1,
          "discrete": false,
          "id": 0,
          "max": 2,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 500,
          "min": 20
        },
        {
          "default": 1,
          "discrete": true,
          "id": 2,
          "max": 1,
          "min": 0
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
          "max": 8,
          "min": 0.125
        },
        {
          "default": 0.8,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.3,
          "discrete": false,
          "id": 2,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.2,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.5,
          "discrete": false,
          "id": 4,
          "max": 1,
          "min": 0
        },
        {
          "default": 255,
          "discrete": true,
          "id": 5,
          "max": 255,
          "min": 0
        },
        {
          "default": 120,
          "discrete": false,
          "id": 6,
          "max": 300,
          "min": 20
        },
        {
          "default": 1,
          "discrete": false,
          "id": 7,
          "max": 1,
          "min": 0
        }
      ]
    },
    "sum2": {
      "args": {
        "a": 1,
        "b": 1
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 3,
          "min": 0
        },
        {
          "default": 3200,
          "discrete": false,
          "id": 1,
          "max": 2e4,
          "min": 20
        },
        {
          "default": 0.75,
          "discrete": false,
          "id": 2,
          "max": 2,
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
          "default": 0,
          "discrete": false,
          "id": 0,
          "max": 24,
          "min": -24
        },
        {
          "default": 120,
          "discrete": false,
          "id": 1,
          "max": 400,
          "min": 20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 24,
          "min": -24
        },
        {
          "default": 1e3,
          "discrete": false,
          "id": 3,
          "max": 8e3,
          "min": 120
        },
        {
          "default": 0.7,
          "discrete": false,
          "id": 4,
          "max": 12,
          "min": 0.2
        },
        {
          "default": 0,
          "discrete": false,
          "id": 5,
          "max": 24,
          "min": -24
        },
        {
          "default": 8e3,
          "discrete": false,
          "id": 6,
          "max": 16e3,
          "min": 2e3
        },
        {
          "default": 0,
          "discrete": false,
          "id": 7,
          "max": 24,
          "min": -24
        },
        {
          "default": 1,
          "discrete": false,
          "id": 8,
          "max": 1,
          "min": 0
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
          "max": 1,
          "min": -1
        },
        {
          "default": 0,
          "discrete": false,
          "id": 1,
          "max": 1,
          "min": -1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 2,
          "max": 4,
          "min": 0.1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 3,
          "min": 0
        },
        {
          "default": 0.01,
          "discrete": false,
          "id": 1,
          "max": 2,
          "min": 1e-3
        },
        {
          "default": 0.12,
          "discrete": false,
          "id": 2,
          "max": 2,
          "min": 1e-3
        },
        {
          "default": 0.65,
          "discrete": false,
          "id": 3,
          "max": 1,
          "min": 0
        },
        {
          "default": 0.18,
          "discrete": false,
          "id": 4,
          "max": 3,
          "min": 1e-3
        },
        {
          "default": 0.25,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": 0
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
          "default": 0,
          "discrete": true,
          "id": 0,
          "max": 6,
          "min": 0
        },
        {
          "default": 12,
          "discrete": false,
          "id": 1,
          "max": 40,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 2,
          "max": 20,
          "min": -20
        },
        {
          "default": 0,
          "discrete": false,
          "id": 3,
          "max": 2e4,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 4,
          "max": 2e4,
          "min": 0
        },
        {
          "default": 0,
          "discrete": false,
          "id": 5,
          "max": 1,
          "min": -1
        },
        {
          "default": 1,
          "discrete": false,
          "id": 6,
          "max": 1,
          "min": 0
        },
        {
          "default": 2,
          "discrete": true,
          "id": 7,
          "max": 4,
          "min": 1
        }
      ]
    }
  };

  // packages/manifold-author/node-metadata.js
  var NODE_METADATA = {
    "input.sidechain": {
      category: "Sources & voices",
      description: "Reads an auxiliary host audio input for sidechain processing."
    },
    oscillator: {
      category: "Sources & voices",
      description: "Generates basic pitched waveforms with frequency and level control."
    },
    "extended-oscillator": {
      category: "Sources & voices",
      description: "Generates pitched audio with unison, sync, shaping and additive modes."
    },
    "pulse-oscillator": {
      category: "Sources & voices",
      description: "Generates a pitched pulse wave with adjustable width."
    },
    noise: {
      category: "Sources & voices",
      description: "Generates colored noise as an audio source."
    },
    "midi-input": {
      category: "MIDI",
      description: "Receives host MIDI notes and sends them along MIDI connections."
    },
    "voice-synth": {
      category: "Sources & voices",
      description: "Renders a playable synth voice from note events."
    },
    "sample-instrument": {
      category: "Sources & voices",
      description: "Plays a prepared sample instrument from note events."
    },
    "sample-region": {
      category: "Sources & voices",
      description: "Plays an addressed region of prepared sample audio."
    },
    "main-voice-bank": {
      category: "Sources & voices",
      description: "Combines the voices used by the authored Main instrument."
    },
    adsr: {
      category: "Modulation & CV",
      description: "Generates a control envelope with attack, decay, sustain and release."
    },
    lfo: {
      category: "Modulation & CV",
      description: "Generates a repeating low frequency modulation signal."
    },
    "modulated-gain": {
      category: "Modulation & CV",
      description: "Applies gain controlled by an incoming CV signal."
    },
    "slew-control": {
      category: "Modulation & CV",
      description: "Smooths changes in a control signal over time."
    },
    "attenuverter-bias": {
      category: "Modulation & CV",
      description: "Scales, inverts and offsets a control signal."
    },
    "sample-hold": {
      category: "Modulation & CV",
      description: "Samples or tracks a control signal on trigger events."
    },
    "cv-mix": {
      category: "Modulation & CV",
      description: "Blends control signals together."
    },
    "cv-compare": {
      category: "Modulation & CV",
      description: "Compares control signals and emits the result."
    },
    "cv-range": {
      category: "Modulation & CV",
      description: "Maps a control signal into a chosen range."
    },
    gain: {
      category: "Mix & routing",
      description: "Changes audio level with a live gain parameter."
    },
    "fixed-gain": {
      category: "Mix & routing",
      description: "Multiplies audio by a fixed gain factor."
    },
    sum2: {
      category: "Mix & routing",
      description: "Adds two audio signals together."
    },
    mixer9: {
      category: "Mix & routing",
      description: "Mixes up to nine audio inputs into one output."
    },
    mixer: {
      category: "Mix & routing",
      description: "Mixes multiple audio inputs with level and pan controls."
    },
    crossfader: {
      category: "Mix & routing",
      description: "Blends two audio sources with an equal power curve."
    },
    "stereo-widener": {
      category: "Mix & routing",
      description: "Adjusts the perceived width of a stereo signal."
    },
    "midi-transpose": {
      category: "MIDI",
      description: "Shifts incoming MIDI note pitches."
    },
    svf: {
      category: "Filters & EQ",
      description: "Filters audio with selectable modes, cutoff and resonance."
    },
    "modulated-svf": {
      category: "Filters & EQ",
      description: "Filters audio while CV moves the cutoff frequency."
    },
    "legacy-filter": {
      category: "Filters & EQ",
      description: "Runs the legacy filter response with cutoff and resonance."
    },
    eq8: {
      category: "Filters & EQ",
      description: "Shapes audio with eight configurable EQ bands."
    },
    "phase-vocoder": {
      category: "Time & spectral",
      description: "Shifts pitch or stretches time in the spectral domain."
    },
    granulator: {
      category: "Time & spectral",
      description: "Resynthesizes audio as overlapping grains."
    },
    "loop-capture": {
      category: "Time & spectral",
      description: "Records, plays and overdubs a live audio loop."
    },
    "retrospective-capture": {
      category: "Time & spectral",
      description: "Keeps a rolling audio history for later capture."
    },
    "wave-shaper": {
      category: "Shape & FX",
      description: "Transforms waveform shape with selectable curves and drive."
    },
    distortion: {
      category: "Shape & FX",
      description: "Adds nonlinear saturation with drive and wet mix controls."
    },
    "effect-slot-legacy": {
      category: "Shape & FX",
      description: "Hosts a selectable effect in the legacy Main FX slot."
    },
    "ring-modulator": {
      category: "Shape & FX",
      description: "Multiplies audio by a carrier to create sidebands."
    },
    "audio-fm": {
      category: "Shape & FX",
      description: "Uses an audio signal to modulate another signal's frequency."
    },
    "audio-sync": {
      category: "Shape & FX",
      description: "Synchronizes one audio oscillator to another signal."
    },
    "input.raw": {
      category: "Sources & voices",
      description: "Reads the audio supplied to the device by its host."
    },
    output: {
      category: "Mix & routing",
      description: "Sends the connected audio to the device output."
    },
    compressor: {
      category: "Dynamics",
      description: "Reduces audio above a threshold, with ratio, makeup gain and wet mix. Uses a fixed 10 ms attack and 100 ms release."
    },
    limiter: {
      category: "Dynamics",
      description: "Limits audio peaks to a threshold, with release, makeup gain and soft clipping."
    },
    "stereo-delay": {
      category: "Time & spectral",
      description: "Repeats left and right audio with independent timing, feedback, filtering and tempo sync."
    },
    phaser: {
      category: "Shape & FX",
      description: "Sweeps six or twelve all-pass stages to create moving notches in the sound."
    },
    chorus: {
      category: "Shape & FX",
      description: "Layers modulated delays to thicken audio, with voice count and stereo spread."
    },
    reverb: {
      category: "Time & spectral",
      description: "Adds a stereo room tail with size, damping and independent wet and dry levels."
    },
    "multitap-delay": {
      category: "Time & spectral",
      description: "Repeats audio through up to eight taps, each with its own time, gain and pan."
    },
    "transient-shaper": {
      category: "Dynamics",
      description: "Emphasizes or softens attacks and sustains without changing the input routing."
    },
    "bit-crusher": {
      category: "Shape & FX",
      description: "Reduces sample precision and rate, with optional XOR or gate processing."
    },
    "three-band-eq": {
      category: "Filters & EQ",
      description: "Shapes lows, mids and highs, with mid-band Q, output gain and wet mix."
    },
    "formant-filter": {
      category: "Filters & EQ",
      description: "Shapes audio with vowel resonances, pitch shift, resonance and drive."
    },
    resonator: {
      category: "Filters & EQ",
      description: "Emphasizes a tuned frequency with adjustable gain and resonance."
    },
    "reverse-delay": {
      category: "Time & spectral",
      description: "Replays overlapping sections of audio backwards, with feedback and wet mix."
    },
    stutter: {
      category: "Time & spectral",
      description: "Repeats short rhythmic fragments using a gate, probability and eight-step pattern."
    },
    "pitch-shifter": {
      category: "Time & spectral",
      description: "Shifts audio pitch using overlapping delay windows, with feedback and wet mix."
    },
    shimmer: {
      category: "Time & spectral",
      description: "Adds pitched, modulated delay feedback for a sustained shimmering tail."
    },
    "spectrum-analyzer": {
      category: "Sound analysis",
      description: "Passes audio through and measures eight frequency bands. Per-node graph meters are not yet available."
    },
    "fft-spectrum": {
      category: "Sound analysis",
      description: "Passes audio through and measures its FFT spectrum. Per-node graph meters are not yet available."
    },
    "envelope-follower": {
      category: "Sound analysis",
      description: "Passes audio through while measuring its level. Use Audio envelope when you need a connectable control output."
    },
    "envelope-control": {
      category: "Modulation & CV",
      description: "Turns audio level into a control signal, with attack, release and peak or RMS detection."
    },
    "midi-note-filter": {
      category: "MIDI",
      description: "Passes notes inside or outside a chosen pitch range while tracking held notes."
    },
    "midi-scale-quantizer": {
      category: "MIDI",
      description: "Moves incoming notes onto a musical scale with a chosen root and direction."
    },
    "midi-velocity-mapper": {
      category: "MIDI",
      description: "Reshapes note velocity with amount, curve and offset."
    },
    "midi-arpeggiator": {
      category: "MIDI",
      description: "Turns held notes into a repeating pattern with rate, direction, octaves and gate length."
    },
    constant: {
      category: "Sources & voices",
      description: "Produces a constant-valued audio signal for offsets and signal calculations."
    },
    "linear-blend": {
      category: "Mix & routing",
      description: "Crossfades linearly between two audio inputs."
    },
    "slew-audio": {
      category: "Shape & FX",
      description: "Smooths rising and falling audio samples independently."
    },
    "phrase-gain": {
      category: "Modulation & CV",
      description: "Shapes audio gain from a control envelope relative to a chosen reference level."
    }
  };

  // packages/manifold-author/additional-nodes.js
  var ADDITIONAL_NODES = {
    compressor: {
      label: "Compressor",
      parameters: [
        { id: 0, label: "Threshold (dB)" },
        { id: 1, label: "Ratio" },
        { id: 5, label: "Makeup (dB)" },
        { id: 10, label: "Wet mix" }
      ]
    },
    limiter: {
      label: "Limiter",
      parameters: [
        { id: 0, label: "Threshold (dB)" },
        { id: 1, label: "Release (ms)" },
        { id: 2, label: "Makeup (dB)" },
        { id: 3, label: "Soft clip" },
        { id: 4, label: "Wet mix" }
      ]
    },
    "stereo-delay": {
      label: "Stereo delay",
      parameters: [
        { id: 0, label: "Left time \xB7 ms" },
        { id: 1, label: "Right time \xB7 ms" },
        { id: 2, label: "Feedback" },
        { id: 3, label: "Crossfeed" },
        { id: 4, label: "Feedback lowpass", discrete: true, choices: ["Off", "On"] },
        { id: 5, label: "Filter cutoff (Hz)" },
        { id: 7, label: "Wet mix" },
        { id: 8, label: "Swap tap times", discrete: true, choices: ["Off", "On"] },
        { id: 9, label: "Stereo width" },
        { id: 10, label: "Freeze input", discrete: true, choices: ["Off", "On"] },
        { id: 11, label: "Ducking" },
        { id: 12, label: "Time mode", choices: ["Free", "Sync"], discrete: true },
        {
          id: 13,
          label: "Left division",
          choices: [
            "1/32",
            "1/16",
            "1/8",
            "1/4",
            "1/2",
            "1",
            "dotted 1/8",
            "dotted 1/4",
            "triplet 1/16",
            "triplet 1/8",
            "triplet 1/4"
          ],
          discrete: true
        },
        {
          id: 14,
          label: "Right division",
          choices: [
            "1/32",
            "1/16",
            "1/8",
            "1/4",
            "1/2",
            "1",
            "dotted 1/8",
            "dotted 1/4",
            "triplet 1/16",
            "triplet 1/8",
            "triplet 1/4"
          ],
          discrete: true
        },
        { id: 15, label: "Tempo \xB7 BPM" }
      ]
    },
    phaser: {
      label: "Phaser",
      parameters: [
        { id: 0, label: "Sweep rate" },
        { id: 1, label: "Depth" },
        {
          id: 2,
          label: "Stages",
          choices: ["6 stages", "12 stages"],
          choiceValues: [6, 12],
          discrete: true
        },
        { id: 3, label: "Feedback" },
        { id: 4, label: "Stereo spread" }
      ]
    },
    chorus: {
      label: "Chorus",
      parameters: [
        { id: 0, label: "Sweep rate" },
        { id: 1, label: "Depth" },
        { id: 2, label: "Voices", discrete: true },
        { id: 3, label: "Stereo spread" },
        { id: 4, label: "Feedback" },
        {
          id: 5,
          label: "LFO waveform",
          choices: ["Sine", "Triangle"],
          choiceValues: [0, 1],
          discrete: true
        },
        { id: 6, label: "Dry / wet" }
      ]
    },
    reverb: {
      label: "Reverb",
      parameters: [
        { id: 0, label: "Room size" },
        { id: 1, label: "Damping" },
        { id: 2, label: "Wet" },
        { id: 3, label: "Dry" },
        { id: 4, label: "Wet width" }
      ]
    },
    "multitap-delay": {
      label: "Multitap delay",
      parameters: [
        { id: 0, label: "Active taps", discrete: true },
        { id: 1, label: "Feedback" },
        { id: 2, label: "Wet mix" },
        { id: 3, label: "Tap 1 Time \xB7 ms" },
        { id: 4, label: "Tap 1 Gain" },
        { id: 5, label: "Tap 1 Pan" },
        { id: 6, label: "Tap 2 Time \xB7 ms" },
        { id: 7, label: "Tap 2 Gain" },
        { id: 8, label: "Tap 2 Pan" },
        { id: 9, label: "Tap 3 Time (ms)" },
        { id: 10, label: "Tap 3 Gain" },
        { id: 11, label: "Tap 3 Pan" },
        { id: 12, label: "Tap 4 Time (ms)" },
        { id: 13, label: "Tap 4 Gain" },
        { id: 14, label: "Tap 4 Pan" },
        { id: 15, label: "Tap 5 Time (ms)" },
        { id: 16, label: "Tap 5 Gain" },
        { id: 17, label: "Tap 5 Pan" },
        { id: 18, label: "Tap 6 Time (ms)" },
        { id: 19, label: "Tap 6 Gain" },
        { id: 20, label: "Tap 6 Pan" },
        { id: 21, label: "Tap 7 Time (ms)" },
        { id: 22, label: "Tap 7 Gain" },
        { id: 23, label: "Tap 7 Pan" },
        { id: 24, label: "Tap 8 Time (ms)" },
        { id: 25, label: "Tap 8 Gain" },
        { id: 26, label: "Tap 8 Pan" }
      ]
    },
    "transient-shaper": {
      label: "Transient shaper",
      parameters: [
        { id: 0, label: "Attack" },
        { id: 1, label: "Sustain" },
        { id: 2, label: "Sensitivity" },
        { id: 3, label: "Wet mix" }
      ]
    },
    "bit-crusher": {
      label: "Bit crusher",
      parameters: [
        { id: 0, label: "Bit depth" },
        { id: 1, label: "Sample hold" },
        { id: 2, label: "Wet mix" },
        { id: 3, label: "Output gain" },
        { id: 4, label: "Logic mode", choices: ["Normal", "XOR", "Gate"], discrete: true }
      ]
    },
    "three-band-eq": {
      label: "Three-band EQ",
      parameters: [
        { id: 0, label: "Low gain" },
        { id: 1, label: "Low frequency" },
        { id: 2, label: "Mid gain" },
        { id: 3, label: "Mid frequency" },
        { id: 4, label: "Mid Q" },
        { id: 5, label: "High gain" },
        { id: 6, label: "High frequency" },
        { id: 7, label: "Output trim" },
        { id: 8, label: "Wet mix" }
      ]
    },
    "formant-filter": {
      label: "Formant filter",
      parameters: [
        { id: 0, label: "Vowel position" },
        { id: 1, label: "Shift (semitones)" },
        { id: 2, label: "Resonance Q" },
        { id: 3, label: "Drive" },
        { id: 4, label: "Wet mix" }
      ]
    },
    resonator: {
      label: "Resonator",
      parameters: [
        { id: 0, label: "Gain" },
        { id: 1, label: "Frequency (Hz)" },
        { id: 2, label: "Q" }
      ]
    },
    "reverse-delay": {
      label: "Reverse delay",
      parameters: [
        { id: 0, label: "Delay time (ms)" },
        { id: 1, label: "Reverse window (ms)" },
        { id: 2, label: "Feedback" },
        { id: 3, label: "Wet mix" }
      ]
    },
    stutter: {
      label: "Stutter",
      parameters: [
        { id: 0, label: "Length" },
        { id: 1, label: "Gate" },
        { id: 2, label: "Filter decay" },
        { id: 3, label: "Pitch decay" },
        { id: 4, label: "Probability" },
        { id: 5, label: "Pattern mask", discrete: true },
        { id: 6, label: "Tempo" },
        { id: 7, label: "Wet mix" }
      ]
    },
    "pitch-shifter": {
      label: "Pitch shifter",
      parameters: [
        { id: 0, label: "Pitch (semitones)" },
        { id: 1, label: "Window (ms)" },
        { id: 2, label: "Feedback" },
        { id: 3, label: "Wet mix" }
      ]
    },
    shimmer: {
      label: "Shimmer",
      parameters: [
        { id: 0, label: "Delay size" },
        { id: 1, label: "Pitch" },
        { id: 2, label: "Feedback" },
        { id: 3, label: "Wet mix" },
        { id: 4, label: "Modulation" },
        { id: 5, label: "Feedback filter (Hz)" }
      ]
    },
    "spectrum-analyzer": {
      label: "Spectrum analyzer",
      parameters: [
        { id: 0, label: "Sensitivity" },
        { id: 1, label: "Smoothing" },
        { id: 2, label: "Floor (dB)" }
      ]
    },
    "fft-spectrum": {
      label: "FFT spectrum",
      parameters: [
        { id: 0, label: "Smoothing" },
        { id: 1, label: "Floor (dB)" }
      ]
    },
    "envelope-follower": {
      label: "Envelope follower",
      parameters: [
        { id: 0, label: "Attack (ms)" },
        { id: 1, label: "Release (ms)" },
        { id: 2, label: "Sensitivity" },
        { id: 3, label: "Highpass (Hz)" },
        { id: 4, label: "Detector", choices: ["Peak", "RMS", "Hybrid"], discrete: true }
      ]
    },
    "envelope-control": {
      label: "Audio envelope",
      parameters: [
        { id: 0, label: "Attack (ms)" },
        { id: 1, label: "Release (ms)" },
        { id: 2, label: "Sensitivity" },
        { id: 3, label: "Highpass (Hz)" },
        { id: 4, label: "Detector", choices: ["Peak", "RMS", "Hybrid"], discrete: true }
      ]
    },
    "midi-note-filter": {
      label: "MIDI note filter",
      parameters: [
        { id: 0, label: "Low note", discrete: true },
        { id: 1, label: "High note", discrete: true },
        {
          id: 2,
          label: "Pass range",
          choices: ["Inside", "Outside"],
          choiceValues: [0, 1],
          discrete: true
        }
      ]
    },
    "midi-scale-quantizer": {
      label: "MIDI scale quantizer",
      parameters: [
        {
          id: 0,
          label: "Root note",
          choices: ["C", "C\u266F", "D", "D\u266F", "E", "F", "F\u266F", "G", "G\u266F", "A", "A\u266F", "B"],
          choiceValues: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          discrete: true
        },
        {
          id: 1,
          label: "Scale",
          choices: ["Major", "Minor", "Dorian", "Mixolydian", "Pentatonic", "Chromatic"],
          choiceValues: [1, 2, 3, 4, 5, 6],
          discrete: true
        },
        {
          id: 2,
          label: "Direction",
          choices: ["Nearest", "Up", "Down"],
          choiceValues: [1, 2, 3],
          discrete: true
        }
      ]
    },
    "midi-velocity-mapper": {
      label: "MIDI velocity mapper",
      parameters: [
        { id: 0, label: "Amount" },
        {
          id: 1,
          label: "Curve",
          choices: ["Linear", "Soft", "Hard"],
          choiceValues: [0, 1, 2],
          discrete: true
        },
        { id: 2, label: "Offset" }
      ]
    },
    "midi-arpeggiator": {
      label: "MIDI arpeggiator",
      parameters: [
        { id: 0, label: "Rate" },
        {
          id: 1,
          label: "Mode",
          choices: ["Up", "Down", "Ping-pong", "Random"],
          choiceValues: [0, 1, 2, 3],
          discrete: true
        },
        {
          id: 2,
          label: "Octaves",
          choices: ["1", "2", "3", "4"],
          choiceValues: [1, 2, 3, 4],
          discrete: true
        },
        { id: 3, label: "Gate length" },
        { id: 4, label: "Hold", choices: ["Off", "On"], choiceValues: [0, 1], discrete: true }
      ]
    },
    constant: {
      label: "Constant signal",
      parameters: [{ id: 0, label: "Value" }]
    },
    "linear-blend": {
      label: "Linear blend",
      parameters: [{ id: 0, label: "Mix" }]
    },
    "slew-audio": {
      label: "Audio slew",
      parameters: [
        { id: 0, label: "Rise samples" },
        { id: 1, label: "Fall samples" }
      ]
    },
    "phrase-gain": {
      label: "Phrase gain",
      parameters: [
        { id: 0, label: "Amount" },
        { id: 1, label: "Reference level" }
      ]
    }
  };

  // packages/manifold-author/parameter-names.js
  var PARAMETER_NAMES = {
    "adsr": {
      "0": "attack",
      "1": "decay",
      "2": "sustain",
      "3": "release",
      "4": "gate",
      "5": "retriggerSequence"
    },
    "gain": {
      "0": "level"
    },
    "distortion": {
      "0": "drive",
      "1": "wetMix",
      "2": "output"
    },
    "svf": {
      "0": "mode",
      "1": "cutoff",
      "2": "resonance"
    },
    "modulated-svf": {
      "0": "mode",
      "1": "cutoff",
      "2": "resonance",
      "3": "cvDepthHz"
    },
    "effect-slot-legacy": {
      "0": "effect",
      "1": "mix",
      "2": "p1",
      "3": "p2",
      "4": "p3",
      "5": "p4",
      "6": "p5"
    },
    "eq8": {
      "0": "band1Enabled",
      "1": "band1Curve",
      "2": "band1Frequency",
      "3": "band1GainDb",
      "4": "band1Q",
      "5": "band2Enabled",
      "6": "band2Curve",
      "7": "band2Frequency",
      "8": "band2GainDb",
      "9": "band2Q",
      "10": "band3Enabled",
      "11": "band3Curve",
      "12": "band3Frequency",
      "13": "band3GainDb",
      "14": "band3Q",
      "15": "band4Enabled",
      "16": "band4Curve",
      "17": "band4Frequency",
      "18": "band4GainDb",
      "19": "band4Q",
      "20": "band5Enabled",
      "21": "band5Curve",
      "22": "band5Frequency",
      "23": "band5GainDb",
      "24": "band5Q",
      "25": "band6Enabled",
      "26": "band6Curve",
      "27": "band6Frequency",
      "28": "band6GainDb",
      "29": "band6Q",
      "30": "band7Enabled",
      "31": "band7Curve",
      "32": "band7Frequency",
      "33": "band7GainDb",
      "34": "band7Q",
      "35": "band8Enabled",
      "36": "band8Curve",
      "37": "band8Frequency",
      "38": "band8GainDb",
      "39": "band8Q",
      "40": "outputDb",
      "41": "mix"
    },
    "wave-shaper": {
      "0": "curve",
      "1": "driveDb",
      "2": "outputDb",
      "3": "preFilterHz",
      "4": "postFilterHz",
      "5": "bias",
      "6": "wetMix",
      "7": "legacyToneFactor"
    },
    "legacy-filter": {
      "0": "cutoffHz",
      "1": "resonance",
      "2": "wetMix"
    },
    "mixer9": {
      "0": "masterLevel"
    },
    "mixer": {
      "0": "masterLevel",
      "1": "input1Gain",
      "2": "input2Gain",
      "3": "input3Gain",
      "4": "input4Gain",
      "5": "input5Gain",
      "6": "input6Gain",
      "7": "input7Gain",
      "8": "input8Gain",
      "9": "input9Gain",
      "10": "input10Gain",
      "11": "input11Gain",
      "12": "input12Gain",
      "13": "input13Gain",
      "14": "input14Gain",
      "15": "input15Gain",
      "16": "input16Gain",
      "17": "input17Gain",
      "18": "input18Gain",
      "19": "input19Gain",
      "20": "input20Gain",
      "21": "input21Gain",
      "22": "input22Gain",
      "23": "input23Gain",
      "24": "input24Gain",
      "25": "input25Gain",
      "26": "input26Gain",
      "27": "input27Gain",
      "28": "input28Gain",
      "29": "input29Gain",
      "30": "input30Gain",
      "31": "input31Gain",
      "32": "input32Gain",
      "33": "input1Pan",
      "34": "input2Pan",
      "35": "input3Pan",
      "36": "input4Pan",
      "37": "input5Pan",
      "38": "input6Pan",
      "39": "input7Pan",
      "40": "input8Pan",
      "41": "input9Pan",
      "42": "input10Pan",
      "43": "input11Pan",
      "44": "input12Pan",
      "45": "input13Pan",
      "46": "input14Pan",
      "47": "input15Pan",
      "48": "input16Pan",
      "49": "input17Pan",
      "50": "input18Pan",
      "51": "input19Pan",
      "52": "input20Pan",
      "53": "input21Pan",
      "54": "input22Pan",
      "55": "input23Pan",
      "56": "input24Pan",
      "57": "input25Pan",
      "58": "input26Pan",
      "59": "input27Pan",
      "60": "input28Pan",
      "61": "input29Pan",
      "62": "input30Pan",
      "63": "input31Pan",
      "64": "input32Pan"
    },
    "phase-vocoder": {
      "0": "mode",
      "1": "pitchSemitones",
      "2": "timeStretch",
      "3": "wetMix",
      "4": "fftOrder"
    },
    "crossfader": {
      "0": "position",
      "1": "curve",
      "2": "wetMix"
    },
    "ring-modulator": {
      "0": "carrierHz",
      "1": "depth",
      "2": "wetMix",
      "3": "spread",
      "4": "enabled"
    },
    "audio-fm": {
      "0": "amount",
      "1": "wetMix"
    },
    "audio-sync": {
      "0": "hardness",
      "1": "wetMix"
    },
    "loop-capture": {
      "0": "record",
      "1": "play",
      "2": "overdub",
      "3": "speed",
      "4": "reverse",
      "5": "loopMix",
      "6": "overdubLevel"
    },
    "oscillator": {
      "0": "waveform",
      "1": "frequency",
      "2": "level"
    },
    "extended-oscillator": {
      "0": "waveform",
      "1": "frequency",
      "2": "level",
      "3": "syncEnabled",
      "4": "pulseWidth",
      "5": "drive",
      "6": "driveShape",
      "7": "driveBias",
      "8": "driveMix",
      "9": "retriggerOnLevelRise",
      "10": "unisonVoices",
      "11": "detuneCents",
      "12": "stereoSpread",
      "13": "renderMode",
      "14": "additivePartials",
      "15": "additiveTilt",
      "16": "additiveDrift"
    },
    "pulse-oscillator": {
      "1": "frequency",
      "2": "level",
      "4": "pulseWidth"
    },
    "noise": {
      "0": "level",
      "1": "color"
    },
    "lfo": {
      "0": "waveform",
      "1": "rate"
    },
    "modulated-gain": {
      "0": "base",
      "1": "depth"
    },
    "slew-control": {
      "0": "riseSamples",
      "1": "fallSamples"
    },
    "attenuverter-bias": {
      "0": "amount",
      "1": "bias"
    },
    "sample-hold": {
      "0": "mode"
    },
    "cv-mix": {
      "0": "input1",
      "1": "input2",
      "2": "input3",
      "3": "input4",
      "4": "offset"
    },
    "cv-compare": {
      "0": "direction",
      "1": "threshold",
      "2": "hysteresis"
    },
    "cv-range": {
      "0": "minimum",
      "1": "maximum",
      "2": "mode"
    },
    "stereo-widener": {
      "0": "width",
      "1": "monoLowCutoff",
      "2": "monoLow"
    },
    "midi-transpose": {
      "0": "semitones"
    },
    "voice-synth": {
      "0": "waveform",
      "1": "attack",
      "2": "decay",
      "3": "sustain",
      "4": "release",
      "5": "level"
    },
    "sample-instrument": {
      "0": "rootNote",
      "1": "keyTracking",
      "2": "level",
      "3": "speed",
      "4": "reverse",
      "5": "oneShot",
      "6": "playStart",
      "7": "loopStart",
      "8": "loopEnd",
      "9": "crossfade",
      "10": "release",
      "11": "unison",
      "12": "detune",
      "13": "spread"
    },
    "sample-region": {
      "0": "speed",
      "1": "reverse",
      "2": "oneShot",
      "3": "playStart",
      "4": "loopStart",
      "5": "loopEnd",
      "8": "crossfade",
      "9": "unison",
      "10": "detune",
      "11": "spread"
    },
    "granulator": {
      "0": "grainSize",
      "1": "density",
      "2": "position",
      "3": "pitch",
      "4": "spray",
      "5": "wetMix",
      "6": "freeze",
      "7": "envelope",
      "8": "enabled",
      "9": "regionStart",
      "10": "regionEnd"
    },
    "main-voice-bank": {
      "0": "waveShape",
      "1": "waveSample",
      "2": "sampleRoot",
      "3": "keytrack",
      "4": "samplePitch",
      "5": "pitchEngine",
      "6": "blendMode",
      "7": "directionDepth",
      "8": "waveToSample",
      "9": "sampleToWave",
      "10": "syncRetrigger",
      "11": "attack",
      "12": "decay",
      "13": "sustain",
      "14": "release",
      "15": "output",
      "16": "vocoderTime",
      "17": "phraseContour",
      "18": "phraseReference",
      "19": "addWaveSource"
    },
    "compressor": {
      "0": "thresholdDb",
      "1": "ratio",
      "5": "makeupDb",
      "10": "mix"
    },
    "limiter": {
      "0": "thresholdDb",
      "1": "releaseMs",
      "2": "makeupDb",
      "3": "softClip",
      "4": "mix"
    },
    "stereo-delay": {
      "0": "leftTimeMs",
      "1": "rightTimeMs",
      "2": "feedback",
      "3": "crossfeed",
      "4": "lowpassEnabled",
      "5": "cutoffHz",
      "7": "mix",
      "8": "pingPong",
      "9": "width",
      "10": "freeze",
      "11": "ducking",
      "12": "tempoSync",
      "13": "leftDivision",
      "14": "rightDivision",
      "15": "tempoBpm"
    },
    "phaser": {
      "0": "rateHz",
      "1": "depth",
      "2": "stages",
      "3": "feedback",
      "4": "spreadDegrees"
    },
    "chorus": {
      "0": "rateHz",
      "1": "depth",
      "2": "voices",
      "3": "spread",
      "4": "feedback",
      "5": "waveform",
      "6": "mix"
    },
    "reverb": {
      "0": "roomSize",
      "1": "damping",
      "2": "wet",
      "3": "dry",
      "4": "width"
    },
    "multitap-delay": {
      "0": "taps",
      "1": "feedback",
      "2": "mix",
      "3": "tap1TimeMs",
      "4": "tap1Gain",
      "5": "tap1Pan",
      "6": "tap2TimeMs",
      "7": "tap2Gain",
      "8": "tap2Pan",
      "9": "tap3TimeMs",
      "10": "tap3Gain",
      "11": "tap3Pan",
      "12": "tap4TimeMs",
      "13": "tap4Gain",
      "14": "tap4Pan",
      "15": "tap5TimeMs",
      "16": "tap5Gain",
      "17": "tap5Pan",
      "18": "tap6TimeMs",
      "19": "tap6Gain",
      "20": "tap6Pan",
      "21": "tap7TimeMs",
      "22": "tap7Gain",
      "23": "tap7Pan",
      "24": "tap8TimeMs",
      "25": "tap8Gain",
      "26": "tap8Pan"
    },
    "transient-shaper": {
      "0": "attack",
      "1": "sustain",
      "2": "sensitivity",
      "3": "mix"
    },
    "bit-crusher": {
      "0": "bits",
      "1": "rateReduction",
      "2": "mix",
      "3": "output",
      "4": "logic"
    },
    "three-band-eq": {
      "0": "lowGainDb",
      "1": "lowFrequencyHz",
      "2": "midGainDb",
      "3": "midFrequencyHz",
      "4": "midQ",
      "5": "highGainDb",
      "6": "highFrequencyHz",
      "7": "outputDb",
      "8": "mix"
    },
    "formant-filter": {
      "0": "vowel",
      "1": "shiftSemitones",
      "2": "resonance",
      "3": "drive",
      "4": "mix"
    },
    "resonator": {
      "0": "gain",
      "1": "frequencyHz",
      "2": "q"
    },
    "reverse-delay": {
      "0": "timeMs",
      "1": "windowMs",
      "2": "feedback",
      "3": "mix"
    },
    "stutter": {
      "0": "lengthBeats",
      "1": "gate",
      "2": "filterDecay",
      "3": "pitchDecay",
      "4": "probability",
      "5": "pattern",
      "6": "tempoBpm",
      "7": "mix"
    },
    "pitch-shifter": {
      "0": "pitchSemitones",
      "1": "windowMs",
      "2": "feedback",
      "3": "mix"
    },
    "shimmer": {
      "0": "size",
      "1": "pitchSemitones",
      "2": "feedback",
      "3": "mix",
      "4": "modulation",
      "5": "cutoffHz"
    },
    "spectrum-analyzer": {
      "0": "sensitivity",
      "1": "smoothing",
      "2": "floorDb"
    },
    "fft-spectrum": {
      "0": "smoothing",
      "1": "floorDb"
    },
    "envelope-follower": {
      "0": "attackMs",
      "1": "releaseMs",
      "2": "sensitivity",
      "3": "highpassHz",
      "4": "mode"
    },
    "envelope-control": {
      "0": "attackMs",
      "1": "releaseMs",
      "2": "sensitivity",
      "3": "highpassHz",
      "4": "mode"
    },
    "midi-note-filter": {
      "0": "lowNote",
      "1": "highNote",
      "2": "rangeMode"
    },
    "midi-scale-quantizer": {
      "0": "root",
      "1": "scale",
      "2": "direction"
    },
    "midi-velocity-mapper": {
      "0": "amount",
      "1": "curve",
      "2": "offset"
    },
    "midi-arpeggiator": {
      "0": "rateHz",
      "1": "direction",
      "2": "octaves",
      "3": "gate",
      "4": "hold"
    },
    "constant": {
      "0": "value"
    },
    "linear-blend": {
      "0": "mix"
    },
    "slew-audio": {
      "0": "riseSamples",
      "1": "fallSamples"
    },
    "phrase-gain": {
      "0": "amount",
      "1": "reference"
    }
  };

  // packages/manifold-author/workspace-types.js
  var VISUAL_NAMES = [
    "CHORUS",
    "PHASER",
    "WAVESHAPER",
    "COMPRESSOR",
    "STEREO WIDENER",
    "FILTER",
    "SVF FILTER",
    "REVERB",
    "STEREO DELAY",
    "MULTITAP",
    "PITCH SHIFT",
    "GRANULATOR",
    "RING MOD",
    "FORMANT",
    "EQ",
    "LIMITER",
    "TRANSIENT",
    "BITCRUSHER",
    "SHIMMER",
    "REVERSE DELAY",
    "STUTTER"
  ];
  var EQ_CURVES = ["Bell", "Low shelf", "High shelf", "Low pass", "High pass", "Notch", "Band pass"];
  var EQ_PARAMETERS = Array.from({ length: 8 }, (_, band) => [
    { id: band * 5, label: `Band ${band + 1} on`, choices: ["Off", "On"] },
    { id: band * 5 + 1, label: `Band ${band + 1} curve`, choices: EQ_CURVES },
    { id: band * 5 + 2, label: `Band ${band + 1} Hz` },
    { id: band * 5 + 3, label: `Band ${band + 1} dB` },
    { id: band * 5 + 4, label: `Band ${band + 1} Q` }
  ]).flat().concat([
    { id: 40, label: "Output dB" },
    { id: 41, label: "Mix" }
  ]);
  var NODE_PRESENTATION = {
    ...ADDITIONAL_NODES,
    adsr: { label: "ADSR", parameters: [{ id: 0, label: "Attack" }, { id: 1, label: "Decay" }, { id: 2, label: "Sustain" }, { id: 3, label: "Release" }, { id: 4, label: "Gate", choices: ["Off", "On"] }, { id: 5, label: "Retrigger sequence", discrete: true }] },
    "input.raw": { label: "Live input", fixedId: 1 },
    "input.sidechain": { label: "Sidechain input" },
    output: { label: "Output", fixedId: 3 },
    gain: {
      label: "Gain",
      parameters: [{ id: 0, name: "level", label: "Level" }]
    },
    "fixed-gain": { label: "Fixed gain \xD74" },
    distortion: {
      label: "Distortion",
      parameters: [
        { id: 0, label: "Drive" },
        { id: 1, label: "Wet mix" },
        { id: 2, label: "Output" }
      ]
    },
    svf: {
      label: "SVF filter",
      parameters: [
        { id: 0, label: "Mode", choices: ["Low pass", "Band pass", "High pass", "Notch"] },
        { id: 1, label: "Cutoff" },
        { id: 2, label: "Resonance" }
      ]
    },
    "modulated-svf": { label: "CV filter", parameters: [
      { id: 0, label: "Mode", choices: ["Low pass", "Band pass", "High pass", "Notch"] },
      { id: 1, label: "Cutoff" },
      { id: 2, label: "Resonance" },
      { id: 3, label: "CV depth Hz" }
    ] },
    "effect-slot-legacy": { label: "Main FX slot", parameters: [
      { id: 0, label: "Effect", choices: VISUAL_NAMES },
      { id: 1, label: "Mix" },
      ...Array.from({ length: 5 }, (_, index) => ({
        id: index + 2,
        label: `P${index + 1}`
      }))
    ] },
    eq8: {
      label: "Eight-band EQ",
      parameters: EQ_PARAMETERS
    },
    "wave-shaper": { label: "WaveShaper", parameters: [
      { id: 0, label: "Curve", choices: ["Tanh", "Asymmetric", "Arctangent", "Hard clip", "Fold", "Soft clip", "Diode"] },
      { id: 1, label: "Drive dB" },
      { id: 2, label: "Output dB" },
      { id: 3, label: "Pre-filter Hz (0 disables)" },
      { id: 4, label: "Post-filter Hz (0 disables)" },
      { id: 5, label: "Bias" },
      { id: 6, label: "Wet mix" },
      { id: 7, label: "Legacy tone factor (source: 1, 2 or 4)", discrete: true }
    ] },
    "legacy-filter": { label: "Legacy Filter", parameters: [
      { id: 0, label: "Cutoff Hz" },
      { id: 1, label: "Resonance" },
      { id: 2, label: "Wet mix" }
    ] },
    sum2: { label: "Audio sum" },
    mixer9: { label: "Nine-input mixer", parameters: [{ id: 0, label: "Master level" }] },
    mixer: { label: "Mixer", parameters: [
      { id: 0, label: "Master level" },
      ...Array.from({ length: 32 }, (_, index) => ({ id: index + 1, label: `Input ${index + 1} gain` })),
      ...Array.from({ length: 32 }, (_, index) => ({ id: index + 33, label: `Input ${index + 1} pan` }))
    ] },
    "phase-vocoder": { label: "Phase vocoder", parameters: [
      { id: 0, label: "Mode", choices: ["Bin mapping", "Stretch then resample"] },
      { id: 1, label: "Pitch semitones" },
      { id: 2, label: "Time stretch" },
      { id: 3, label: "Wet mix" },
      {
        id: 4,
        label: "FFT order (prepare only)",
        choices: ["512", "1024", "2048", "4096"],
        choiceValues: [9, 10, 11, 12]
      }
    ] },
    crossfader: { label: "Equal-power crossfader", parameters: [
      { id: 0, label: "Position" },
      { id: 1, label: "Curve" },
      { id: 2, label: "Wet mix" }
    ] },
    "ring-modulator": { label: "Ring modulator", parameters: [
      { id: 0, label: "Carrier Hz" },
      { id: 1, label: "Depth" },
      { id: 2, label: "Wet mix" },
      { id: 3, label: "Spread" },
      { id: 4, label: "Enabled", choices: ["Off", "On"] }
    ] },
    "audio-fm": { label: "Audio FM", parameters: [
      { id: 0, label: "Amount" },
      { id: 1, label: "Wet mix" }
    ] },
    "audio-sync": { label: "Audio sync", parameters: [
      { id: 0, label: "Hardness" },
      { id: 1, label: "Wet mix" }
    ] },
    "loop-capture": {
      label: "Loop capture",
      parameters: [
        { id: 0, label: "Record", choices: ["Stopped", "Recording"] },
        { id: 1, label: "Play", choices: ["Off", "On"] },
        { id: 2, label: "Overdub", choices: ["Off", "On"] },
        { id: 3, label: "Speed" },
        { id: 4, label: "Reverse", choices: ["Forward", "Reverse"] },
        { id: 5, label: "Loop mix" },
        { id: 6, label: "Overdub level" }
      ]
    },
    "retrospective-capture": { label: "Retrospective capture" },
    oscillator: {
      label: "Oscillator",
      parameters: [
        { id: 0, name: "waveform", label: "Waveform", choices: ["Sine", "Saw", "Square", "Triangle", "Blend"] },
        { id: 1, name: "frequency", label: "Frequency" },
        { id: 2, name: "level", label: "Level" }
      ]
    },
    "extended-oscillator": {
      label: "Extended oscillator",
      parameters: [
        { id: 0, label: "Waveform", choices: ["Sine", "Saw", "Square", "Triangle", "Blend", "Noise", "Pulse", "Supersaw"] },
        { id: 1, label: "Frequency" },
        { id: 2, label: "Level" },
        { id: 3, label: "Sync enabled", choices: ["Free", "Sync"] },
        { id: 4, label: "Pulse width" },
        { id: 5, label: "Drive" },
        { id: 6, label: "Drive shape", choices: ["Tanh", "Atan", "Clip", "Fold"] },
        { id: 7, label: "Drive bias" },
        { id: 8, label: "Drive mix" },
        { id: 9, label: "Retrigger on level rise", choices: ["Off", "On"] },
        { id: 10, label: "Unison voices" },
        { id: 11, label: "Detune cents" },
        { id: 12, label: "Stereo spread" },
        { id: 13, label: "Render mode", choices: ["Standard", "Additive"] },
        { id: 14, label: "Additive partials" },
        { id: 15, label: "Additive tilt" },
        { id: 16, label: "Additive drift" }
      ]
    },
    "pulse-oscillator": {
      label: "Pulse oscillator",
      parameters: [
        { id: 1, label: "Frequency" },
        { id: 2, label: "Level" },
        { id: 4, label: "Pulse width" }
      ]
    },
    noise: {
      label: "Noise",
      parameters: [
        { id: 0, label: "Level" },
        { id: 1, label: "Color" }
      ]
    },
    lfo: {
      label: "LFO",
      parameters: [
        { id: 0, name: "waveform", label: "Waveform", choices: ["Sine", "Triangle", "Square"] },
        { id: 1, name: "rate", label: "Rate" }
      ]
    },
    "modulated-gain": {
      label: "CV gain",
      parameters: [
        { id: 0, name: "base", label: "Base" },
        { id: 1, name: "depth", label: "Depth" }
      ]
    },
    "slew-control": {
      label: "CV slew",
      parameters: [{ id: 0, label: "Rise samples" }, { id: 1, label: "Fall samples" }]
    },
    "attenuverter-bias": {
      label: "Attenuverter / bias",
      parameters: [{ id: 0, label: "Amount" }, { id: 1, label: "Bias" }]
    },
    "sample-hold": {
      label: "Sample / hold",
      parameters: [{ id: 0, label: "Mode", choices: ["Sample", "Track", "12-step"] }]
    },
    "cv-mix": {
      label: "CV mixer",
      parameters: [
        { id: 0, label: "Input 1" },
        { id: 1, label: "Input 2" },
        { id: 2, label: "Input 3" },
        { id: 3, label: "Input 4" },
        { id: 4, label: "Offset" }
      ]
    },
    "cv-compare": {
      label: "CV compare",
      parameters: [
        { id: 0, label: "Direction", choices: ["Rise", "Fall", "Both"] },
        { id: 1, label: "Threshold" },
        { id: 2, label: "Hysteresis" }
      ]
    },
    "cv-range": {
      label: "CV range",
      parameters: [
        { id: 0, label: "Minimum" },
        { id: 1, label: "Maximum" },
        { id: 2, label: "Mode", choices: ["Clamp", "Remap"] }
      ]
    },
    "stereo-widener": {
      label: "Stereo widener",
      parameters: [
        { id: 0, label: "Width" },
        { id: 1, label: "Mono low cutoff" },
        { id: 2, label: "Mono low", choices: ["Off", "On"] }
      ]
    },
    "midi-input": { label: "MIDI input" },
    "midi-transpose": {
      label: "MIDI transpose",
      parameters: [{ id: 0, label: "Semitones" }]
    },
    "voice-synth": {
      label: "Voice synth",
      parameters: [
        { id: 0, label: "Waveform", choices: ["Sine", "Saw", "Square", "Triangle"] },
        { id: 1, label: "Attack" },
        { id: 2, label: "Decay" },
        { id: 3, label: "Sustain" },
        { id: 4, label: "Release" },
        { id: 5, label: "Level" }
      ]
    },
    "sample-instrument": {
      label: "Sample instrument",
      parameters: [
        { id: 0, label: "Root note" },
        { id: 1, label: "Key tracking" },
        { id: 2, label: "Level" },
        { id: 3, label: "Speed" },
        { id: 4, label: "Reverse", choices: ["Forward", "Reverse"] },
        { id: 5, label: "One shot", choices: ["Loop", "One shot"] },
        { id: 6, label: "Play start" },
        { id: 7, label: "Loop start" },
        { id: 8, label: "Loop end" },
        { id: 9, label: "Crossfade" },
        { id: 10, label: "Release" },
        { id: 11, label: "Unison" },
        { id: 12, label: "Detune" },
        { id: 13, label: "Spread" }
      ]
    },
    "sample-region": {
      label: "Sample region",
      parameters: [
        { id: 0, label: "Speed" },
        { id: 1, label: "Reverse", choices: ["Forward", "Reverse"] },
        { id: 2, label: "One shot", choices: ["Loop", "One shot"] },
        { id: 3, label: "Play start" },
        { id: 4, label: "Loop start" },
        { id: 5, label: "Loop end" },
        { id: 8, label: "Crossfade" },
        { id: 9, label: "Unison", choices: ["1", "2", "3", "4", "5", "6", "7", "8"], choiceValues: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: 10, label: "Detune" },
        { id: 11, label: "Spread" }
      ]
    },
    granulator: {
      label: "Granulator",
      parameters: [
        { id: 0, label: "Grain size" },
        { id: 1, label: "Density" },
        { id: 2, label: "Position" },
        { id: 3, label: "Pitch" },
        { id: 4, label: "Spray" },
        { id: 5, label: "Wet mix" },
        { id: 6, label: "Freeze", choices: ["Capture", "Freeze"] },
        { id: 7, label: "Envelope", choices: ["Hann", "Triangle", "Blackman", "Tukey", "Rectangle"] },
        { id: 8, label: "Enabled", choices: ["Off", "On"] },
        { id: 9, label: "Region start" },
        { id: 10, label: "Region end" }
      ]
    },
    "main-voice-bank": {
      label: "Main voice bank",
      parameters: [
        { id: 0, label: "Wave shape", choices: ["Sine", "Saw", "Square", "Triangle", "Sine + saw"] },
        { id: 1, label: "Wave / sample" },
        { id: 2, label: "Sample root" },
        { id: 3, label: "Keytrack", choices: ["Wave", "Sample", "Both"] },
        { id: 4, label: "Sample pitch" },
        { id: 5, label: "Pitch engine", choices: ["Classic", "Vocoder", "Vocoder HQ"] },
        { id: 6, label: "Blend mode", choices: ["Normal", "Ring", "FM", "Sync", "Add", "Morph"] },
        { id: 7, label: "Direction depth" },
        { id: 8, label: "Wave to sample" },
        { id: 9, label: "Sample to wave" },
        { id: 10, label: "Sync retrigger", choices: ["Off", "On"] },
        { id: 11, label: "Attack" },
        { id: 12, label: "Decay" },
        { id: 13, label: "Sustain" },
        { id: 14, label: "Release" },
        { id: 15, label: "Output" },
        { id: 16, label: "Vocoder time" },
        { id: 17, label: "Phrase contour" },
        { id: 18, label: "Phrase reference" },
        { id: 19, label: "Add wave source", choices: ["Prepared partials", "Original additive"] }
      ]
    }
  };
  if (Object.keys(NODE_PRESENTATION).length !== Object.keys(PORT_CATALOG).length) {
    throw new Error("Presentation and Rust primitive catalogs differ");
  }
  var WORKSPACE_TYPES = Object.fromEntries(Object.entries(NODE_PRESENTATION).map(([id, spec]) => {
    const ports = PORT_CATALOG[id];
    if (!ports) throw new Error(`Missing Rust port metadata for ${id}`);
    const labels = new Map((spec.parameters ?? []).map((parameter) => [parameter.id, parameter]));
    if (labels.size !== ports.parameters.length) throw new Error(`Parameter count differs for ${id}`);
    const parameters = ports.parameters.map((contract) => {
      const display = labels.get(contract.id);
      const choiceValues = display?.choices?.map((_, index) => display.choiceValues?.[index] ?? index);
      if (!display || Boolean(display.choices || display.discrete) !== contract.discrete || choiceValues && (choiceValues.length !== display.choices.length || choiceValues[0] !== contract.min || choiceValues.at(-1) !== contract.max || choiceValues.some((value, index) => !Number.isInteger(value) || value < contract.min || value > contract.max || index > 0 && value <= choiceValues[index - 1]))) {
        throw new Error(`Parameter contract differs for ${id}:${contract.id}`);
      }
      const name = PARAMETER_NAMES[id]?.[contract.id];
      if (!name) throw new Error(`Missing author parameter name for ${id}:${contract.id}`);
      return { ...contract, ...display, name };
    });
    if (!NODE_METADATA[id]) throw new Error(`Missing node description for ${id}`);
    return [id, {
      ...NODE_METADATA[id],
      label: spec.label,
      ...spec.fixedId === void 0 ? {} : { fixedId: spec.fixedId },
      ...parameters.length ? { parameters } : {},
      code: ports.code,
      args: ports.args,
      configuration: ports.configuration,
      inputs: ports.inputs.map((port) => port.signal),
      inputNames: ports.inputs.map((port) => port.name),
      output: ports.outputs[0]?.signal ?? null,
      outputs: ports.outputs.map((port) => port.signal),
      outputNames: ports.outputs.map((port) => port.name)
    }];
  }));
  var mixerParameterId = (index, pan) => index < 32 ? index + (pan ? 33 : 1) : 67 + (index - 32) * 2 + Number(pan);
  var validMixerInputs = (inputs) => Number.isInteger(inputs) && inputs >= 1 && Math.fround(inputs) === inputs && mixerParameterId(inputs - 1, true) <= 4294967295;
  function configuredWorkspaceType(node) {
    const base = WORKSPACE_TYPES[node.type];
    if (node.type !== "mixer") return base;
    const count = node.a ?? base.args.a;
    if (!validMixerInputs(count)) throw new Error("Mixer inputs must fit the graph port and parameter representation");
    const inputNames = Array.from({ length: count }, (_, index) => `in-${index + 1}`);
    const parameter = (index, pan) => ({
      ...base.parameters.find((entry) => entry.id === (pan ? 33 : 1)),
      id: mixerParameterId(index, pan),
      name: `input${index + 1}${pan ? "Pan" : "Gain"}`,
      label: `Input ${index + 1} ${pan ? "pan" : "gain"}`
    });
    return {
      ...base,
      inputs: inputNames.map(() => "audio"),
      inputNames,
      parameters: [
        base.parameters[0],
        ...Array.from({ length: count }, (_, i) => parameter(i, false)),
        ...Array.from({ length: count }, (_, i) => parameter(i, true))
      ]
    };
  }

  // packages/manifold-author/sample-assets.js
  var SAMPLE_TYPES = /* @__PURE__ */ new Set(["sample-region", "sample-instrument", "granulator", "main-voice-bank"]);
  var PCM_ASSET_TYPES = /* @__PURE__ */ new Set([...SAMPLE_TYPES, "loop-capture"]);
  var VALIDATED_PAYLOAD_BUDGET = 8 * 1024 * 1024;
  var validatedPayloads = /* @__PURE__ */ new Map();
  var validatedPayloadBytes = 0;
  function rememberPayload(payload) {
    if (validatedPayloads.has(payload)) return;
    const bytes = payload.length * 2;
    if (bytes > VALIDATED_PAYLOAD_BUDGET) return;
    while (validatedPayloads.size >= 8 || validatedPayloadBytes + bytes > VALIDATED_PAYLOAD_BUDGET) {
      const oldest = validatedPayloads.keys().next().value;
      validatedPayloads.delete(oldest);
      validatedPayloadBytes -= oldest.length * 2;
    }
    validatedPayloads.set(payload, true);
    validatedPayloadBytes += bytes;
  }
  function encodedBytes(bytes) {
    const parts = [];
    for (let start = 0; start < bytes.length; start += 8190) {
      const chunk = bytes.subarray(start, start + 8190);
      if (typeof btoa === "function") parts.push(btoa(String.fromCharCode(...chunk)));
      else {
        const encoded = new Uint8Array(4 * Math.ceil(chunk.length / 3));
        let position = 0;
        for (let index = 0; index < chunk.length; index += 3) {
          const value = chunk[index] << 16 | (chunk[index + 1] ?? 0) << 8 | (chunk[index + 2] ?? 0);
          for (const shift of [18, 12]) encoded[position++] = BASE64.charCodeAt(value >>> shift & 63);
          encoded[position++] = index + 1 < chunk.length ? BASE64.charCodeAt(value >>> 6 & 63) : 61;
          encoded[position++] = index + 2 < chunk.length ? BASE64.charCodeAt(value & 63) : 61;
        }
        let part = "";
        for (let offset = 0; offset < encoded.length; offset += 8190) {
          part += String.fromCharCode(...encoded.subarray(offset, offset + 8190));
        }
        parts.push(part);
      }
    }
    return parts.join("");
  }
  var BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function validMetadata({ sourceRate, frames, label }) {
    return Number.isInteger(sourceRate) && sourceRate >= 8e3 && sourceRate <= 384e3 && Number.isSafeInteger(frames) && frames >= 1 && Number.isSafeInteger(frames * 8) && typeof label === "string";
  }
  function encodeSampleAsset(nodeId, stereo, sourceRate, label) {
    const frames = stereo?.length / 2;
    if (!(stereo instanceof Float32Array) || !validMetadata({ sourceRate, frames, label }) || stereo.some((sample) => !Number.isFinite(sample))) {
      throw new TypeError("Invalid decoded stereo sample");
    }
    const bytes = new Uint8Array(stereo.length * 4);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < stereo.length; index++) view.setFloat32(index * 4, stereo[index], true);
    return { nodeId, sourceRate, frames, label, pcmF32Base64: encodedBytes(bytes) };
  }
  function checkAssetMetadata(asset) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset) || Object.keys(asset).length !== 5 || !["nodeId", "sourceRate", "frames", "label", "pcmF32Base64"].every((key) => Object.hasOwn(asset, key))) {
      throw new TypeError("Invalid portable sample asset");
    }
    const value = {
      nodeId: asset.nodeId,
      sourceRate: asset.sourceRate,
      frames: asset.frames,
      label: asset.label,
      pcmF32Base64: asset.pcmF32Base64
    };
    if (!Number.isInteger(value.nodeId) || value.nodeId < 1 || value.nodeId > 4294967295 || !validMetadata(value) || typeof value.pcmF32Base64 !== "string" || value.pcmF32Base64.length !== 4 * Math.ceil(value.frames * 8 / 3)) {
      throw new TypeError("Invalid portable sample asset");
    }
    return value;
  }
  function decodeBytes(asset, knownValid) {
    if (!knownValid && !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.pcmF32Base64)) {
      throw new TypeError("Invalid portable sample asset");
    }
    let bytes;
    if (typeof atob === "function") {
      const binary = atob(asset.pcmF32Base64);
      if (binary.length !== asset.frames * 8) throw new TypeError("Invalid PCM byte count");
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    } else {
      bytes = new Uint8Array(asset.frames * 8);
      let position = 0;
      for (let index = 0; index < asset.pcmF32Base64.length; index += 4) {
        const part = asset.pcmF32Base64.slice(index, index + 4);
        const value = BASE64.indexOf(part[0]) << 18 | BASE64.indexOf(part[1]) << 12 | (part[2] === "=" ? 0 : BASE64.indexOf(part[2])) << 6 | (part[3] === "=" ? 0 : BASE64.indexOf(part[3]));
        bytes[position++] = value >>> 16;
        if (part[2] !== "=") bytes[position++] = value >>> 8;
        if (part[3] !== "=") bytes[position++] = value;
      }
      if (position !== bytes.length) throw new TypeError("Invalid PCM byte count");
    }
    if (!knownValid && encodedBytes(bytes) !== asset.pcmF32Base64) {
      throw new TypeError("Noncanonical PCM encoding");
    }
    return bytes;
  }
  function validateSampleAsset(asset) {
    asset = checkAssetMetadata(asset);
    if (validatedPayloads.has(asset.pcmF32Base64)) return asset;
    const bytes = decodeBytes(asset, false);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < asset.frames * 2; index++) {
      if (!Number.isFinite(view.getFloat32(index * 4, true))) throw new TypeError("Nonfinite PCM sample");
    }
    rememberPayload(asset.pcmF32Base64);
    return asset;
  }

  // packages/manifold-author/index.js
  var GraphContractError = class extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "GraphContractError";
      this.code = code;
      this.details = details;
    }
  };
  var fail = (code, message, details) => {
    throw new GraphContractError(code, message, details);
  };
  var stable = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) stable(child);
      Object.freeze(value);
    }
    return value;
  };
  var copy = (value) => structuredClone(value);
  var nodePorts = (node) => {
    if (node.type !== "mixer") return PORT_CATALOG[node.type];
    const spec = configuredWorkspaceType(node);
    return {
      inputs: spec.inputNames.map((name, i) => ({ name, signal: spec.inputs[i] })),
      outputs: PORT_CATALOG.mixer.outputs
    };
  };
  var nodeParameters = (node) => configuredWorkspaceType(node).parameters ?? [];
  var compareEdge = (a, b) => a.to - b.to || a.inputPort - b.inputPort;
  var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var utf8ByteLength = (value) => {
    let length = 0;
    for (const char of value) {
      const code = char.codePointAt(0);
      if (code >= 55296 && code <= 57343) return Infinity;
      length += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    }
    return length;
  };
  var exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  var describe = (type, spec) => stable({
    type,
    ...copy(spec),
    inputs: copy(PORT_CATALOG[type].inputs),
    outputs: copy(PORT_CATALOG[type].outputs)
  });
  var endpointPath = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
  var comparePath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  var validArguments = (type, node) => Object.entries(PORT_CATALOG[type].args).every(([key, value]) => {
    const field = Object.values(PORT_CATALOG[type].configuration).find((field2) => field2.argument === key);
    return field ? Number.isFinite(node[key]) && node[key] >= field.min && node[key] <= (field.max ?? Infinity) && (type !== "mixer" || key !== "a" || validMixerInputs(node[key])) && (!["loop-capture", "retrospective-capture"].includes(type) || key !== "a" || node[key] > 0) : node[key] === value;
  });
  var configuredNode = (type, node, config) => {
    if (!record(config)) fail("invalid-configuration", "Constructor configuration must be an object");
    const result = { ...node };
    for (const [name, value] of Object.entries(config)) {
      const field = PORT_CATALOG[type].configuration[name];
      if (!Object.hasOwn(PORT_CATALOG[type].configuration, name) || !Number.isFinite(value) || value < field.min || value > (field.max ?? Infinity) || type === "mixer" && name === "inputs" && !validMixerInputs(value) || name === "capacitySeconds" && value <= 0) fail("invalid-configuration", `Invalid ${type} constructor field ${name}`);
      result[field.argument] = value;
    }
    return result;
  };
  function validateIoLayout(layout, nodes) {
    if (!exactKeys(layout, ["version", "inputs", "outputs", "inputBindings", "outputBindings"]) || layout.version !== 1) {
      fail("invalid-io", "Expected an I/O layout version 1");
    }
    const types = new Map(nodes.map((node) => [node.id, node.type]));
    for (const [direction, buses] of [["inputs", layout.inputs], ["outputs", layout.outputs]]) {
      if (!Array.isArray(buses)) fail("invalid-io", "Expected audio buses");
      const ids = /* @__PURE__ */ new Set();
      let total = 0;
      for (const bus of buses) {
        if (!exactKeys(bus, ["id", "name", "channels", "optional"]) || typeof bus.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(bus.id) || ids.has(bus.id) || typeof bus.name !== "string" || !bus.name || bus.name.trim() !== bus.name || !Number.isFinite(utf8ByteLength(bus.name)) || !Number.isSafeInteger(bus.channels) || bus.channels < 1 || typeof bus.optional !== "boolean" || direction === "outputs" && bus.optional) {
          fail("invalid-io", "Invalid or duplicate bus declaration");
        }
        ids.add(bus.id);
        total += bus.channels;
      }
      if (!Number.isSafeInteger(total)) fail("invalid-io", "Channel count cannot be represented exactly");
    }
    if (!Array.isArray(layout.inputBindings) || layout.inputBindings.length > nodes.length || !Array.isArray(layout.outputBindings) || layout.outputBindings.length !== layout.outputs.reduce((sum, bus) => sum + bus.channels, 0)) {
      fail("invalid-io", "I/O bindings do not match declared channels");
    }
    const bound = /* @__PURE__ */ new Set();
    for (const binding of layout.inputBindings) {
      if (!exactKeys(binding, ["nodeId", "channels"]) || !Number.isInteger(binding.nodeId) || !["input.raw", "input.sidechain", "input.monitor"].includes(types.get(binding.nodeId)) || bound.has(binding.nodeId) || !Array.isArray(binding.channels) || binding.channels.length !== 2) {
        fail("invalid-io", "Input binding needs two explicit kernel lanes");
      }
      bound.add(binding.nodeId);
      for (const route of binding.channels) {
        if (route === null) continue;
        if (!exactKeys(route, ["bus", "channel"]) || !Number.isInteger(route.bus) || route.bus < 0 || !Number.isInteger(route.channel) || route.channel < 0 || !layout.inputs[route.bus] || route.channel >= layout.inputs[route.bus].channels) {
          fail("invalid-io", "Input channel route is outside its declared bus");
        }
      }
    }
    for (const node of nodes) if (["input.raw", "input.sidechain", "input.monitor"].includes(node.type) && !bound.has(node.id)) {
      fail("invalid-io", "Every host input node needs an explicit binding, including silence");
    }
    for (const route of layout.outputBindings) {
      if (route === null) continue;
      if (!exactKeys(route, ["nodeId", "outputPort", "channel"]) || !Number.isInteger(route.nodeId) || !Number.isInteger(route.outputPort) || route.outputPort < 0 || !Number.isInteger(route.channel) || route.channel < 0 || route.channel > 1 || PORT_CATALOG[types.get(route.nodeId)]?.outputs[route.outputPort]?.signal !== "audio") {
        fail("invalid-io", "Output route needs an existing audio port and kernel lane");
      }
    }
    return stable(copy(layout));
  }
  var CAPTURE_WINDOW_FIELDS = [
    "captureWindowSeconds",
    "captureWindowMode",
    "captureWindowBars",
    "captureTempoBpm",
    "captureTimeSignatureNumerator",
    "captureTimeSignatureDenominator"
  ];
  var validCaptureWindow = (settings) => {
    if (!record(settings) || Object.keys(settings).some((key) => !CAPTURE_WINDOW_FIELDS.includes(key))) return false;
    const mode = settings.captureWindowMode ?? "seconds";
    const seconds = settings.captureWindowSeconds;
    const bars = settings.captureWindowBars;
    const tempo = settings.captureTempoBpm;
    const numerator = settings.captureTimeSignatureNumerator;
    const denominator = settings.captureTimeSignatureDenominator;
    return ["seconds", "bars", "free"].includes(mode) && (seconds === void 0 || Number.isFinite(seconds) && seconds > 0) && (bars === void 0 || Number.isFinite(bars) && bars > 0) && (tempo === void 0 || Number.isFinite(tempo) && tempo >= 20 && tempo <= 300) && (mode !== "bars" || bars !== void 0 && tempo !== void 0) && (numerator === void 0 && denominator === void 0 || Number.isInteger(numerator) && numerator >= 1 && numerator <= 128 && Number.isInteger(denominator) && denominator >= 1 && denominator <= 128);
  };
  function validateNamedInstances(signal, instances) {
    if (!Array.isArray(instances)) {
      fail("invalid-instances", "Expected named instances");
    }
    const nodes = new Set(signal.nodes.map((node) => node.id));
    const paths = /* @__PURE__ */ new Set();
    const targets = /* @__PURE__ */ new Set();
    return stable(instances.map((entry) => {
      if (!exactKeys(entry, ["path", "nodeId"]) || typeof entry.path !== "string" || !endpointPath.test(entry.path) || !Number.isInteger(entry.nodeId) || !nodes.has(entry.nodeId) || paths.has(entry.path) || targets.has(entry.nodeId)) {
        fail("invalid-instance", "Named instance must bind one unique path to one existing node");
      }
      paths.add(entry.path);
      targets.add(entry.nodeId);
      return copy(entry);
    }).sort(comparePath));
  }
  function validateParameterEndpoints(signal, endpoints) {
    if (!Array.isArray(endpoints)) {
      fail("invalid-endpoints", "Expected parameter endpoints");
    }
    const nodes = new Map(signal.nodes.map((node) => [node.id, node]));
    const parameters = new Map(signal.initialParameters.map((entry) => [`${entry.nodeId}:${entry.id}`, entry.value]));
    const paths = /* @__PURE__ */ new Set();
    const targets = /* @__PURE__ */ new Set();
    const result = [];
    for (const entry of endpoints) {
      if (!exactKeys(entry, ["path", "kind", "nodeId", "id", "min", "max", "default"]) || entry.kind !== "parameter" || typeof entry.path !== "string" || !endpointPath.test(entry.path) || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id) || !Number.isFinite(entry.min) || !Number.isFinite(entry.max) || !Number.isFinite(entry.default) || Math.fround(entry.min) >= Math.fround(entry.max) || entry.default < entry.min || entry.default > entry.max) {
        fail("invalid-endpoint", "Parameter endpoint has an invalid path, shape, or range");
      }
      const target = `${entry.nodeId}:${entry.id}`;
      const node = nodes.get(entry.nodeId);
      const spec = node && nodeParameters(node).find((parameter) => parameter.id === entry.id);
      if (!spec || !parameters.has(target) || entry.min < spec.min || entry.max > spec.max || Math.fround(parameters.get(target)) < Math.fround(entry.min) || Math.fround(parameters.get(target)) > Math.fround(entry.max) || spec.discrete && [entry.min, entry.max, entry.default].some((value) => !Number.isInteger(value))) {
        fail("invalid-endpoint-target", `Endpoint ${entry.path} does not bind a compatible graph parameter`);
      }
      if (paths.has(entry.path) || targets.has(target)) {
        fail("duplicate-endpoint", "Endpoint paths and parameter targets must be unique");
      }
      paths.add(entry.path);
      targets.add(target);
      result.push(copy(entry));
    }
    return stable(result.sort(comparePath));
  }
  function validateHostAssignments(assignments) {
    if (!Array.isArray(assignments)) fail("invalid-host-assignments", "Expected host assignments");
    const slots = /* @__PURE__ */ new Set(), paths = /* @__PURE__ */ new Set();
    return stable(assignments.map((entry) => {
      if (!exactKeys(entry, ["slot", "path"]) && !exactKeys(entry, ["slot"]) || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot > 4294967295 - 16777216 || entry.path !== void 0 && (typeof entry.path !== "string" || !endpointPath.test(entry.path) || paths.has(entry.path)) || slots.has(entry.slot)) {
        fail("invalid-host-assignment", "Host assignments need unique slots and authored paths");
      }
      slots.add(entry.slot);
      if (entry.path !== void 0) paths.add(entry.path);
      return copy(entry);
    }).sort((a, b) => a.slot - b.slot));
  }
  function validateHostBindings(signal, bindings) {
    if (!Array.isArray(bindings)) {
      fail("invalid-host-bindings", "Expected host bindings");
    }
    const parameters = new Set(signal.initialParameters.map((entry) => `${entry.nodeId}:${entry.id}`));
    const slots = /* @__PURE__ */ new Set();
    const targets = /* @__PURE__ */ new Set();
    return stable(bindings.map((entry) => {
      if (!exactKeys(entry, ["slot", "nodeId", "id"]) || !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot > 4294967295 - 16777216 || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)) {
        fail("invalid-host-binding", "Host binding has invalid fields");
      }
      const target = `${entry.nodeId}:${entry.id}`;
      if (!parameters.has(target) || slots.has(entry.slot) || targets.has(target)) {
        fail("invalid-host-binding", "Host slot and graph parameter must each be unique");
      }
      slots.add(entry.slot);
      targets.add(target);
      return copy(entry);
    }).sort((a, b) => a.slot - b.slot));
  }
  function validateProjectControls(controls, endpoints = []) {
    if (!Array.isArray(controls)) {
      fail("invalid-controls", "Expected project controls");
    }
    const paths = new Set(endpoints.map((entry) => entry.path));
    return stable(controls.map((entry) => {
      if (!exactKeys(entry, ["path", "min", "max", "default", "value", "discrete"]) || typeof entry.path !== "string" || !endpointPath.test(entry.path) || !Number.isFinite(entry.min) || !Number.isFinite(entry.max) || !Number.isFinite(entry.default) || !Number.isFinite(entry.value) || [entry.min, entry.max, entry.default, entry.value].some((value) => Math.abs(value) > 34028234663852886e22) || Math.fround(entry.min) >= Math.fround(entry.max) || entry.default < entry.min || entry.default > entry.max || entry.value < entry.min || entry.value > entry.max || typeof entry.discrete !== "boolean" || entry.discrete && [entry.min, entry.max, entry.default, entry.value].some((value) => !Number.isInteger(value)) || paths.has(entry.path)) {
        fail("invalid-control", "Project control has an invalid path, range, or value");
      }
      paths.add(entry.path);
      return copy(entry);
    }).sort(comparePath));
  }
  function getPrimitive(type) {
    const spec = Object.hasOwn(WORKSPACE_TYPES, type) ? WORKSPACE_TYPES[type] : void 0;
    if (!spec) fail("unknown-type", `Unknown primitive: ${type}`, { type });
    return describe(type, spec);
  }
  var PortRef = class {
    constructor(graph, id, generation, direction, index, description) {
      Object.defineProperty(this, "graph", { value: graph });
      this.nodeId = id;
      this.generation = generation;
      this.direction = direction;
      this.index = index;
      this.name = description.name;
      this.signal = description.signal;
      Object.freeze(this);
    }
  };
  var ParameterRef = class {
    constructor(node, name) {
      Object.defineProperty(this, "node", { value: node });
      this.name = name;
      Object.freeze(this);
    }
    get description() {
      const description = this.node.graph.describeNode(this.node).parameters.find((p) => p.name === this.name);
      if (!description) fail("unknown-parameter", `${this.node.type} has no named parameter ${this.name}`);
      return description;
    }
    set(value) {
      this.node.graph.setParameter(this.node, this.description.id, value);
      return this;
    }
    expose({ path, min, max, default: initial }) {
      const id = this.description.id;
      const candidate = this.node.graph.fork();
      const node = candidate.find(this.node.id);
      candidate.setParameter(node, id, initial);
      candidate.registerParameter(path, node, id, { min, max, default: initial });
      this.node.graph.setParameter(this.node, id, initial);
      this.node.graph.registerParameter(path, this.node, id, { min, max, default: initial });
      return this;
    }
  };
  var _NodeHandle_instances, port_fn;
  var NodeHandle = class {
    constructor(graph, id, generation, type) {
      __privateAdd(this, _NodeHandle_instances);
      Object.defineProperty(this, "graph", { value: graph });
      this.id = id;
      this.generation = generation;
      this.type = type;
      Object.freeze(this);
    }
    input(name) {
      return __privateMethod(this, _NodeHandle_instances, port_fn).call(this, "inputs", name);
    }
    output(name) {
      return __privateMethod(this, _NodeHandle_instances, port_fn).call(this, "outputs", name);
    }
    parameter(name) {
      const names = this.graph.describeNode(this).parameters.map((p) => p.name).filter(Boolean);
      if (!names.includes(name)) fail("unknown-parameter", `${this.type} has no named parameter ${name}; available: ${names.join(", ") || "numeric parameters only"}`);
      return new ParameterRef(this, name);
    }
  };
  _NodeHandle_instances = new WeakSet();
  port_fn = function(direction, name) {
    this.graph.assertHandle(this);
    const ports = this.graph.describeNode(this)[direction];
    const index = ports.findIndex((port) => port.name === name);
    if (index < 0) fail(
      "unknown-port",
      `${this.type} has no ${direction} port ${name}`,
      { nodeId: this.id, direction, name }
    );
    return new PortRef(this.graph, this.id, this.generation, direction, index, ports[index]);
  };
  var _nodes, _edges, _parameters, _omittedParameters, _endpoints, _hostBindings, _hostAssignments, _explicitHostBindings, _controls, _instances, _assets, _sampleBindings, _generations, _revision, _inputSource, _captureSources, _defaultCaptureSourceId, _selectedCaptureSourceId, _selectedCaptureNodeId, _sidechainSource, _captureWindow, _io, _GraphWorkspace_instances, insert_fn, assertPort_fn;
  var _GraphWorkspace = class _GraphWorkspace {
    constructor() {
      __privateAdd(this, _GraphWorkspace_instances);
      __privateAdd(this, _nodes, /* @__PURE__ */ new Map());
      __privateAdd(this, _edges, /* @__PURE__ */ new Map());
      __privateAdd(this, _parameters, /* @__PURE__ */ new Map());
      __privateAdd(this, _omittedParameters, /* @__PURE__ */ new Set());
      __privateAdd(this, _endpoints, /* @__PURE__ */ new Map());
      __privateAdd(this, _hostBindings, /* @__PURE__ */ new Map());
      __privateAdd(this, _hostAssignments, /* @__PURE__ */ new Map());
      __privateAdd(this, _explicitHostBindings, false);
      __privateAdd(this, _controls, /* @__PURE__ */ new Map());
      __privateAdd(this, _instances, /* @__PURE__ */ new Map());
      __privateAdd(this, _assets, /* @__PURE__ */ new Map());
      __privateAdd(this, _sampleBindings, /* @__PURE__ */ new Map());
      __privateAdd(this, _generations, /* @__PURE__ */ new Map());
      __privateAdd(this, _revision, 0);
      __privateAdd(this, _inputSource, "none");
      __privateAdd(this, _captureSources, []);
      __privateAdd(this, _defaultCaptureSourceId, null);
      __privateAdd(this, _selectedCaptureSourceId, null);
      __privateAdd(this, _selectedCaptureNodeId, null);
      __privateAdd(this, _sidechainSource);
      __privateAdd(this, _captureWindow, {});
      __privateAdd(this, _io, null);
      __privateMethod(this, _GraphWorkspace_instances, insert_fn).call(this, 1, "input.raw");
      __privateMethod(this, _GraphWorkspace_instances, insert_fn).call(this, 3, "output");
    }
    get revision() {
      return __privateGet(this, _revision);
    }
    get input() {
      return this.find(1);
    }
    get output() {
      return this.find(3);
    }
    get ioLayout() {
      return __privateGet(this, _io);
    }
    setIoLayout(layout) {
      const checked = validateIoLayout(layout, [...__privateGet(this, _nodes).values()]);
      __privateSet(this, _io, checked);
      __privateWrapper(this, _revision)._++;
      return this;
    }
    setInputSource(source) {
      if (__privateGet(this, _io)) fail("declared-io", "Use declared input buses instead of the legacy input recipe");
      if (!["none", "external"].includes(source)) {
        fail("invalid-input-source", "Input source must be external or none");
      }
      if (__privateGet(this, _inputSource) !== source) {
        __privateSet(this, _inputSource, source);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    setSidechainSource(source) {
      if (__privateGet(this, _io)) fail("declared-io", "Use declared input buses instead of the legacy sidechain recipe");
      if (!["none", "oscillator", "microphone"].includes(source)) {
        fail("invalid-sidechain-source", "Sidechain source must be none, oscillator, or microphone");
      }
      if (__privateGet(this, _sidechainSource) !== source) {
        __privateSet(this, _sidechainSource, source);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    configureCaptureWindow(settings) {
      if (!validCaptureWindow(settings)) {
        fail("invalid-capture-window", "Capture window settings are outside the supported range");
      }
      __privateSet(this, _captureWindow, copy(settings));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    registerCaptureSource(handle, name, kind = "custom", id = null) {
      this.assertHandle(handle);
      if (!["loop-capture", "retrospective-capture"].includes(handle.type) || typeof name !== "string" || !name || name.trim() !== name || name.length > 80 || !["input", "sidechain", "layer", "custom"].includes(kind) || __privateGet(this, _captureSources).some((source) => source.nodeId === handle.id)) {
        fail("invalid-capture-source", "Capture source needs a unique prepared capture node, name, and kind");
      }
      const used = new Set(__privateGet(this, _captureSources).map((source) => source.id));
      const sourceId = id ?? Array.from({ length: 256 }, (_, candidate) => candidate).find((candidate) => !used.has(candidate));
      if (!Number.isInteger(sourceId) || sourceId < 0 || sourceId > 255 || used.has(sourceId)) {
        fail("invalid-capture-source", "Capture source ID must be a unique byte");
      }
      __privateGet(this, _captureSources).push({ id: sourceId, nodeId: handle.id, name, kind });
      __privateGet(this, _defaultCaptureSourceId) ?? __privateSet(this, _defaultCaptureSourceId, sourceId);
      __privateGet(this, _selectedCaptureSourceId) ?? __privateSet(this, _selectedCaptureSourceId, sourceId);
      __privateSet(this, _selectedCaptureNodeId, __privateGet(this, _captureSources).find((source) => source.id === __privateGet(this, _selectedCaptureSourceId)).nodeId);
      __privateWrapper(this, _revision)._++;
      return this;
    }
    selectCaptureSource(id) {
      if (!__privateGet(this, _captureSources).some((source) => source.id === id)) {
        fail("unknown-capture-source", "Capture source ID is not registered");
      }
      if (__privateGet(this, _selectedCaptureSourceId) !== id) {
        __privateSet(this, _selectedCaptureSourceId, id);
        __privateSet(this, _selectedCaptureNodeId, __privateGet(this, _captureSources).find((source) => source.id === id).nodeId);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    listCaptureSources() {
      return stable(__privateGet(this, _captureSources).map(copy));
    }
    static fromProject(project) {
      if (!record(project) || Object.keys(project).some((key) => !["format", "schemaVersion", "projectId", "signal", "endpoints", "hostBindings", "hostAssignments", "controls", "instances", "assets", "sampleBindings", "liveAuthoring"].includes(key)) || ["format", "schemaVersion", "projectId", "signal"].some((key) => !Object.hasOwn(project, key)) || project.format !== "manifold.project" || project.schemaVersion !== 1 || project.projectId !== "manifold.graph-workspace") {
        fail("unsupported-project", "Expected a plain graph-workspace project version 1");
      }
      const signal = project.signal;
      const required = ["inputs", "outputs", "nodes", "connections", "initialParameters"];
      const keys = Object.keys(signal ?? {});
      if (!record(signal) || required.some((key) => !Object.hasOwn(signal, key)) || keys.some((key) => ![
        ...required,
        "io",
        "inputSource",
        "sidechainSource",
        "captureSources",
        "defaultCaptureSourceId",
        "selectedCaptureSourceId",
        "selectedCaptureNodeId",
        ...CAPTURE_WINDOW_FIELDS
      ].includes(key)) || signal.io === void 0 && (signal.inputs !== 2 || signal.outputs !== 2) || !["none", "external"].includes(signal.inputSource ?? "none") || signal.sidechainSource !== void 0 && !["none", "oscillator", "microphone"].includes(signal.sidechainSource) || !Array.isArray(signal.nodes) || !Array.isArray(signal.connections) || !Array.isArray(signal.initialParameters)) {
        fail("unsupported-project-fields", "Expected a stereo graph with supported project fields");
      }
      if (signal.nodes.length < 2) {
        fail("project-size", "Graph needs input and output boundaries");
      }
      const graph = new _GraphWorkspace();
      __privateSet(graph, _inputSource, signal.inputSource ?? "none");
      __privateSet(graph, _sidechainSource, signal.sidechainSource);
      __privateSet(graph, _captureWindow, Object.fromEntries(CAPTURE_WINDOW_FIELDS.filter((key) => signal[key] !== void 0).map((key) => [key, signal[key]])));
      if (!validCaptureWindow(__privateGet(graph, _captureWindow))) {
        fail("invalid-capture-window", "Project capture window settings are invalid");
      }
      const seen = /* @__PURE__ */ new Set();
      for (const node of signal.nodes) {
        const spec = record(node) && Object.hasOwn(WORKSPACE_TYPES, node.type) ? WORKSPACE_TYPES[node.type] : void 0;
        if (!spec || !Number.isInteger(node.id) || node.id < 1 || node.id > 4294967295 || seen.has(node.id) || !exactKeys(node, ["id", "type", ...Object.keys(spec.args)]) || !validArguments(node.type, node)) {
          fail("invalid-project-node", "Project has an unknown, duplicate, or invalid graph node");
        }
        seen.add(node.id);
        if (node.id === 1 || node.id === 3) {
          if (node.type !== (node.id === 1 ? "input.raw" : "output")) {
            fail("invalid-project-boundary", "Project boundary IDs have the wrong type");
          }
        } else {
          const config = Object.fromEntries(Object.entries(PORT_CATALOG[node.type].configuration).map(([name, field]) => [name, node[field.argument]]));
          graph.add(node.type, { id: node.id, config });
        }
      }
      if (!seen.has(1) || !seen.has(3)) fail("missing-project-boundary", "Project needs input and output boundary nodes");
      if (signal.captureSources !== void 0 || signal.defaultCaptureSourceId !== void 0 || signal.selectedCaptureSourceId !== void 0) {
        if (!Array.isArray(signal.captureSources) || signal.captureSources.length < 1) {
          fail("invalid-capture-sources", "Project capture registry must contain a source");
        }
        for (const source of signal.captureSources) {
          if (!exactKeys(source, ["id", "nodeId", "name", "kind"])) {
            fail("invalid-capture-source", "Project capture source has invalid fields");
          }
          const handle = graph.find(source.nodeId);
          if (!handle) fail("invalid-capture-source", "Project capture source node is missing");
          graph.registerCaptureSource(handle, source.name, source.kind, source.id);
        }
        if (!__privateGet(graph, _captureSources).some((source) => source.id === signal.defaultCaptureSourceId) || !__privateGet(graph, _captureSources).some((source) => source.id === signal.selectedCaptureSourceId && source.nodeId === signal.selectedCaptureNodeId)) {
          fail("invalid-capture-source", "Project capture selection does not match its registry");
        }
        __privateSet(graph, _defaultCaptureSourceId, signal.defaultCaptureSourceId);
        graph.selectCaptureSource(signal.selectedCaptureSourceId);
      } else if (signal.selectedCaptureNodeId !== void 0) {
        const handle = graph.find(signal.selectedCaptureNodeId);
        if (!handle || !["loop-capture", "retrospective-capture"].includes(handle.type)) {
          fail("invalid-capture-source", "Selected capture node is missing");
        }
        __privateSet(graph, _selectedCaptureNodeId, signal.selectedCaptureNodeId);
      }
      if (project.assets !== void 0) {
        if (!Array.isArray(project.assets)) {
          fail("invalid-assets", "Expected PCM assets");
        }
        for (const asset of project.assets) {
          const node = graph.find(asset?.nodeId);
          if (!node || !PCM_ASSET_TYPES.has(node.type) || __privateGet(graph, _assets).has(node.id)) {
            fail("invalid-asset-node", "PCM asset needs a unique compatible graph node");
          }
          let portable;
          try {
            portable = validateSampleAsset(asset);
          } catch {
            fail("invalid-asset", "Sample asset has invalid metadata or PCM");
          }
          if (portable.nodeId !== node.id) fail("invalid-asset-node", "PCM asset node changed during validation");
          __privateGet(graph, _assets).set(node.id, portable);
        }
      }
      if (project.sampleBindings !== void 0) {
        if (!Array.isArray(project.sampleBindings)) {
          fail("invalid-sample-bindings", "Expected sample bindings");
        }
        for (const binding of project.sampleBindings) {
          if (!exactKeys(binding, ["sourceNodeId", "nodeId"]) || !Number.isInteger(binding.sourceNodeId) || !Number.isInteger(binding.nodeId) || !__privateGet(graph, _assets).has(binding.sourceNodeId) || graph.find(binding.sourceNodeId)?.type !== "sample-region" || graph.find(binding.nodeId)?.type !== "sample-region" || binding.sourceNodeId === binding.nodeId || __privateGet(graph, _assets).has(binding.nodeId) || __privateGet(graph, _sampleBindings).has(binding.nodeId)) {
            fail("invalid-sample-binding", "Sample binding needs one source asset and a distinct unbound region");
          }
          __privateGet(graph, _sampleBindings).set(binding.nodeId, binding.sourceNodeId);
        }
      }
      for (const edge of signal.connections) {
        if (!(exactKeys(edge, ["from", "to", "inputPort"]) || exactKeys(edge, ["from", "outputPort", "to", "inputPort"])) || !Number.isInteger(edge.from) || !Number.isInteger(edge.to) || !Number.isInteger(edge.inputPort) || !Number.isInteger(edge.outputPort ?? 0)) {
          fail("invalid-project-edge", "Project connection has invalid indices or fields");
        }
        const from = graph.find(edge.from);
        const to = graph.find(edge.to);
        const output2 = from && graph.describeNode(from).outputs[edge.outputPort ?? 0];
        const input = to && graph.describeNode(to).inputs[edge.inputPort];
        if (!output2 || !input) fail("invalid-project-edge", "Project connection refers to a missing node or port");
        graph.connect(from.output(output2.name), to.input(input.name));
      }
      const parameters = /* @__PURE__ */ new Set();
      for (const entry of signal.initialParameters) {
        if (!exactKeys(entry, ["nodeId", "id", "value"]) || !Number.isInteger(entry.nodeId) || !Number.isInteger(entry.id)) {
          fail("invalid-project-parameter", "Project parameter has invalid fields");
        }
        const handle = graph.find(entry.nodeId);
        const key = `${entry.nodeId}:${entry.id}`;
        if (!handle || parameters.has(key) || !__privateGet(graph, _parameters).has(key)) {
          fail("invalid-project-parameter", "Project parameter is unknown or repeated");
        }
        parameters.add(key);
        graph.setParameter(handle, entry.id, entry.value);
      }
      for (const key of __privateGet(graph, _parameters).keys()) {
        if (parameters.has(key)) continue;
        const [nodeId, id] = key.split(":").map(Number);
        if (graph.find(nodeId)?.type === "sample-region" && id >= 9 && id <= 11) {
          __privateGet(graph, _omittedParameters).add(key);
        } else {
          fail("missing-project-parameter", "Project must specify every initial parameter");
        }
      }
      for (const endpoint of validateParameterEndpoints(graph.snapshot(), project.endpoints ?? [])) {
        __privateGet(graph, _endpoints).set(endpoint.path, endpoint);
      }
      __privateSet(graph, _explicitHostBindings, Object.hasOwn(project, "hostBindings") || Object.hasOwn(project, "hostAssignments"));
      for (const assignment of validateHostAssignments(project.hostAssignments ?? [])) {
        __privateGet(graph, _hostAssignments).set(assignment.slot, assignment);
      }
      for (const binding of validateHostBindings(graph.snapshot(), project.hostBindings ?? [])) {
        const assignment = __privateGet(graph, _hostAssignments).get(binding.slot);
        const endpoint = assignment && graph.findParameter(assignment.path);
        if (assignment?.path !== void 0 && (!endpoint || endpoint.nodeId !== binding.nodeId || endpoint.id !== binding.id))
          fail("reserved-host-slot", `Automation slot belongs to ${assignment.path}`);
        __privateGet(graph, _hostBindings).set(binding.slot, binding);
      }
      for (const control of validateProjectControls(project.controls ?? [], project.endpoints ?? [])) {
        __privateGet(graph, _controls).set(control.path, control);
      }
      for (const instance of validateNamedInstances(graph.snapshot(), project.instances ?? [])) {
        __privateGet(graph, _instances).set(instance.path, instance.nodeId);
      }
      if (signal.io !== void 0) {
        graph.setIoLayout(signal.io);
        if (signal.inputs !== signal.io.inputs.reduce((sum, b) => sum + b.channels, 0) || signal.outputs !== signal.io.outputs.reduce((sum, b) => sum + b.channels, 0)) fail("invalid-io", "I/O channel totals disagree");
      }
      graph.toProject();
      __privateSet(graph, _revision, 0);
      return graph;
    }
    /** Clone document state without decoding immutable sample assets again. */
    fork() {
      const next = new _GraphWorkspace();
      __privateSet(next, _nodes, new Map(__privateGet(this, _nodes)));
      __privateSet(next, _edges, new Map(__privateGet(this, _edges)));
      __privateSet(next, _parameters, new Map(__privateGet(this, _parameters)));
      __privateSet(next, _omittedParameters, new Set(__privateGet(this, _omittedParameters)));
      __privateSet(next, _endpoints, new Map(__privateGet(this, _endpoints)));
      __privateSet(next, _hostBindings, new Map(__privateGet(this, _hostBindings)));
      __privateSet(next, _hostAssignments, new Map(__privateGet(this, _hostAssignments)));
      __privateSet(next, _explicitHostBindings, __privateGet(this, _explicitHostBindings));
      __privateSet(next, _controls, new Map(__privateGet(this, _controls)));
      __privateSet(next, _instances, new Map(__privateGet(this, _instances)));
      __privateSet(next, _assets, new Map(__privateGet(this, _assets)));
      __privateSet(next, _sampleBindings, new Map(__privateGet(this, _sampleBindings)));
      __privateSet(next, _generations, new Map(__privateGet(this, _generations)));
      __privateSet(next, _revision, __privateGet(this, _revision));
      __privateSet(next, _inputSource, __privateGet(this, _inputSource));
      __privateSet(next, _captureSources, __privateGet(this, _captureSources).map(copy));
      __privateSet(next, _defaultCaptureSourceId, __privateGet(this, _defaultCaptureSourceId));
      __privateSet(next, _selectedCaptureSourceId, __privateGet(this, _selectedCaptureSourceId));
      __privateSet(next, _selectedCaptureNodeId, __privateGet(this, _selectedCaptureNodeId));
      __privateSet(next, _sidechainSource, __privateGet(this, _sidechainSource));
      __privateSet(next, _captureWindow, copy(__privateGet(this, _captureWindow)));
      __privateSet(next, _io, __privateGet(this, _io));
      return next;
    }
    setSampleAsset(handle, stereo, sourceRate, label = "") {
      this.assertHandle(handle);
      if (!PCM_ASSET_TYPES.has(handle.type)) {
        fail("invalid-asset-node", "PCM needs a compatible sample or loop node");
      }
      if (__privateGet(this, _sampleBindings).has(handle.id)) {
        fail("invalid-asset-node", "Remove the shared sample binding before assigning PCM");
      }
      let asset;
      try {
        asset = encodeSampleAsset(handle.id, stereo, sourceRate, label);
      } catch {
        fail("invalid-asset", "Sample asset has invalid metadata or PCM");
      }
      __privateGet(this, _assets).set(handle.id, asset);
      __privateWrapper(this, _revision)._++;
      return this;
    }
    removeSampleAsset(handle) {
      this.assertHandle(handle);
      if (__privateGet(this, _assets).delete(handle.id)) {
        for (const [target, source] of __privateGet(this, _sampleBindings)) {
          if (source === handle.id) __privateGet(this, _sampleBindings).delete(target);
        }
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    bindSampleAsset(source, target) {
      this.assertHandle(source);
      this.assertHandle(target);
      if (source.type !== "sample-region" || target.type !== "sample-region" || source.id === target.id || !__privateGet(this, _assets).has(source.id) || __privateGet(this, _assets).has(target.id)) {
        fail("invalid-sample-binding", "Bind a region with PCM to a distinct unowned region");
      }
      if (__privateGet(this, _sampleBindings).get(target.id) !== source.id) {
        __privateGet(this, _sampleBindings).set(target.id, source.id);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    unbindSampleAsset(target) {
      this.assertHandle(target);
      if (__privateGet(this, _sampleBindings).delete(target.id)) __privateWrapper(this, _revision)._++;
      return this;
    }
    listSampleBindings() {
      return stable([...__privateGet(this, _sampleBindings)].sort((a, b) => a[0] - b[0]).map(([nodeId, sourceNodeId]) => ({ sourceNodeId, nodeId })));
    }
    listSampleAssets() {
      return stable([...__privateGet(this, _assets).values()].sort((a, b) => a.nodeId - b.nodeId).map(copy));
    }
    assertHandle(handle) {
      if (!(handle instanceof NodeHandle) || handle.graph !== this || __privateGet(this, _generations).get(handle.id) !== handle.generation || __privateGet(this, _nodes).get(handle.id)?.type !== handle.type) {
        fail("stale-handle", "Node handle does not refer to a current graph instance");
      }
    }
    /** Actual configured ports and parameters, shared by lookup and mutation. */
    describeNode(handle) {
      this.assertHandle(handle);
      const node = __privateGet(this, _nodes).get(handle.id);
      return stable({ ...copy(node), ...copy(nodePorts(node)), parameters: copy(nodeParameters(node)) });
    }
    add(type, { id, config = {} } = {}) {
      getPrimitive(type);
      if (!Number.isInteger(id) || id < 1 || id > 4294967295 || __privateGet(this, _nodes).has(id)) {
        fail("invalid-id", "Node ID must be an unused integer in the unsigned 32-bit node ID format", { id });
      }
      if (type === "output" || id === 1 || id === 3) {
        fail("reserved-boundary", "Input and output boundary nodes have fixed IDs");
      }
      const node = configuredNode(type, { id, type, ...PORT_CATALOG[type].args }, config);
      const handle = __privateMethod(this, _GraphWorkspace_instances, insert_fn).call(this, id, type);
      __privateGet(this, _nodes).set(id, node);
      if (type === "mixer") {
        const supported = new Set(nodeParameters(node).map((parameter) => parameter.id));
        for (const [key, parameter] of __privateGet(this, _parameters)) {
          if (parameter.nodeId === id && !supported.has(parameter.id)) __privateGet(this, _parameters).delete(key);
        }
        for (const parameter of nodeParameters(node)) {
          const key = `${id}:${parameter.id}`;
          if (!__privateGet(this, _parameters).has(key)) __privateGet(this, _parameters).set(key, { nodeId: id, id: parameter.id, value: parameter.default });
        }
      }
      __privateWrapper(this, _revision)._++;
      return handle;
    }
    /** Structural configuration: publish through a graph transaction while running. */
    configure(handle, config) {
      this.assertHandle(handle);
      const previous = __privateGet(this, _nodes).get(handle.id), next = configuredNode(handle.type, previous, config);
      if (Object.keys(next).some((key) => next[key] !== previous[key])) {
        if (handle.type === "mixer") {
          const supported = new Set(nodeParameters(next).map((parameter) => parameter.id));
          if ([...__privateGet(this, _edges).values()].some((edge) => edge.to === handle.id && edge.inputPort >= next.a) || [...__privateGet(this, _endpoints).values(), ...__privateGet(this, _hostBindings).values()].some((entry) => entry.nodeId === handle.id && !supported.has(entry.id))) {
            fail("configuration-in-use", "Remove cables and published parameters before removing their ports");
          }
          for (const [key, parameter] of __privateGet(this, _parameters)) if (parameter.nodeId === handle.id && !supported.has(parameter.id)) {
            __privateGet(this, _parameters).delete(key);
            __privateGet(this, _omittedParameters).delete(key);
          }
          for (const parameter of nodeParameters(next)) {
            const key = `${handle.id}:${parameter.id}`;
            if (!__privateGet(this, _parameters).has(key)) __privateGet(this, _parameters).set(key, { nodeId: handle.id, id: parameter.id, value: parameter.default });
          }
        }
        __privateGet(this, _nodes).set(handle.id, next);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    /** Capture rings only; PCM, staging and other kernels add host-specific costs. */
    captureRingBytes(sampleRate) {
      if (!Number.isFinite(sampleRate) || sampleRate <= 1 || !Number.isFinite(Math.fround(sampleRate))) {
        fail("invalid-sample-rate", "Resource preparation requires a finite sample rate");
      }
      let bytes = 0;
      for (const node of __privateGet(this, _nodes).values()) if (["loop-capture", "retrospective-capture"].includes(node.type)) {
        bytes += Math.max(1, Math.round(Math.fround(Math.fround(sampleRate) * Math.fround(node.a)))) * 8;
        if (!Number.isSafeInteger(bytes)) fail("resource-size-overflow", "Capture storage size cannot be represented");
      }
      return bytes;
    }
    find(id) {
      const node = __privateGet(this, _nodes).get(id);
      return node ? new NodeHandle(this, id, __privateGet(this, _generations).get(id), node.type) : void 0;
    }
    connect(from, to) {
      __privateMethod(this, _GraphWorkspace_instances, assertPort_fn).call(this, from, "outputs");
      __privateMethod(this, _GraphWorkspace_instances, assertPort_fn).call(this, to, "inputs");
      if (from.signal !== to.signal) {
        fail(
          "signal-mismatch",
          `${from.signal} cannot connect to ${to.signal}`,
          { from: from.nodeId, to: to.nodeId, inputPort: to.index }
        );
      }
      const key = `${to.nodeId}:${to.index}`;
      if (__privateGet(this, _edges).has(key)) fail("occupied-input", "Graph input is already connected", { to: to.nodeId, inputPort: to.index });
      const descendants = /* @__PURE__ */ new Set([to.nodeId]);
      const queue = [to.nodeId];
      for (let i = 0; i < queue.length; i++) {
        for (const edge of __privateGet(this, _edges).values()) {
          if (edge.from === queue[i] && !descendants.has(edge.to)) {
            descendants.add(edge.to);
            queue.push(edge.to);
          }
        }
      }
      if (descendants.has(from.nodeId)) fail("cycle", "Connection would create a graph cycle");
      __privateGet(this, _edges).set(key, { from: from.nodeId, outputPort: from.index, to: to.nodeId, inputPort: to.index });
      __privateWrapper(this, _revision)._++;
      return this;
    }
    disconnect(to) {
      __privateMethod(this, _GraphWorkspace_instances, assertPort_fn).call(this, to, "inputs");
      if (__privateGet(this, _edges).delete(`${to.nodeId}:${to.index}`)) __privateWrapper(this, _revision)._++;
      return this;
    }
    remove(handle) {
      this.assertHandle(handle);
      if (__privateGet(this, _io) && (__privateGet(this, _io).inputBindings.some((b) => b.nodeId === handle.id) || __privateGet(this, _io).outputBindings.some((b) => b?.nodeId === handle.id))) {
        fail("io-in-use", "Remove host channel bindings before removing this node");
      }
      if (handle.id === 1 || handle.id === 3) fail("reserved-boundary", "Boundary nodes cannot be removed");
      for (const [slot, binding] of __privateGet(this, _hostBindings)) if (binding.nodeId === handle.id) {
        const endpoint = this.listParameters().find((p) => p.nodeId === handle.id && p.id === binding.id);
        if (!__privateGet(this, _hostAssignments).has(slot)) this.reserveHostSlots([{ slot, ...endpoint ? { path: endpoint.path } : {} }]);
      }
      __privateGet(this, _nodes).delete(handle.id);
      if (__privateGet(this, _captureSources).some((source) => source.nodeId === handle.id)) {
        __privateSet(this, _captureSources, __privateGet(this, _captureSources).filter((source) => source.nodeId !== handle.id));
        if (__privateGet(this, _defaultCaptureSourceId) !== null && !__privateGet(this, _captureSources).some((source) => source.id === __privateGet(this, _defaultCaptureSourceId))) {
          __privateSet(this, _defaultCaptureSourceId, __privateGet(this, _captureSources)[0]?.id ?? null);
        }
        if (__privateGet(this, _selectedCaptureSourceId) !== null && !__privateGet(this, _captureSources).some((source) => source.id === __privateGet(this, _selectedCaptureSourceId))) {
          __privateSet(this, _selectedCaptureSourceId, __privateGet(this, _defaultCaptureSourceId));
        }
        __privateSet(this, _selectedCaptureNodeId, __privateGet(this, _captureSources).find((source) => source.id === __privateGet(this, _selectedCaptureSourceId))?.nodeId ?? null);
      }
      if (__privateGet(this, _selectedCaptureNodeId) === handle.id) __privateSet(this, _selectedCaptureNodeId, null);
      __privateGet(this, _assets).delete(handle.id);
      for (const [target, source] of __privateGet(this, _sampleBindings)) {
        if (source === handle.id || target === handle.id) __privateGet(this, _sampleBindings).delete(target);
      }
      for (const key of __privateGet(this, _parameters).keys()) {
        if (key.startsWith(`${handle.id}:`)) {
          __privateGet(this, _parameters).delete(key);
          __privateGet(this, _omittedParameters).delete(key);
        }
      }
      for (const [path, endpoint] of __privateGet(this, _endpoints)) {
        if (endpoint.nodeId === handle.id) __privateGet(this, _endpoints).delete(path);
      }
      for (const [slot, binding] of __privateGet(this, _hostBindings)) {
        if (binding.nodeId === handle.id) __privateGet(this, _hostBindings).delete(slot);
      }
      for (const [path, nodeId] of __privateGet(this, _instances)) {
        if (nodeId === handle.id) __privateGet(this, _instances).delete(path);
      }
      for (const [key, edge] of __privateGet(this, _edges)) {
        if (edge.from === handle.id || edge.to === handle.id) __privateGet(this, _edges).delete(key);
      }
      __privateWrapper(this, _revision)._++;
      return this;
    }
    setParameter(handle, id, value) {
      this.assertHandle(handle);
      const spec = nodeParameters(__privateGet(this, _nodes).get(handle.id)).find((parameter) => parameter.id === id);
      if (!spec || !Number.isFinite(value) || spec.discrete && !Number.isInteger(value) || (spec.choices ? !Number.isInteger(value) || !(spec.choiceValues ?? spec.choices.map((_, index) => index)).includes(value) : value < spec.min || value > spec.max)) {
        fail("invalid-parameter", `Invalid ${handle.type} parameter ${id}`, { nodeId: handle.id, id, value });
      }
      const key = `${handle.id}:${id}`;
      const endpoint = [...__privateGet(this, _endpoints).values()].find((entry) => entry.nodeId === handle.id && entry.id === id);
      if (endpoint && (value < endpoint.min || value > endpoint.max)) {
        fail("invalid-parameter", `Value exceeds published range for ${endpoint.path}`);
      }
      const wasOmitted = __privateGet(this, _omittedParameters).delete(key);
      if (__privateGet(this, _parameters).get(key).value !== value || wasOmitted) {
        __privateGet(this, _parameters).set(key, { nodeId: handle.id, id, value });
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    registerParameter(path, handle, id, { min, max, default: defaultValue }) {
      this.assertHandle(handle);
      if (__privateGet(this, _controls).has(path)) fail("duplicate-endpoint", `Path already belongs to a project control: ${path}`);
      const endpoint = { path, kind: "parameter", nodeId: handle.id, id, min, max, default: defaultValue };
      const checked = validateParameterEndpoints(this.snapshot(), [...__privateGet(this, _endpoints).values(), endpoint]);
      __privateSet(this, _endpoints, new Map(checked.map((entry) => [entry.path, entry])));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    findParameter(path) {
      return __privateGet(this, _endpoints).get(path) ?? null;
    }
    listParameters() {
      return stable([...__privateGet(this, _endpoints).values()].sort(comparePath).map(copy));
    }
    registerInstance(path, handle) {
      this.assertHandle(handle);
      const checked = validateNamedInstances(this.snapshot(), [
        ...this.listInstances(),
        { path, nodeId: handle.id }
      ]);
      __privateSet(this, _instances, new Map(checked.map((entry) => [entry.path, entry.nodeId])));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    findInstance(path) {
      const id = __privateGet(this, _instances).get(path);
      return id === void 0 ? void 0 : this.find(id);
    }
    listInstances() {
      return stable([...__privateGet(this, _instances)].map(([path, nodeId]) => ({ path, nodeId })).sort(comparePath));
    }
    unregisterInstance(path) {
      if (__privateGet(this, _instances).delete(path)) __privateWrapper(this, _revision)._++;
      return this;
    }
    unregisterParameter(path) {
      if (__privateGet(this, _endpoints).delete(path)) __privateWrapper(this, _revision)._++;
      return this;
    }
    bindHostSlot(slot, handle, id) {
      this.assertHandle(handle);
      const candidate = { slot, nodeId: handle.id, id };
      const checked = validateHostBindings(this.snapshot(), [...__privateGet(this, _hostBindings).values(), candidate]);
      const endpoint = this.listParameters().find((p) => p.nodeId === handle.id && p.id === id);
      if (endpoint) this.reserveHostSlots([{ slot, path: endpoint.path }]);
      else if (__privateGet(this, _hostAssignments).has(slot)) fail("reserved-host-slot", "Automation slot is reserved");
      __privateSet(this, _explicitHostBindings, true);
      __privateSet(this, _hostBindings, new Map(checked.map((entry) => [entry.slot, entry])));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    hostSlotForPath(path) {
      const endpoint = this.findParameter(path);
      if (!endpoint) return null;
      const explicit = [...__privateGet(this, _hostBindings).values()].find((binding) => binding.nodeId === endpoint.nodeId && binding.id === endpoint.id);
      if (explicit) return explicit.slot;
      if (__privateGet(this, _explicitHostBindings)) return null;
      const occupied = new Set(__privateGet(this, _hostBindings).keys());
      const targets = new Set([...__privateGet(this, _hostBindings).values()].map((binding) => `${binding.nodeId}:${binding.id}`));
      for (const parameter of this.snapshot().initialParameters) {
        const key = `${parameter.nodeId}:${parameter.id}`;
        if (targets.has(key)) continue;
        let slot = 0;
        while (occupied.has(slot)) slot++;
        if (parameter.nodeId === endpoint.nodeId && parameter.id === endpoint.id) return slot;
        occupied.add(slot);
      }
      return null;
    }
    reserveHostSlots(assignments) {
      const merged = new Map(__privateGet(this, _hostAssignments));
      for (const entry of validateHostAssignments(assignments)) {
        const previous = merged.get(entry.slot);
        if (previous && previous.path !== entry.path)
          fail("reserved-host-slot", `Automation slot belongs to ${previous.path}`);
        merged.set(entry.slot, entry);
      }
      const checked = validateHostAssignments([...merged.values()]);
      __privateSet(this, _hostAssignments, new Map(checked.map((entry) => [entry.slot, entry])));
      __privateSet(this, _explicitHostBindings, true);
      return this;
    }
    listHostAssignments() {
      return stable([...__privateGet(this, _hostAssignments).values()].sort((a, b) => a.slot - b.slot).map(copy));
    }
    listHostBindings() {
      return stable([...__privateGet(this, _hostBindings).values()].sort((a, b) => a.slot - b.slot).map(copy));
    }
    unbindHostSlot(slot) {
      if (__privateGet(this, _hostBindings).has(slot) && !__privateGet(this, _hostAssignments).has(slot)) {
        const binding = __privateGet(this, _hostBindings).get(slot);
        const endpoint = this.listParameters().find((p) => p.nodeId === binding.nodeId && p.id === binding.id);
        this.reserveHostSlots([{ slot, ...endpoint ? { path: endpoint.path } : {} }]);
      }
      if (__privateGet(this, _hostBindings).delete(slot)) __privateWrapper(this, _revision)._++;
      return this;
    }
    registerControl(path, { min, max, default: defaultValue, discrete = false }) {
      const control = { path, min, max, default: defaultValue, value: defaultValue, discrete };
      const checked = validateProjectControls([...__privateGet(this, _controls).values(), control], this.listParameters());
      __privateSet(this, _controls, new Map(checked.map((entry) => [entry.path, entry])));
      __privateWrapper(this, _revision)._++;
      return this;
    }
    setControl(path, value) {
      const previous = __privateGet(this, _controls).get(path);
      if (!previous) fail("unknown-control", `Unknown project control: ${path}`);
      const [next] = validateProjectControls([{ ...previous, value }]);
      if (previous.value !== next.value) {
        __privateGet(this, _controls).set(path, next);
        __privateWrapper(this, _revision)._++;
      }
      return this;
    }
    findControl(path) {
      return __privateGet(this, _controls).get(path) ?? null;
    }
    listControls() {
      return stable([...__privateGet(this, _controls).values()].sort(comparePath).map(copy));
    }
    unregisterControl(path) {
      if (__privateGet(this, _controls).delete(path)) __privateWrapper(this, _revision)._++;
      return this;
    }
    snapshot() {
      return stable({
        revision: __privateGet(this, _revision),
        nodes: [...__privateGet(this, _nodes).values()].sort((a, b) => a.id - b.id).map(copy),
        connections: [...__privateGet(this, _edges).values()].sort(compareEdge).map(copy),
        initialParameters: [...__privateGet(this, _parameters).values()].sort((a, b) => a.nodeId - b.nodeId || a.id - b.id).map(copy),
        endpoints: this.listParameters(),
        hostBindings: this.listHostBindings(),
        hostAssignments: this.listHostAssignments(),
        controls: this.listControls(),
        instances: this.listInstances()
      });
    }
    toProject({ inputSource = __privateGet(this, _inputSource) } = {}) {
      if (!["external", "none"].includes(inputSource)) fail("invalid-input-source", "Input source must be external or none");
      const graph = this.snapshot();
      if (__privateGet(this, _io)) validateIoLayout(__privateGet(this, _io), graph.nodes);
      else {
        if (graph.nodes.filter((n) => n.type === "input.raw").length !== 1) fail("invalid-io", "Additional input nodes need an explicit I/O layout");
        if (!graph.connections.some((edge) => edge.to === 3)) fail("unconnected-output", "Connect an audio source to the output before export");
      }
      return stable({
        format: "manifold.project",
        schemaVersion: 1,
        projectId: "manifold.graph-workspace",
        signal: {
          inputs: __privateGet(this, _io) ? __privateGet(this, _io).inputs.reduce((sum, b) => sum + b.channels, 0) : 2,
          outputs: __privateGet(this, _io) ? __privateGet(this, _io).outputs.reduce((sum, b) => sum + b.channels, 0) : 2,
          ...!__privateGet(this, _io) ? { inputSource } : {},
          ...__privateGet(this, _io) ? { io: __privateGet(this, _io) } : {},
          ...__privateGet(this, _io) || __privateGet(this, _sidechainSource) === void 0 ? {} : { sidechainSource: __privateGet(this, _sidechainSource) },
          nodes: graph.nodes.map(copy),
          connections: graph.connections.map(copy),
          initialParameters: graph.initialParameters.filter((entry) => !__privateGet(this, _omittedParameters).has(`${entry.nodeId}:${entry.id}`)).map(copy),
          ...copy(__privateGet(this, _captureWindow)),
          ...__privateGet(this, _captureSources).length ? {
            captureSources: this.listCaptureSources(),
            defaultCaptureSourceId: __privateGet(this, _defaultCaptureSourceId),
            selectedCaptureSourceId: __privateGet(this, _selectedCaptureSourceId),
            selectedCaptureNodeId: __privateGet(this, _selectedCaptureNodeId)
          } : __privateGet(this, _selectedCaptureNodeId) === null ? {} : {
            selectedCaptureNodeId: __privateGet(this, _selectedCaptureNodeId)
          }
        },
        ...graph.endpoints.length ? { endpoints: graph.endpoints.map(copy) } : {},
        ...__privateGet(this, _explicitHostBindings) || graph.hostBindings.length ? { hostBindings: graph.hostBindings.map(copy) } : {},
        ...graph.hostAssignments.length ? { hostAssignments: graph.hostAssignments.map(copy) } : {},
        ...graph.controls.length ? { controls: graph.controls.map(copy) } : {},
        ...graph.instances.length ? { instances: graph.instances.map(copy) } : {},
        ...__privateGet(this, _assets).size ? { assets: this.listSampleAssets() } : {},
        ...__privateGet(this, _sampleBindings).size ? { sampleBindings: this.listSampleBindings() } : {}
      });
    }
  };
  _nodes = new WeakMap();
  _edges = new WeakMap();
  _parameters = new WeakMap();
  _omittedParameters = new WeakMap();
  _endpoints = new WeakMap();
  _hostBindings = new WeakMap();
  _hostAssignments = new WeakMap();
  _explicitHostBindings = new WeakMap();
  _controls = new WeakMap();
  _instances = new WeakMap();
  _assets = new WeakMap();
  _sampleBindings = new WeakMap();
  _generations = new WeakMap();
  _revision = new WeakMap();
  _inputSource = new WeakMap();
  _captureSources = new WeakMap();
  _defaultCaptureSourceId = new WeakMap();
  _selectedCaptureSourceId = new WeakMap();
  _selectedCaptureNodeId = new WeakMap();
  _sidechainSource = new WeakMap();
  _captureWindow = new WeakMap();
  _io = new WeakMap();
  _GraphWorkspace_instances = new WeakSet();
  insert_fn = function(id, type) {
    const generation = (__privateGet(this, _generations).get(id) ?? 0) + 1;
    __privateGet(this, _generations).set(id, generation);
    __privateGet(this, _nodes).set(id, { id, type, ...copy(PORT_CATALOG[type].args) });
    for (const parameter of WORKSPACE_TYPES[type].parameters ?? []) {
      __privateGet(this, _parameters).set(`${id}:${parameter.id}`, { nodeId: id, id: parameter.id, value: parameter.default });
    }
    return new NodeHandle(this, id, generation, type);
  };
  assertPort_fn = function(ref, direction) {
    if (!(ref instanceof PortRef) || ref.graph !== this || ref.direction !== direction || __privateGet(this, _generations).get(ref.nodeId) !== ref.generation || !__privateGet(this, _nodes).has(ref.nodeId) || nodePorts(__privateGet(this, _nodes).get(ref.nodeId))[direction][ref.index]?.name !== ref.name) {
      fail("stale-port", `Expected a current ${direction} port from this graph`);
    }
  };
  var GraphWorkspace = _GraphWorkspace;
  function createGraphWorkspace() {
    return new GraphWorkspace();
  }
  var _graph, _applyRoute, _applyParameter, _applyParameterBatch, _applyGraph, _readPublishedParameters, _pending, _revision2, _LiveGraphSession_instances, enqueue_fn, adoptParameters_fn, routeChange_fn, parameterBatch_fn, parameterChange_fn;
  var LiveGraphSession = class {
    constructor(graph, applyRoute, applyParameter = null, applyGraph = null, applyParameterBatch = null, readPublishedParameters = null) {
      __privateAdd(this, _LiveGraphSession_instances);
      __privateAdd(this, _graph);
      __privateAdd(this, _applyRoute);
      __privateAdd(this, _applyParameter);
      __privateAdd(this, _applyParameterBatch);
      __privateAdd(this, _applyGraph);
      __privateAdd(this, _readPublishedParameters);
      __privateAdd(this, _pending, Promise.resolve());
      __privateAdd(this, _revision2, 0);
      if (!(graph instanceof GraphWorkspace) || typeof applyRoute !== "function") {
        fail("invalid-live-session", "Live routing needs an authored graph and a host route adapter");
      }
      if (applyParameter !== null && typeof applyParameter !== "function") {
        fail("invalid-live-session", "Parameter adapter must be a function");
      }
      if (applyGraph !== null && typeof applyGraph !== "function") {
        fail("invalid-live-session", "Graph publication adapter must be a function");
      }
      if (applyParameterBatch !== null && typeof applyParameterBatch !== "function") {
        fail("invalid-live-session", "Parameter batch adapter must be a function");
      }
      if (readPublishedParameters !== null && typeof readPublishedParameters !== "function") {
        fail("invalid-live-session", "Published parameter reader must be a function");
      }
      graph.toProject();
      __privateSet(this, _graph, graph.fork());
      __privateSet(this, _applyRoute, applyRoute);
      __privateSet(this, _applyParameter, applyParameter);
      __privateSet(this, _applyGraph, applyGraph);
      __privateSet(this, _applyParameterBatch, applyParameterBatch);
      __privateSet(this, _readPublishedParameters, readPublishedParameters);
    }
    snapshot() {
      return stable({ ...__privateGet(this, _graph).snapshot(), revision: __privateGet(this, _revision2) });
    }
    toProject() {
      return __privateGet(this, _graph).toProject();
    }
    forkGraph() {
      return __privateGet(this, _graph).fork();
    }
    /** Save new PCM only after the prepared host accepts the same shared source. */
    sampleAsset(nodeId, stereo, sourceRate, label, applySample) {
      if (typeof applySample !== "function") fail("sample-unavailable", "Prepared host has no sample adapter");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, async () => {
        const staged = __privateGet(this, _graph).fork();
        const node = staged.find(nodeId);
        if (!node) fail("missing-node", `Sample node ${nodeId} is unavailable`);
        staged.setSampleAsset(node, stereo, sourceRate, label);
        const project = staged.toProject();
        const bindingTargets = staged.listSampleBindings().filter((binding) => binding.sourceNodeId === nodeId).map((binding) => binding.nodeId);
        const accepted = await applySample(nodeId, sourceRate, stereo, bindingTargets);
        if (accepted === false) fail("host-rejected-sample", "Prepared host rejected the Sample source");
        __privateSet(this, _graph, staged);
        __privateWrapper(this, _revision2)._++;
        return project;
      });
    }
    configureCaptureWindow(settings) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => {
        const staged = __privateGet(this, _graph).fork();
        staged.configureCaptureWindow(settings);
        const project = staged.toProject();
        __privateSet(this, _graph, staged);
        __privateWrapper(this, _revision2)._++;
        return project;
      });
    }
    selectCaptureSource(id) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => {
        const staged = __privateGet(this, _graph).fork();
        staged.selectCaptureSource(id);
        const project = staged.toProject();
        __privateSet(this, _graph, staged);
        __privateWrapper(this, _revision2)._++;
        return project;
      });
    }
    /** Adopt DSP targets already accepted by this host; never submit audio work.
     * Queue with edits so a host snapshot cannot overwrite a pending transaction.
     * Authored controls, instance paths, routes and script-local state survive.
     */
    adoptPublishedParameters(edits) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, adoptParameters_fn).call(this, edits));
    }
    route({ to, input, from = null, output: output2 } = {}) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, routeChange_fn).call(this, { to, input, from, output: output2 }));
    }
    /** Commit one saved project control with the route acknowledged by a prepared host. */
    routeWithControl(route, { path, value } = {}) {
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, routeChange_fn).call(this, route, { path, value }));
    }
    parameter({ nodeId, id, value } = {}) {
      if (!__privateGet(this, _applyParameter)) fail("parameter-unavailable", "Prepared host has no parameter adapter");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, parameterChange_fn).call(this, nodeId, id, value));
    }
    /** Commit a project control and its derived DSP parameter after host acknowledgement. */
    parameterWithControl(parameter, { path, value } = {}) {
      if (!__privateGet(this, _applyParameter)) fail("parameter-unavailable", "Prepared host has no parameter adapter");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => __privateMethod(this, _LiveGraphSession_instances, parameterChange_fn).call(this, parameter?.nodeId, parameter?.id, parameter?.value, { path, value }));
    }
    /** Apply a bounded group between blocks and save its control on one host acknowledgement. */
    parametersWithControl(edits, { path, value } = {}) {
      return __privateMethod(this, _LiveGraphSession_instances, parameterBatch_fn).call(this, edits, { path, value });
    }
    /** Apply direct parameter targets as one acknowledged, bounded group. */
    parameters(edits) {
      return __privateMethod(this, _LiveGraphSession_instances, parameterBatch_fn).call(this, edits);
    }
    parameterPath(path, value) {
      if (!__privateGet(this, _applyParameter)) fail("parameter-unavailable", "Prepared host has no parameter adapter");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, () => {
        const endpoint = __privateGet(this, _graph).findParameter(path);
        if (!endpoint) fail("unknown-parameter-path", `Unknown project parameter: ${path}`);
        if (!Number.isFinite(value) || value < endpoint.min || value > endpoint.max) {
          fail("invalid-parameter", `Invalid project parameter: ${path}`);
        }
        return __privateMethod(this, _LiveGraphSession_instances, parameterChange_fn).call(this, endpoint.nodeId, endpoint.id, value);
      });
    }
    transaction(edit) {
      if (!__privateGet(this, _applyGraph)) fail("structural-unavailable", "Prepared host has no graph publication adapter");
      if (typeof edit !== "function") fail("invalid-graph-edit", "Graph edit must be a function");
      return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, async () => {
        const staged = __privateGet(this, _graph).fork();
        await edit(staged);
        const project = staged.toProject();
        const accepted = await __privateGet(this, _applyGraph).call(this, project);
        if (accepted === false) fail("host-rejected-graph", "Prepared host rejected the graph transaction");
        __privateSet(this, _graph, staged);
        __privateWrapper(this, _revision2)._++;
        return project;
      });
    }
  };
  _graph = new WeakMap();
  _applyRoute = new WeakMap();
  _applyParameter = new WeakMap();
  _applyParameterBatch = new WeakMap();
  _applyGraph = new WeakMap();
  _readPublishedParameters = new WeakMap();
  _pending = new WeakMap();
  _revision2 = new WeakMap();
  _LiveGraphSession_instances = new WeakSet();
  enqueue_fn = function(change) {
    const result = __privateGet(this, _pending).then(async () => {
      if (__privateGet(this, _readPublishedParameters)) {
        __privateMethod(this, _LiveGraphSession_instances, adoptParameters_fn).call(this, await __privateGet(this, _readPublishedParameters).call(this));
      }
      const changed = await change();
      if (__privateGet(this, _readPublishedParameters)) {
        __privateMethod(this, _LiveGraphSession_instances, adoptParameters_fn).call(this, await __privateGet(this, _readPublishedParameters).call(this));
      }
      return changed?.format === "manifold.project" ? __privateGet(this, _graph).toProject() : changed;
    });
    __privateSet(this, _pending, result.then(() => {
    }, () => {
    }));
    return result;
  };
  adoptParameters_fn = function(edits) {
    if (!Array.isArray(edits)) fail("invalid-parameter-snapshot", "Published parameters must be an array");
    const staged = __privateGet(this, _graph).fork();
    const seen = /* @__PURE__ */ new Set();
    for (const { nodeId, id, value } of edits) {
      const key = `${nodeId}:${id}`;
      if (seen.has(key)) fail("invalid-parameter-snapshot", `Duplicate published parameter: ${key}`);
      seen.add(key);
      const node = staged.find(nodeId);
      if (!node) fail("missing-node", `Published parameter node ${nodeId} is unavailable`);
      staged.setParameter(node, id, value);
    }
    const project = staged.toProject();
    if (JSON.stringify(project.signal.initialParameters) !== JSON.stringify(__privateGet(this, _graph).toProject().signal.initialParameters)) {
      __privateSet(this, _graph, staged);
      __privateWrapper(this, _revision2)._++;
    }
    return __privateGet(this, _graph).toProject();
  };
  routeChange_fn = async function({ to, input, from = null, output: output2 } = {}, control = null) {
    const staged = __privateGet(this, _graph).fork();
    if (control) staged.setControl(control.path, control.value);
    const target = staged.find(to);
    if (!target) fail("missing-node", `Target node ${to} is unavailable`);
    const targetPort = target.input(input);
    staged.disconnect(targetPort);
    let sourcePort;
    if (from !== null) {
      const source = staged.find(from);
      if (!source) fail("missing-node", `Source node ${from} is unavailable`);
      sourcePort = source.output(output2);
      staged.connect(sourcePort, targetPort);
    }
    staged.toProject();
    const accepted = await __privateGet(this, _applyRoute).call(this, {
      to,
      inputPort: targetPort.index,
      from,
      outputPort: sourcePort?.index ?? 0
    });
    if (accepted === false) fail("host-rejected-route", "Prepared host rejected the route");
    __privateSet(this, _graph, staged);
    __privateWrapper(this, _revision2)._++;
    return __privateGet(this, _graph).toProject();
  };
  parameterBatch_fn = function(edits, control = null) {
    if (!__privateGet(this, _applyParameterBatch)) fail("batch-unavailable", "Prepared host has no parameter batch adapter");
    return __privateMethod(this, _LiveGraphSession_instances, enqueue_fn).call(this, async () => {
      if (!Array.isArray(edits) || edits.length < 1) {
        fail("invalid-parameter-batch", "Parameter batch must contain at least one edit");
      }
      const staged = __privateGet(this, _graph).fork();
      if (control) staged.setControl(control.path, control.value);
      for (const edit of edits) {
        const node = staged.find(edit.nodeId);
        if (!node) fail("missing-node", `Parameter node ${edit.nodeId} is unavailable`);
        staged.setParameter(node, edit.id, edit.value);
      }
      const project = staged.toProject();
      const accepted = await __privateGet(this, _applyParameterBatch).call(this, edits.map((edit) => ({
        nodeId: edit.nodeId,
        id: edit.id,
        value: edit.value
      })));
      if (accepted === false) fail("host-rejected-parameter-batch", "Prepared host rejected the parameter batch");
      __privateSet(this, _graph, staged);
      __privateWrapper(this, _revision2)._++;
      return project;
    });
  };
  parameterChange_fn = async function(nodeId, id, value, control = null) {
    const staged = __privateGet(this, _graph).fork();
    if (control) staged.setControl(control.path, control.value);
    const node = staged.find(nodeId);
    if (!node) fail("missing-node", `Parameter node ${nodeId} is unavailable`);
    staged.setParameter(node, id, value);
    const project = staged.toProject();
    const accepted = await __privateGet(this, _applyParameter).call(this, { nodeId, id, value });
    if (accepted === false) fail("host-rejected-parameter", "Prepared host rejected the parameter");
    __privateSet(this, _graph, staged);
    __privateWrapper(this, _revision2)._++;
    return project;
  };
  function createLiveGraphSession(graph, applyRoute, applyParameter, applyGraph, applyParameterBatch, readPublishedParameters) {
    return new LiveGraphSession(graph, applyRoute, applyParameter, applyGraph, applyParameterBatch, readPublishedParameters);
  }

  // packages/manifold-author/primitives.js
  var adsr = getPrimitive("adsr");
  var attenuverterBias = getPrimitive("attenuverter-bias");
  var audioFm = getPrimitive("audio-fm");
  var audioSync = getPrimitive("audio-sync");
  var bitCrusher = getPrimitive("bit-crusher");
  var chorus = getPrimitive("chorus");
  var compressor = getPrimitive("compressor");
  var constant = getPrimitive("constant");
  var crossfader = getPrimitive("crossfader");
  var cvCompare = getPrimitive("cv-compare");
  var cvMix = getPrimitive("cv-mix");
  var cvRange = getPrimitive("cv-range");
  var distortion = getPrimitive("distortion");
  var effectSlotLegacy = getPrimitive("effect-slot-legacy");
  var envelopeControl = getPrimitive("envelope-control");
  var envelopeFollower = getPrimitive("envelope-follower");
  var eq8 = getPrimitive("eq8");
  var extendedOscillator = getPrimitive("extended-oscillator");
  var fftSpectrum = getPrimitive("fft-spectrum");
  var fixedGain = getPrimitive("fixed-gain");
  var formantFilter = getPrimitive("formant-filter");
  var gain = getPrimitive("gain");
  var granulator = getPrimitive("granulator");
  var inputRaw = getPrimitive("input.raw");
  var inputSidechain = getPrimitive("input.sidechain");
  var legacyFilter = getPrimitive("legacy-filter");
  var lfo = getPrimitive("lfo");
  var limiter = getPrimitive("limiter");
  var linearBlend = getPrimitive("linear-blend");
  var loopCapture = getPrimitive("loop-capture");
  var mainVoiceBank = getPrimitive("main-voice-bank");
  var midiArpeggiator = getPrimitive("midi-arpeggiator");
  var midiInput = getPrimitive("midi-input");
  var midiNoteFilter = getPrimitive("midi-note-filter");
  var midiScaleQuantizer = getPrimitive("midi-scale-quantizer");
  var midiTranspose = getPrimitive("midi-transpose");
  var midiVelocityMapper = getPrimitive("midi-velocity-mapper");
  var mixer = getPrimitive("mixer");
  var mixer9 = getPrimitive("mixer9");
  var modulatedGain = getPrimitive("modulated-gain");
  var modulatedSvf = getPrimitive("modulated-svf");
  var multitapDelay = getPrimitive("multitap-delay");
  var noise = getPrimitive("noise");
  var oscillator = getPrimitive("oscillator");
  var output = getPrimitive("output");
  var phaseVocoder = getPrimitive("phase-vocoder");
  var phaser = getPrimitive("phaser");
  var phraseGain = getPrimitive("phrase-gain");
  var pitchShifter = getPrimitive("pitch-shifter");
  var pulseOscillator = getPrimitive("pulse-oscillator");
  var resonator = getPrimitive("resonator");
  var retrospectiveCapture = getPrimitive("retrospective-capture");
  var reverb = getPrimitive("reverb");
  var reverseDelay = getPrimitive("reverse-delay");
  var ringModulator = getPrimitive("ring-modulator");
  var sampleHold = getPrimitive("sample-hold");
  var sampleInstrument = getPrimitive("sample-instrument");
  var sampleRegion = getPrimitive("sample-region");
  var shimmer = getPrimitive("shimmer");
  var slewAudio = getPrimitive("slew-audio");
  var slewControl = getPrimitive("slew-control");
  var spectrumAnalyzer = getPrimitive("spectrum-analyzer");
  var stereoDelay = getPrimitive("stereo-delay");
  var stereoWidener = getPrimitive("stereo-widener");
  var stutter = getPrimitive("stutter");
  var sum2 = getPrimitive("sum2");
  var svf = getPrimitive("svf");
  var threeBandEq = getPrimitive("three-band-eq");
  var transientShaper = getPrimitive("transient-shaper");
  var voiceSynth = getPrimitive("voice-synth");
  var waveShaper = getPrimitive("wave-shaper");

  // packages/manifold-author/examples/main-voice-control.mjs
  var fresh = () => ({
    active: false,
    note: null,
    gate: 0,
    stamp: 0,
    targetAmp: 0,
    currentAmp: 0,
    sentAmp: 0,
    lastAmpPushTime: 0,
    frequency: 220,
    envelopeStage: "idle",
    envelopeTime: 0,
    envelopeLevel: 0,
    envelopeStartLevel: 0
  });
  function chooseMainVoice(voices) {
    const idle = voices.findIndex((v) => !v.active || v.envelopeStage === "idle");
    if (idle >= 0) return idle;
    let release = -1;
    for (let index = 0; index < voices.length; index++) {
      if (voices[index].envelopeStage === "release" && (release < 0 || voices[index].envelopeLevel < voices[release].envelopeLevel))
        release = index;
    }
    if (release >= 0) return release;
    return voices.reduce((oldest, v, index) => v.stamp < voices[oldest].stamp ? index : oldest, 0);
  }
  function advanceMainEnvelope(voice, adsr2, dt) {
    let stage = voice.envelopeStage, level = voice.envelopeLevel;
    if (voice.gate > 0.5) {
      if (stage === "idle" || stage === "release") {
        stage = "attack";
        voice.envelopeStartLevel = level;
      }
      if (stage === "attack") {
        const progress = voice.envelopeTime / Math.max(1e-3, adsr2.attack);
        if (progress >= 1) {
          level = 1;
          stage = "decay";
          voice.envelopeTime = 0;
          voice.envelopeStartLevel = 1;
        } else level = voice.envelopeStartLevel + (1 - voice.envelopeStartLevel) * progress;
      } else if (stage === "decay") {
        const progress = voice.envelopeTime / Math.max(1e-3, adsr2.decay);
        if (progress >= 1) {
          level = adsr2.sustain;
          stage = "sustain";
        } else level = 1 - (1 - adsr2.sustain) * progress;
      } else if (stage === "sustain") level = adsr2.sustain;
    } else {
      if (stage !== "release" && stage !== "idle") {
        stage = "release";
        voice.envelopeTime = 0;
        voice.envelopeStartLevel = level;
      }
      if (stage === "release") {
        const progress = voice.envelopeTime / Math.max(1e-3, adsr2.release);
        if (progress >= 1) {
          level = 0;
          stage = "idle";
        } else level = voice.envelopeStartLevel * (1 - progress);
      }
    }
    voice.envelopeStage = stage;
    voice.envelopeLevel = level;
    voice.envelopeTime += dt;
    voice.currentAmp = level * Math.max(0, voice.targetAmp);
    return voice.currentAmp;
  }
  function createMainVoiceControl(project, adsrValues = () => ({ attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.4 })) {
    let voices = Array.from({ length: 8 }, fresh), stamp = 0, chain = Promise.resolve();
    const enqueue = (operation) => {
      const result = chain.then(operation);
      chain = result.catch(() => {
      });
      return result;
    };
    return {
      snapshot: () => voices.map((v) => ({ ...v })),
      on(note, velocity = 100) {
        return enqueue(async () => {
          if (!Number.isInteger(note) || note < 0 || note > 127 || !Number.isInteger(velocity) || velocity < 1 || velocity > 127)
            throw new Error("Invalid note/velocity");
          const index = chooseMainVoice(voices), frequency = Math.max(20, Math.min(8e3, 440 * 2 ** ((note - 69) / 12)));
          await project.setVoices([{ index: index + 1, frequency }]);
          voices[index] = {
            ...fresh(),
            active: true,
            note,
            gate: 1,
            stamp: ++stamp,
            targetAmp: Math.max(0, Math.min(0.4, 0.03 + velocity / 127 * 0.37)),
            frequency,
            envelopeStage: "attack",
            sentAmp: -1
          };
          return project.toProject();
        });
      },
      off(note) {
        return enqueue(() => {
          if (!Number.isInteger(note) || note < 0 || note > 127) throw new Error("Invalid note");
          for (const voice of voices)
            if (voice.active && voice.note === note) {
              voice.gate = 0;
              voice.envelopeStage = "release";
              voice.envelopeTime = 0;
              voice.envelopeStartLevel = voice.envelopeLevel;
              voice.lastAmpPushTime = 0;
            }
          return project.toProject();
        });
      },
      advance(dt, now) {
        return enqueue(async () => {
          if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(now) || now < 0)
            throw new Error("Invalid control clock");
          const next = voices.map((v) => ({ ...v })), edits = [], adsr2 = adsrValues();
          for (const [index, voice] of next.entries()) {
            const amplitude = advanceMainEnvelope(voice, adsr2, dt);
            const changed = Math.abs(amplitude - voice.sentAmp) >= 15e-4;
            const rest = amplitude <= 15e-4 && voice.sentAmp > 15e-4;
            if (changed && (now - voice.lastAmpPushTime >= 1 / 60 || rest)) {
              edits.push({ index: index + 1, amplitude });
              voice.sentAmp = amplitude;
              voice.lastAmpPushTime = now;
            }
          }
          if (edits.length) await project.setVoices(edits);
          voices = next;
          return project.toProject();
        });
      },
      panic() {
        return enqueue(async () => {
          await project.setVoices(voices.map((_, index) => ({ index: index + 1, amplitude: 0 })));
          voices = Array.from({ length: 8 }, fresh);
          stamp = 0;
          return project.toProject();
        });
      }
    };
  }

  // packages/manifold-author/examples/main-wave-graph.mjs
  var MAIN_SYNTH = "/midi/synth";
  var voiceBase = (index) => `${MAIN_SYNTH}/voice/${index}`;
  var nodePath = (index, name) => `${voiceBase(index)}/nodes/${name}`;
  var ranges = {
    waveform: [0, 7, 1, true],
    pulseWidth: [0.01, 0.99, 0.5],
    drive: [0, 20, 0],
    driveShape: [0, 3, 0, true],
    driveBias: [-1, 1, 0],
    driveMix: [0, 1, 1],
    unison: [1, 8, 1, true],
    detune: [0, 100, 0],
    spread: [0, 1, 0],
    "blend/amount": [0, 1, 0.5]
  };
  var oscillatorIds = {
    waveform: 0,
    pulseWidth: 4,
    drive: 5,
    driveShape: 6,
    driveBias: 7,
    driveMix: 8,
    unison: 10,
    detune: 11,
    spread: 12
  };
  function addMainWaveVoice(graph, { index, firstNodeId, sample = null }) {
    const add = (type, name, offset) => {
      const node = graph.add(type.startsWith("mixer") ? "mixer" : type, {
        id: firstNodeId + offset,
        config: type.startsWith("mixer") ? { inputs: Number(type.slice(5)) } : {}
      });
      graph.registerInstance(nodePath(index, name), node);
      return node;
    };
    const oscillator2 = add("extended-oscillator", "oscillator", 0);
    const mix = add("crossfader", "mix", 1);
    const direction = add("crossfader", "direction", 2);
    const select = add("crossfader", "base_select", 3);
    const branches = add("mixer3", "branches", 4);
    const voice = add("mixer4", "output", 5);
    for (const node of [mix, direction]) {
      graph.connect(oscillator2.output("out"), node.input("a"));
      if (sample) graph.connect(sample, node.input("b"));
    }
    graph.setParameter(select, 0, -1);
    graph.connect(mix.output("out"), select.input("a"));
    graph.connect(direction.output("out"), select.input("b"));
    graph.setParameter(branches, 2, 0).setParameter(branches, 3, 0);
    graph.connect(select.output("out"), branches.input("in-1"));
    for (let input = 1; input <= 3; input++) graph.setParameter(voice, input, 0);
    graph.connect(branches.output("out"), voice.input("in-4"));
    graph.registerParameter(`${voiceBase(index)}/freq`, oscillator2, 1, {
      min: 20,
      max: 8e3,
      default: 220
    });
    graph.registerParameter(`${voiceBase(index)}/amp`, oscillator2, 2, {
      min: 0,
      max: 0.5,
      default: 0
    });
    graph.registerControl(`${voiceBase(index)}/gate`, {
      min: 0,
      max: 1,
      default: 0
    });
    return { oscillator: oscillator2, mix, direction, select, branches, output: voice };
  }
  function addMainWaveVoices(graph, { firstNodeId = 10, mixerId = 60 } = {}) {
    const mixer2 = graph.add(mixer.type, {
      id: mixerId,
      config: { inputs: 8 }
    });
    graph.registerInstance(`${MAIN_SYNTH}/nodes/voice_mixer`, mixer2);
    const voices = Array.from({ length: 8 }, (_, index) => {
      const voice = addMainWaveVoice(graph, {
        index: index + 1,
        firstNodeId: firstNodeId + index * 6
      });
      graph.connect(voice.output.output("out"), mixer2.input(`in-${index + 1}`));
      return voice;
    });
    for (const [key, [min, max, value, discrete = false]] of Object.entries(ranges)) {
      graph.registerControl(`${MAIN_SYNTH}/${key}`, {
        min,
        max,
        default: value,
        discrete
      });
    }
    return { voices, output: mixer2 };
  }
  function addMainSignalBranches(graph, { synth, layerInputs = [], layerOutputs = [], firstNodeId = 70, connectOutput = true } = {}) {
    if (!synth || layerInputs.length > 4 || layerOutputs.length > 4) {
      throw new GraphContractError(
        "invalid-main-branches",
        "Provide a synth output and at most four layer buses"
      );
    }
    const add = (name, type, offset) => {
      const node = graph.add(type.startsWith("mixer") ? "mixer" : type, {
        id: firstNodeId + offset,
        config: type.startsWith("mixer") ? { inputs: Number(type.slice(5)) } : {}
      });
      graph.registerInstance(`/main/nodes/${name}`, node);
      return node;
    };
    const trim = add("input_trim", "gain", 0), monitor = add("input_monitor", "gain", 1);
    const synthMonitor = add("synth_monitor", "gain", 2), send = add("synth_send", "gain", 3);
    const layers = add("layer_mixer", "mixer4", 4), mix = add("main_mixer", "mixer3", 5);
    const master = add("master", "gain", 6);
    for (const node of [trim, monitor, send, master]) graph.setParameter(node, 0, 1);
    graph.setParameter(synthMonitor, 0, 0.8);
    graph.connect(graph.input.output("out"), trim.input("audio"));
    graph.connect(trim.output("out"), monitor.input("audio"));
    graph.connect(synth, synthMonitor.input("audio"));
    graph.connect(synth, send.input("audio"));
    layerInputs.forEach((target, index) => {
      const sum = add(`layer_${index + 1}_input`, "sum2", 7 + index);
      graph.connect(trim.output("out"), sum.input("a"));
      graph.connect(send.output("out"), sum.input("b"));
      graph.connect(sum.output("out"), target);
    });
    layerOutputs.forEach((source, index) => graph.connect(source, layers.input(`in-${index + 1}`)));
    graph.connect(synthMonitor.output("out"), mix.input("in-1"));
    graph.connect(layers.output("out"), mix.input("in-2"));
    graph.connect(monitor.output("out"), mix.input("in-3"));
    graph.connect(mix.output("out"), master.input("audio"));
    if (connectOutput) graph.connect(master.output("out"), graph.output.input("in"));
    for (const [name, node, value] of [
      ["inputTrim", trim, 1],
      ["inputMonitor", monitor, 1],
      ["output", synthMonitor, 0.8],
      ["captureSend", send, 1],
      ["master", master, 1]
    ]) {
      graph.registerParameter(`${MAIN_SYNTH}/${name}`, node, 0, {
        min: 0,
        max: 2,
        default: value
      });
    }
    return { trim, monitor, synthMonitor, send, layers, mix, master };
  }
  function buildGraph({ captureLayers = false } = {}) {
    const graph = createGraphWorkspace().setInputSource("external");
    const { output: output2 } = addMainWaveVoices(graph);
    const captures = captureLayers ? Array.from({ length: 4 }, (_, index) => {
      const node = graph.add(retrospectiveCapture.type, {
        id: 90 + index
      });
      graph.registerInstance(`/main/layer/${index + 1}/capture`, node);
      return node.input("audio");
    }) : [];
    addMainSignalBranches(graph, {
      synth: output2.output("out"),
      layerInputs: captures
    });
    return graph;
  }
  function createProject(host, graph = buildGraph()) {
    const session = createLiveGraphSession(
      graph,
      (route) => host.setRoute(route),
      (edit) => host.setParameter(edit),
      (document) => host.replaceGraph(document),
      (edits) => host.setParameterBatch(edits)
    );
    const api = {
      session,
      toProject: () => session.toProject(),
      adoptPublishedParameters: (edits) => session.adoptPublishedParameters(edits),
      async set(path, value) {
        const document = session.toProject();
        if (document.endpoints.some((endpoint) => endpoint.path === path))
          return session.parameterPath(path, value);
        const instances = new Map(document.instances.map((entry) => [entry.path, entry.nodeId]));
        const gate = path.match(/^\/midi\/synth\/voice\/([1-8])\/gate$/);
        if (gate) {
          const nodeId = instances.get(nodePath(Number(gate[1]), "oscillator"));
          const amplitude = document.signal.initialParameters.find((p) => p.nodeId === nodeId && p.id === 2)?.value ?? 0;
          return session.parameterWithControl({ nodeId, id: 2, value: amplitude }, { path, value });
        }
        const name = path.slice(`${MAIN_SYNTH}/`.length);
        if (!path.startsWith(`${MAIN_SYNTH}/`) || !Object.hasOwn(ranges, name)) {
          throw new GraphContractError("unknown-control", `Unknown Main Wave control: ${path}`);
        }
        const edits = [];
        for (let index = 1; index <= 8; index++) {
          if (name === "blend/amount")
            for (const branch of ["mix", "direction"]) {
              edits.push({
                nodeId: instances.get(nodePath(index, branch)),
                id: 0,
                value: value * 2 - 1
              });
            }
          else
            edits.push({
              nodeId: instances.get(nodePath(index, "oscillator")),
              id: oscillatorIds[name],
              value
            });
        }
        return session.parametersWithControl(edits, { path, value });
      },
      setVoices(values) {
        const instances = new Map(
          session.toProject().instances.map((entry) => [entry.path, entry.nodeId])
        );
        return session.parameters(
          values.flatMap(({ index, frequency, amplitude }) => {
            if (!Number.isInteger(index) || index < 1 || index > 8)
              throw new Error("Choose voice 1\u20138");
            const nodeId = instances.get(nodePath(index, "oscillator"));
            return [
              ...frequency === void 0 ? [] : [{ nodeId, id: 1, value: frequency }],
              ...amplitude === void 0 ? [] : [{ nodeId, id: 2, value: amplitude }]
            ];
          })
        );
      },
      setInsert(enabled) {
        return session.transaction((candidate) => {
          const output2 = candidate.findInstance("/main/nodes/master");
          candidate.disconnect(candidate.output.input("in"));
          if (candidate.find(100)) candidate.remove(candidate.find(100));
          if (enabled) {
            const unity = candidate.add(fixedGain.type, {
              id: 100,
              config: { gain: 1 }
            });
            candidate.registerInstance("/main/nodes/review_insert", unity);
            candidate.connect(output2.output("out"), unity.input("audio"));
            candidate.connect(unity.output("out"), candidate.output.input("in"));
          } else candidate.connect(output2.output("out"), candidate.output.input("in"));
        });
      }
    };
    return api;
  }

  // examples/projects/main-wave-project.mjs
  function controller(host, graph) {
    const wave = createProject(host, graph), voices = createMainVoiceControl(wave);
    return {
      ...wave,
      noteOn: (note, velocity) => voices.on(note, velocity),
      noteOff: (note) => voices.off(note),
      advance: (dt, now) => voices.advance(dt, now),
      panic: () => voices.panic(),
      voiceSnapshot: () => voices.snapshot()
    };
  }
  var createProject2 = (host) => controller(host, buildGraph({ captureLayers: true }));
  var restoreProject = (host, saved) => controller(host, GraphWorkspace.fromProject(saved));
  return __toCommonJS(main_wave_project_exports);
})();
