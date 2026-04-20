vec2 uv = vUv * max(1.0, scale);
float n = noise2(uv + vec2(uTime * speed * 0.7, uTime * speed * 0.21));
n = mix(0.5, n, max(0.0, contrast));
fragColor = vec4(vec3(clamp(n, 0.0, 1.0)), 1.0);
