
    vec2 uv = vUv;
    float t = uTime * speed;

    vec2 center = vec2(0.5);
    vec2 delta = uv - center;
    float dist = length(delta);
    float angle = atan(delta.y, delta.x);

    float warpAmount = param1 * intensity * 0.35;
    angle += sin(dist * 8.0 - t * 2.0) * warpAmount * 0.5;
    dist += sin(angle * 4.0 + t) * warpAmount * 0.05;

    uv = center + vec2(cos(angle), sin(angle)) * dist;
    uv = clamp(uv, vec2(0.0), vec2(1.0));

    vec4 color = texture(uInputTex, uv);

    float hueShift = t * param2 * 0.5 + dist * 2.0;
    float eff = intensity * 0.5;
    float c = cos(hueShift * eff);
    float s = sin(hueShift * eff);
    color.rgb = vec3(
        color.r * c - color.g * s * 0.5,
        color.r * s * 0.5 + color.g * c,
        color.b + sin(t + dist * 10.0) * eff * 0.3
    );
    color.rgb = clamp(color.rgb, 0.0, 1.0);

    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(luma), color.rgb, 1.0 + eff * 0.4);
    fragColor = color;
