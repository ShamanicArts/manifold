
    vec2 uv = vUv;
    float t = uTime * speed;

    float amp = intensity * param1 * ampScale;
    float freq = freqBase + param2 * freqRange;

    uv.x += sin(uv.y * freq + t * 3.0) * amp;
    uv.y += cos(uv.x * freq * 0.8 + t * 2.0) * amp * 0.7;
    uv.x += sin(uv.y * freq * 2.0 + t * 5.0) * amp * layer2Scale;
    uv.y += cos(uv.x * freq * 1.5 + t * 4.0) * amp * layer3Scale;

    uv = clamp(uv, vec2(0.0), vec2(1.0));
    fragColor = texture(uInputTex, uv);
