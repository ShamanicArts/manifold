vec4 base = texture2D(uBaseTex, vUv);
vec4 blend = texture2D(uBlendTex, vUv);
vec3 added = base.rgb + blend.rgb * gain + vec3(bias);
vec3 result = mix(added, clamp(added, 0.0, 1.0), softClamp);
fragColor = vec4(mix(base.rgb, result, uOpacity), max(base.a, blend.a));
