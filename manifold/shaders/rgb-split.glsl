
    float t = uTime * speed;
    vec2 uv = vUv;

    float angle = t * param2;
    vec2 dir = vec2(cos(angle), sin(angle));

    float split = intensity * 0.06 * param1;
    split += sin(t * 3.0) * 0.01;

    float r = texture(uInputTex, uv + dir * split).r;
    float g = texture(uInputTex, uv).g;
    float b = texture(uInputTex, uv - dir * split).b;

    vec4 color = vec4(r, g, b, 1.0);
    color.rgb = (color.rgb - 0.5) * 1.2 + 0.5;
    fragColor = color;
