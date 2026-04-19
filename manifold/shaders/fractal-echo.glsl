
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);

    vec2 center = uv - 0.5;

    float zoom = 1.0 - (0.005 + param1 * 0.025) * intensity;
    center *= zoom;

    float angle = (0.003 + param2 * 0.02) * intensity * speed;
    float co = cos(angle);
    float si = sin(angle);
    center = vec2(center.x * co - center.y * si, center.x * si + center.y * co);

    vec2 feedbackUv = clamp(center + 0.5, 0.0, 1.0);
    vec4 history = texture(uFeedbackTex, feedbackUv);

    float hueAngle = (0.03 + param2 * 0.12) * intensity * speed;
    history.rgb = hueShift(history.rgb, hueAngle);

    float histLuma = dot(history.rgb, vec3(0.299, 0.587, 0.114));
    history.rgb = mix(vec3(histLuma), history.rgb, 1.15);

    float decay = 0.90 + (1.0 - intensity) * 0.07;
    history.rgb *= decay;
    history.rgb = clamp(history.rgb, 0.0, 1.0);

    float edgeDist = length(uv - 0.5) * 2.0;
    float liveMix = smoothstep(0.2, 0.85, edgeDist);
    liveMix = max(liveMix, 1.0 - intensity);

    vec3 blended = max(liveVid.rgb, history.rgb);
    vec3 result = mix(history.rgb, blended, liveMix);

    fragColor = vec4(result, 1.0);
