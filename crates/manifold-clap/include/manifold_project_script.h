#ifndef MANIFOLD_PROJECT_SCRIPT_H
#define MANIFOLD_PROJECT_SCRIPT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <clap/clap.h>

#define MANIFOLD_PROJECT_SCRIPT_EXTENSION "manifold.project.script.v1"

/* Control-thread API for a loaded Manifold project package. The editor need
 * not be open. Request generation becomes audible at an audio block boundary.
 * status: 0 pending, 1 accepted, 2 rejected or unknown generation. */
typedef struct manifold_project_script {
    bool (*set_path)(const clap_plugin_t *plugin, const char *path, double value,
                     uint64_t *generation);
    uint32_t (*status)(const clap_plugin_t *plugin, uint64_t generation);
    bool (*call_json)(const clap_plugin_t *plugin, const char *method,
                      const uint8_t *args_json, size_t args_len,
                      uint64_t *generation);
} manifold_project_script_t;

#endif
