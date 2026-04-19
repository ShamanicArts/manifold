
    float t = uTime * speed;
    vec2 texel = vec2(0.001 * (1.0 + param1));

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

    vec3 edgeColor = vec3(
        0.5 + 0.5 * sin(t * param2 + edge * 10.0),
        0.5 + 0.5 * sin(t * param2 * 1.3 + edge * 10.0 + 2.0),
        0.5 + 0.5 * sin(t * param2 * 0.7 + edge * 10.0 + 4.0)
    );

    vec4 original = texture(uInputTex, vUv);
    float edgeMask = smoothstep(0.1, 0.5, edge * intensity);
    vec3 color = mix(original.rgb, edgeColor, edgeMask * 0.8);
    fragColor = vec4(color, 1.0);
