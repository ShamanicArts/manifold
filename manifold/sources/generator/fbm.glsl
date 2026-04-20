vec2 uv = vUv * max(0.5, scale);
vec2 drift = vec2(uTime * speed * 0.25, uTime * speed * 0.11);
float n = fbm4(uv + drift);
vec3 col = mix(vec3(0.03, 0.05, 0.08), vec3(0.87, 0.93, 0.98), clamp(n, 0.0, 1.0));
fragColor = vec4(col, 1.0);
