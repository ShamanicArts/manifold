
    vec4 color = texture(uInputTex, vUv);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    float threshold = thresholdBase - param1 * thresholdRange;
    float glowPulse = (1.0 - glowPulseAmount) + glowPulseAmount * sin(uTime * speed);
    float glow = param2 * intensity * glowPulse;

    if (luma > threshold) {
        float brightness = (luma - threshold) / max(1.0 - threshold, 0.001);
        color.rgb += color.rgb * brightness * glow;
    }
    fragColor = color;
