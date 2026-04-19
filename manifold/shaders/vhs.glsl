
    vec2 uv = vUv;
    float t = uTime * speed;

    float tearLine = step(tearThreshold, rand(vec2(floor(vUv.y * 50.0), floor(t * 3.0))));
    if (tearLine > 0.5) {
        uv.x += sin(t * 30.0) * intensity * tearAmount;
    }
    uv.y += sin(uv.x * 40.0 + t * 2.0) * intensity * wobbleAmount;

    float noise = rand(uv + vec2(t)) * intensity * param1;

    float bleed = sin(uv.y * 100.0 + t) * intensity * bleedScale * param2;
    vec4 color = texture(uInputTex, uv);
    color.r = texture(uInputTex, uv + vec2(bleed, 0.0)).r;
    color.b = texture(uInputTex, uv - vec2(bleed, 0.0)).b;

    color.rgb += vec3(noise);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(luma), color.rgb, 0.85);
    color.rgb = (color.rgb - 0.5) * 1.1 + 0.5;
    fragColor = color;
