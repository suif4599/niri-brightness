// Per-window brightness curve chunk for the clipped surface shader.
//
// The curve is baked on the CPU into 16 samples packed column-major into a
// mat4 (sample j lives in column j / 4, component j % 4). The lookup uses
// linear hat functions so that no dynamic matrix indexing (unsupported in
// GLSL ES 1.00) is needed.
uniform mat4 niri_curve_lut;

float niri_curve_lookup(float x) {
    x = clamp(x, 0.0, 1.0);
    float f = x * 15.0;

    vec4 w0 = clamp(1.0 - abs(f - vec4(0.0, 1.0, 2.0, 3.0)), 0.0, 1.0);
    vec4 w1 = clamp(1.0 - abs(f - vec4(4.0, 5.0, 6.0, 7.0)), 0.0, 1.0);
    vec4 w2 = clamp(1.0 - abs(f - vec4(8.0, 9.0, 10.0, 11.0)), 0.0, 1.0);
    vec4 w3 = clamp(1.0 - abs(f - vec4(12.0, 13.0, 14.0, 15.0)), 0.0, 1.0);

    return dot(niri_curve_lut[0], w0) + dot(niri_curve_lut[1], w1)
         + dot(niri_curve_lut[2], w2) + dot(niri_curve_lut[3], w3);
}

vec4 postprocess(vec4 color) {
    // The texture is premultiplied; unpremultiply, curve each channel, then
    // premultiply back.
    float a = max(color.a, 1.0e-6);
    vec3 rgb = color.rgb / a;
    rgb = vec3(
        niri_curve_lookup(rgb.r),
        niri_curve_lookup(rgb.g),
        niri_curve_lookup(rgb.b)
    );
    return vec4(rgb * a, color.a);
}
