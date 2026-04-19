
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);
    vec2 texel = vec2(texelScale);
    float t = uTime * speed;

    float flowSpeed = param1 * 0.01 * intensity * (0.85 + 0.15 * sin(t));
    vec2 sampleUv = uv - vec2(0.0, flowSpeed);

    float left  = dot(texture(uFeedbackTex, sampleUv - vec2(texel.x, 0.0)).rgb, vec3(0.333));
    float right = dot(texture(uFeedbackTex, sampleUv + vec2(texel.x, 0.0)).rgb, vec3(0.333));
    float down  = dot(texture(uFeedbackTex, sampleUv - vec2(0.0, texel.y)).rgb, vec3(0.333));
    float up    = dot(texture(uFeedbackTex, sampleUv + vec2(0.0, texel.y)).rgb, vec3(0.333));

    sampleUv.x += (down - up) * turbulenceScale * intensity;
    sampleUv.y += (right - left) * turbulenceScale * intensity;

    vec4 history = texture(uFeedbackTex, clamp(sampleUv, 0.0, 1.0));

    float decay = mix(decayMin, decayMax, param2);
    vec3 smoke = history.rgb * decay;

    vec3 result = max(smoke, liveVid.rgb);

    fragColor = vec4(result, 1.0);
