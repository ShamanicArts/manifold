
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);

    float angle = param1 * 6.2832;
    float drift = intensity * 0.015;
    float decay = 0.82 + param2 * 0.16;

    float spread = 0.15 * intensity;

    vec2 dirR = vec2(cos(angle - spread), sin(angle - spread));
    vec2 dirG = vec2(cos(angle), sin(angle));
    vec2 dirB = vec2(cos(angle + spread), sin(angle + spread));

    float hR = texture(uFeedbackTex, clamp(uv - dirR * drift, 0.0, 1.0)).r * decay;
    float hG = texture(uFeedbackTex, clamp(uv - dirG * drift, 0.0, 1.0)).g * decay;
    float hB = texture(uFeedbackTex, clamp(uv - dirB * drift, 0.0, 1.0)).b * decay;

    float wR = texture(uFeedbackTex, clamp(uv - dirR * drift * 2.5, 0.0, 1.0)).r * decay * 0.85;
    float wG = texture(uFeedbackTex, clamp(uv - dirG * drift * 2.5, 0.0, 1.0)).g * decay * 0.85;
    float wB = texture(uFeedbackTex, clamp(uv - dirB * drift * 2.5, 0.0, 1.0)).b * decay * 0.85;

    vec3 trail = vec3(max(hR, wR), max(hG, wG), max(hB, wB));

    vec3 trailed = max(liveVid.rgb, trail);

    float timeTint = uTime * speed * 0.3;
    vec3 tint = vec3(
      0.5 + 0.5 * sin(timeTint),
      0.5 + 0.5 * sin(timeTint + 2.094),
      0.5 + 0.5 * sin(timeTint + 4.189)
    );
    vec3 trailOnly = max(trail - liveVid.rgb, vec3(0.0));
    trailed += trailOnly * tint * intensity * 0.4;

    fragColor = vec4(mix(liveVid.rgb, trailed, intensity), 1.0);
