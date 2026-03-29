# GDB script for debugging DSP loading issues
# Run with: gdb -x debug_dsp.gdb ./build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold

# Set up logging
set logging on
set logging file gdb_dsp.log
set logging overwrite on

# Break on DSP script loading
break DSPPluginScriptHost.cpp:loadScript
break DSPPluginScriptHost.cpp:4994

# Break on Lua errors
break lua_error
break sol::error

# Run the application
run

# When we hit a breakpoint, print the script path
commands
  silent
  printf "Loading script: %s\n", scriptFile->getFullPathName().toStdString().c_str()
  continue
end

# Continue execution
continue
