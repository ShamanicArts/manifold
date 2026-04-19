
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);
    float eff = intensity * 0.0003;
    float offset = offsetBase + param1 * offsetScale;

    float nextR = luma(texture(uInputTex, uv + vec2(offset, 0.0)));
    float nextL = luma(texture(uInputTex, uv - vec2(offset, 0.0)));
    float nextU = luma(texture(uInputTex, uv + vec2(0.0, offset)));
    float nextD = luma(texture(uInputTex, uv - vec2(0.0, offset)));

    float pastR = luma(texture(uFeedbackTex, uv + vec2(offset, 0.0)));
    float pastL = luma(texture(uFeedbackTex, uv - vec2(offset, 0.0)));
    float pastU = luma(texture(uFeedbackTex, uv + vec2(0.0, offset)));
    float pastD = luma(texture(uFeedbackTex, uv - vec2(0.0, offset)));

    float gradX = (nextR - nextL) + (pastR - pastL);
    float gradY = (nextU - nextD) + (pastU - pastD);
    float gradMag = sqrt(gradX * gradX + gradY * gradY + lambda);

    float curr = luma(liveVid);
    float prev = luma(texture(uFeedbackTex, uv));
    float diff = curr - prev;

    vec2 flow = vec2(diff * gradX / gradMag, diff * gradY / gradMag);

    float advectStrength = param2 * eff * 5.0 * (0.5 + speed * 0.25);
    vec2 advectedUv = uv - flow * advectStrength;
    vec4 advected = texture(uFeedbackTex, clamp(advectedUv, 0.0, 1.0));

    float decay = 0.92 + (1.0 - eff * 33.0) * 0.06;
    advected.rgb *= clamp(decay, 0.85, 0.98);

    float flowPower = length(flow);
    float flowAngle = atan(flow.y, flow.x);

    float hue = flowAngle / 6.2832 + 0.5;
    float sat = 0.85 * clamp(flowPower * 80.0, 0.0, 1.0);
    float lit = 0.5 * clamp(flowPower * 60.0, 0.0, 1.0);

    float ch = (1.0 - abs(2.0 * lit - 1.0)) * sat;
    float xh = ch * (1.0 - abs(mod(hue * 6.0, 2.0) - 1.0));
    float mh = lit - ch * 0.5;
    vec3 flowColor;
    float h6 = hue * 6.0;
    if (h6 < 1.0) flowColor = vec3(ch, xh, 0.0);
    else if (h6 < 2.0) flowColor = vec3(xh, ch, 0.0);
    else if (h6 < 3.0) flowColor = vec3(0.0, ch, xh);
    else if (h6 < 4.0) flowColor = vec3(0.0, xh, ch);
    else if (h6 < 5.0) flowColor = vec3(xh, 0.0, ch);
    else flowColor = vec3(ch, 0.0, xh);
    flowColor += mh;

    vec3 base = max(liveVid.rgb, advected.rgb);
    float flowMask = smoothstep(maskMin, maskMax, flowPower) * (eff * 36.0);
    vec3 result = mix(base, base + flowColor * overlayGain, clamp(flowMask, 0.0, 1.0));

    fragColor = vec4(result, 1.0);
