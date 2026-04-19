
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);
    vec4 history = texture(uFeedbackTex, uv);

    vec2 t = vec2(0.006);
    float tl = dot(texture(uInputTex, uv + vec2(-t.x, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(uInputTex, uv + vec2( 0.0, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(uInputTex, uv + vec2( t.x, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(uInputTex, uv + vec2(-t.x,  0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(uInputTex, uv + vec2( t.x,  0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(uInputTex, uv + vec2(-t.x,  t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(uInputTex, uv + vec2( 0.0,  t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(uInputTex, uv + vec2( t.x,  t.y)).rgb, vec3(0.299, 0.587, 0.114));

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = sqrt(gx*gx + gy*gy);

    float edgeProtect = smoothstep(edgeMin, edgeMaxBase + param1 * 0.8, edge);

    vec2 ft = vec2(0.004);
    float fn = dot(texture(uFeedbackTex, uv + vec2(0.0, ft.y)).rgb, vec3(0.333));
    float fs = dot(texture(uFeedbackTex, uv - vec2(0.0, ft.y)).rgb, vec3(0.333));
    float fe = dot(texture(uFeedbackTex, uv + vec2(ft.x, 0.0)).rgb, vec3(0.333));
    float fw = dot(texture(uFeedbackTex, uv - vec2(ft.x, 0.0)).rgb, vec3(0.333));
    vec2 flow = vec2(fe - fw, fn - fs);

    float smearAmt = param2 * intensity * smearScale * (0.5 + speed * 0.25);
    vec2 smearUv = uv - flow * smearAmt;
    vec4 moshed = texture(uFeedbackTex, clamp(smearUv, 0.0, 1.0));

    float diff = distance(liveVid.rgb, history.rgb);
    float refreshMask = smoothstep(0.3, 0.6, diff);

    float liveMix = max(edgeProtect, refreshMask);
    liveMix = mix(1.0, liveMix, intensity);

    fragColor = vec4(mix(moshed.rgb, liveVid.rgb, liveMix), 1.0);
