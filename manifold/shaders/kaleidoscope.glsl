
    vec2 centered = (vUv - vec2(0.5)) / max(0.0001, param2);
    float angle = atan(centered.y, centered.x) + uTime * speed;
    float radius = length(centered);
    float segCount = max(2.0, floor(param1 + 0.5));
    float segAngle = 6.2831853 / segCount;

    angle = mod(angle, segAngle);
    angle = abs(angle - segAngle * 0.5);

    vec2 warped = vec2(cos(angle), sin(angle)) * radius + vec2(0.5);
    warped = clamp(warped, vec2(0.0), vec2(1.0));

    vec4 base = texture(uInputTex, vUv);
    vec4 effected = texture(uInputTex, warped);
    fragColor = mix(base, effected, intensity);
