
    float t = uTime * speed;
    vec2 texel = vec2(0.002 * (1.0 + param1));

    float tl = dot(texture(uInputTex, vUv + vec2(-texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(uInputTex, vUv + vec2(0.0, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(uInputTex, vUv + vec2(texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(uInputTex, vUv + vec2(-texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(uInputTex, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(uInputTex, vUv + vec2(-texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(uInputTex, vUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(uInputTex, vUv + vec2(texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = sqrt(gx*gx + gy*gy);

    vec4 orig = texture(uInputTex, vUv);
    vec3 neon = vec3(
        0.5 + 0.5 * sin(t + vUv.x * 5.0),
        0.5 + 0.5 * sin(t * 1.3 + vUv.y * 5.0),
        0.5 + 0.5 * sin(t * 0.7 + (vUv.x + vUv.y) * 5.0)
    );

    float strength = clamp(edge * intensity * 5.0, 0.0, 1.0);
    vec3 color = mix(orig.rgb * 0.15, neon, strength);
    color += neon * edge * param2 * intensity * 0.3;
    fragColor = vec4(color, 1.0);
