    vec4 color = texture(uInputTex, vUv);
    fragColor = vec4(mix(color.rgb, 1.0 - color.rgb, intensity), 1.0);
