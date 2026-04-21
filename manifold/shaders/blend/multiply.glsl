vec4 base = texture2D(uBaseTex, vUv);
vec4 blend = texture2D(uBlendTex, vUv);
vec3 multiplied = base.rgb * mix(vec3(1.0), blend.rgb, strength) + vec3(lift);
vec3 result = pow(max(multiplied, vec3(0.0)), vec3(1.0 / max(gamma, 0.001)));
fragColor = vec4(mix(base.rgb, result, uOpacity), max(base.a, blend.a));
