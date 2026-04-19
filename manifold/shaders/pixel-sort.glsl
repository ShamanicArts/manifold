
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);
    float luma = getLuma(liveVid.rgb);

    float angle = mix(0.0, 1.5708, param1);
    vec2 sortDir = vec2(cos(angle), sin(angle));

    float thresh = thresholdBase + param2 * thresholdRange;
    float sortMask = smoothstep(thresh - 0.08, thresh + 0.08, luma);

    float maxDisp = intensity * maxDisplace;
    vec3 bestColor = liveVid.rgb;
    float bestLuma = luma;

    for (float i = 1.0; i <= 8.0; i++) {
      float d = i * maxDisp / 8.0;
      vec2 sampleUv = clamp(uv - sortDir * d, 0.0, 1.0);
      vec3 s = texture(uInputTex, sampleUv).rgb;
      float sl = getLuma(s);
      if (sl > bestLuma && sl > thresh) {
        bestLuma = sl;
        bestColor = s;
      }
    }

    float chromaOff = sortMask * intensity * chromaAmount;
    float sR = texture(uInputTex, clamp(uv - sortDir * maxDisp * 0.5 + vec2(chromaOff, 0.0), 0.0, 1.0)).r;
    float sB = texture(uInputTex, clamp(uv - sortDir * maxDisp * 0.5 - vec2(chromaOff, 0.0), 0.0, 1.0)).b;
    vec3 chromaSorted = vec3(sR, bestColor.g, sB);

    vec3 sorted = mix(bestColor, chromaSorted, 0.6);

    vec2 feedbackUv = uv - sortDir * intensity * 0.02 * (0.5 + speed * 0.25);
    vec4 history = texture(uFeedbackTex, clamp(feedbackUv, 0.0, 1.0));
    float decay = 0.88 + (1.0 - intensity) * 0.08;

    float histLuma = getLuma(history.rgb);
    float histMask = smoothstep(thresh - 0.08, thresh + 0.08, histLuma);
    vec3 streaked = history.rgb * decay;

    vec3 sortResult = mix(liveVid.rgb, sorted, sortMask);
    sortResult = max(sortResult, streaked * histMask * 0.7);

    fragColor = vec4(mix(liveVid.rgb, sortResult, intensity), 1.0);
