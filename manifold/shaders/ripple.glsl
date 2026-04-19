
    vec2 uv = vUv;
    float t = uTime * speed;

    vec2 center = vec2(0.5);
    vec2 delta = uv - center;
    float dist = length(delta);

    float freq = mix(freqMin, freqMax, param1);
    float waves = mix(2.0, maxLayers, param2);

    float wave = 0.0;
    for (float i = 1.0; i <= 8.0; i++) {
        if (i > waves) break;
        wave += sin(dist * freq * i - t * 4.0 * i) * intensity * waveScale / i;
    }

    uv += delta * wave;
    uv = clamp(uv, vec2(0.0), vec2(1.0));
    fragColor = texture(uInputTex, uv);
