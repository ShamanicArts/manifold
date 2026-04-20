vec2 uv = vUv * 2.0 - 1.0;
uv.x *= uAspect;
float t = uTime * speed;
float field = 0.0;
field += sin((uv.x * scale) + t * 1.7);
field += sin((uv.y * scale * 1.3) - t * 1.1);
field += sin((uv.x + uv.y) * scale * 0.7 + t * 0.8);
field += sin(length(uv) * scale * 2.2 - t * 1.9);
field *= 0.25;

vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + palette + field * 3.14159265);
fragColor = vec4(col, 1.0);
