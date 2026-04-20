vec4 base = texture2D(uBaseTex, vUv);
vec4 blend = texture2D(uBlendTex, vUv);
vec3 result = mix(base.rgb, blend.rgb, blend.a * uOpacity);
fragColor = vec4(result, base.a);
