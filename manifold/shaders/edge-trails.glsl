
    float t = uTime * speed;
    vec4 original = texture(uInputTex, vUv);

    vec3 trailAccum = vec3(0.0);
    float totalWeight = 0.0;
    float samples = 4.0 + param1 * 6.0;
    float fade = 0.85;
    vec2 texel = vec2(0.002);

    for (float i = 0.0; i < 8.0; i++) {
        if (i >= samples) break;

        vec2 offset = vec2(
            sin(t * 0.5 + i * 0.4) * 0.005 * i,
            cos(t * 0.4 + i * 0.3) * 0.005 * i
        );
        vec2 sampleUv = clamp(vUv + offset, vec2(0.0), vec2(1.0));

        float stl = dot(texture(uInputTex, sampleUv + vec2(-texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float stc = dot(texture(uInputTex, sampleUv + vec2(0.0, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float str = dot(texture(uInputTex, sampleUv + vec2(texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float sml = dot(texture(uInputTex, sampleUv + vec2(-texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float smr = dot(texture(uInputTex, sampleUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float sbl = dot(texture(uInputTex, sampleUv + vec2(-texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float sbc = dot(texture(uInputTex, sampleUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float sbr = dot(texture(uInputTex, sampleUv + vec2(texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));

        float sgx = -stl - 2.0*sml - sbl + str + 2.0*smr + sbr;
        float sgy = -stl - 2.0*stc - str + sbl + 2.0*sbc + sbr;
        float sEdge = sqrt(sgx*sgx + sgy*sgy);

        vec3 col = vec3(
            0.5 + 0.5 * sin(t * param2 + sEdge * 10.0),
            0.5 + 0.5 * sin(t * param2 * 1.3 + sEdge * 10.0 + 2.0),
            0.5 + 0.5 * sin(t * param2 * 0.7 + sEdge * 10.0 + 4.0)
        );

        float weight = pow(fade, i) * sEdge;
        trailAccum += col * weight;
        totalWeight += weight;
    }
    if (totalWeight > 0.0) trailAccum /= totalWeight;

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

    float trailIntensity = min(edge * intensity * 2.0, 0.8);
    fragColor = vec4(mix(original.rgb, trailAccum, trailIntensity), 1.0);
