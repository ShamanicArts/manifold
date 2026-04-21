vec4 base = texture2D(uBaseTex, vUv);
vec4 blend = texture2D(uBlendTex, vUv);
vec3 baseRgb = base.rgb * baseLevel;
vec3 topRgb = pow(max(blend.rgb * topLevel, vec3(0.0)), vec3(1.0 / max(topGamma, 0.001)));
vec3 result = mix(baseRgb, topRgb, blend.a * uOpacity);
fragColor = vec4(result, max(base.a, blend.a));
