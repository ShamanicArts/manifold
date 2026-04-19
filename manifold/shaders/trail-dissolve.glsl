
    float t = uTime * speed;
    vec4 original = texture(uInputTex, vUv);

    vec3 trailAccum = vec3(0.0);
    float totalWeight = 0.0;
    float samples = 4.0 + param1 * maxSamples;
    float fade = 0.85;

    for (float i = 0.0; i < 16.0; i++) {
        if (i >= samples) break;

        float offset = i * offsetScale * intensity;
        vec2 sampleUv = vUv;
        sampleUv.x += sin(t * 2.0 + i * 0.5) * offset;
        sampleUv.y += cos(t * 1.5 + i * 0.3) * offset;

        vec4 texColor = texture(uInputTex, clamp(sampleUv, vec2(0.0), vec2(1.0)));
        float noise = fract(sin(dot(sampleUv * 30.0 + vec2(t + i * 0.1), vec2(12.9898, 78.233))) * 43758.5453);
        float dissolve = dissolveMin + dissolveRange * step(noiseCutoff, noise + param2 * 0.5);

        float weight = pow(fade, i) * dissolve;
        trailAccum += texColor.rgb * weight;
        totalWeight += weight;
    }

    trailAccum = mix(original.rgb, trailAccum / max(totalWeight, 0.1), 0.7);

    float curNoise = fract(sin(dot(vUv * 30.0 + vec2(t), vec2(12.9898, 78.233))) * 43758.5453);
    float curDissolve = 0.2 + 0.8 * step(0.3, curNoise + param2 * 0.5);
    float trailIntensity = min(curDissolve * intensity, 0.7);

    fragColor = vec4(mix(original.rgb, trailAccum, trailIntensity), 1.0);
