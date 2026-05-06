vec4 base = texture2D(uBaseTex, vUv);
vec4 blend = texture2D(uBlendTex, vUv);
vec3 screened = 1.0 - (1.0 - base.rgb) * (1.0 - mix(vec3(0.0), blend.rgb, strength));
vec3 shaped = pow(max(screened + vec3(bias), vec3(0.0)), vec3(1.0 / max(gamma, 0.001)));
fragColor = vec4(mix(base.rgb, shaped, blend.a * uOpacity), max(base.a, blend.a));
