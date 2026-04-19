
    vec2 uv = vUv;
    float t = uTime * speed;
    float blocks = mix(5.0, 30.0, param1);
    float freq = mix(5.0, 30.0, param2);
    float glitchIntensity = intensity;

    float blockY = floor(vUv.y * blocks) / blocks;
    float glitchTrigger = step(triggerBase, rand(vec2(blockY, floor(t * freq))));
    if (glitchTrigger > 0.5) {
        uv.x += (rand(vec2(blockY, t)) - 0.5) * glitchIntensity * 0.3;
    }

    float scanGlitch = sin(vUv.y * scanlineFreq + t * 5.0) * glitchIntensity * scanlineAmount;
    uv.x += scanGlitch * step(0.97, rand(vec2(floor(t * 20.0), vUv.y)));

    vec4 color = texture(uInputTex, uv);
    if (glitchTrigger > 0.5) {
        color.rgb = vec3(
            texture(uInputTex, uv + vec2(rgbSplitAmount * glitchIntensity, 0.0)).r,
            color.g,
            texture(uInputTex, uv - vec2(rgbSplitAmount * glitchIntensity, 0.0)).b
        );
    }
    fragColor = color;
