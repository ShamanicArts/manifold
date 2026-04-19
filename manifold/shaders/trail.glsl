
    float t = uTime * speed;
    vec4 color = vec4(0.0);

    float trailLength = 1.0 + intensity * param1 * maxSamples;
    float fade = 1.0 - param2 * fadeFloor;

    for (float i = 0.0; i < 16.0; i++) {
        if (i >= trailLength) break;

        float offset = i * offsetScale * intensity;
        vec2 sampleUv = vUv;
        sampleUv.x += sin(t * 2.0 + i * 0.5) * offset;
        sampleUv.y += cos(t * 1.5 + i * 0.3) * offset;

        float weight = pow(fade, i);
        color += texture(uInputTex, clamp(sampleUv, vec2(0.0), vec2(1.0))) * weight;
    }
    color /= trailLength * 0.5;
    color.a = 1.0;
    fragColor = color;
