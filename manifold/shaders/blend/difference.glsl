vec4 base = texture2D(uBaseTex, vUv);
vec4 blend = texture2D(uBlendTex, vUv);
vec3 diffed = abs(base.rgb - blend.rgb * strength);
vec3 result = clamp((diffed - 0.5) * contrast + 0.5 + vec3(bias), 0.0, 1.0);
fragColor = vec4(mix(base.rgb, result, uOpacity), max(base.a, blend.a));
