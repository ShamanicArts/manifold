
    vec2 center = vec2(0.5);
    vec2 dir = vUv - center;
    float dist = length(dir);

    float baseAberr = param1 * aberrationScale;
    float pulse = 1.0 + param2 * sin(uTime * speed);
    float aberration = intensity * baseAberr * pulse;
    aberration *= (edgeBoost + dist);

    float r = texture(uInputTex, vUv + dir * aberration).r;
    float g = texture(uInputTex, vUv).g;
    float b = texture(uInputTex, vUv - dir * aberration).b;
    fragColor = vec4(r, g, b, 1.0);
