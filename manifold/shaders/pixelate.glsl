
    float t = uTime * speed;
    float pixelSize = mix(pixelMin, pixelMax, param1);
    pixelSize += sin(t) * animScale * param2;
    pixelSize = clamp(pixelSize, 0.0001, 0.02);

    vec2 uv = floor(vUv / pixelSize) * pixelSize + pixelSize * 0.5;
    vec4 base = texture(uInputTex, vUv);
    vec4 pix = texture(uInputTex, uv);
    fragColor = mix(base, pix, intensity);
