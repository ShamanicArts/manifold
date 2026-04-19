
    float t = uTime * speed;
    vec4 color = texture(uInputTex, vUv);

    float levels = mix(16.0, 2.0, intensity * param1);
    levels = max(2.0, levels + sin(t) * 2.0);
    color.rgb = floor(color.rgb * levels) / levels;

    color.r += sin(t + vUv.x * 10.0) * intensity * param2 * 0.1;
    color.b += cos(t + vUv.y * 10.0) * intensity * param2 * 0.1;
    fragColor = color;
