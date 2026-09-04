// Per-window brightness curve chunk for the clipped surface shader.
//
// The curve remaps the Oklab lightness of the pixel: colors keep their hue,
// and out-of-gamut results get their chroma reduced until they fit (the same
// approach as the CSS Color 4 gamut mapping algorithm). The curve is baked
// on the CPU into 16 samples packed column-major into a mat4 (sample j lives
// in column j / 4, component j % 4). The lookup uses linear hat functions so
// that no dynamic matrix indexing (unsupported in GLSL ES 1.00) is needed.
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

// sRGB <-> Oklab conversions with the same matrices as the border shader
vec3 srgb_to_linear(vec3 color) {
    return pow(color, vec3(2.2));
}

vec3 linear_to_srgb(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

vec3 linear_to_oklab(vec3 color) {
    mat3 rgb_to_lms = mat3(
        vec3(0.4122214708, 0.5363325363, 0.0514459929),
        vec3(0.2119034982, 0.6806995451, 0.1073969566),
        vec3(0.0883024619, 0.2817188376, 0.6299787005)
    );
    mat3 lms_to_oklab = mat3(
        vec3(0.2104542553, 0.7936177850, -0.0040720468),
        vec3(1.9779984951, -2.4285922050, 0.4505937099),
        vec3(0.0259040371, 0.7827717662, -0.8086757660)
    );
    vec3 lms = color * rgb_to_lms;
    // Window pixels are arbitrary input, and the matrix can produce slightly
    // negative values; pow() of a negative base is undefined.
    lms = sign(lms) * pow(abs(lms), vec3(1.0 / 3.0));
    return lms * lms_to_oklab;
}

vec3 oklab_to_linear(vec3 color) {
    mat3 oklab_to_lms = mat3(
        vec3(1.0, 0.3963377774, 0.2158037573),
        vec3(1.0, -0.1055613458, -0.0638541728),
        vec3(1.0, -0.0894841775, -1.2914855480)
    );
    mat3 lms_to_rgb = mat3(
        vec3(4.0767416621, -3.3077115913, 0.2309699292),
        vec3(-1.2684380046, 2.6097574011, -0.3413193965),
        vec3(-0.0041960863, -0.7034186147, 1.7076147010)
    );
    vec3 lms = color * oklab_to_lms;
    return lms * lms * lms * lms_to_rgb;
}

// Whether a linear-light color fits in the sRGB gamut
bool in_gamut(vec3 linear) {
    return all(greaterThanEqual(linear, vec3(-1.0e-4)))
        && all(lessThanEqual(linear, vec3(1.0 + 1.0e-4)));
}

vec4 postprocess(vec4 color) {
    // The texture is premultiplied; unpremultiply, remap the Oklab lightness,
    // then premultiply back.
    float a = max(color.a, 1.0e-6);
    vec3 rgb = color.rgb / a;

    vec3 oklab = linear_to_oklab(srgb_to_linear(rgb));
    oklab.x = niri_curve_lookup(oklab.x);

    vec3 linear = oklab_to_linear(oklab);
    if (!in_gamut(linear)) {
        // The remapped lightness no longer fits
        float lo = 0.0;
        float hi = 1.0;
        for (int i = 0; i < 5; i++) {
            float t = (lo + hi) * 0.5;
            vec3 c = oklab_to_linear(vec3(oklab.x, oklab.y * t, oklab.z * t));
            if (in_gamut(c)) {
                lo = t;
            } else {
                hi = t;
            }
        }
        linear = oklab_to_linear(vec3(oklab.x, oklab.y * lo, oklab.z * lo));
    }

    rgb = clamp(linear_to_srgb(linear), 0.0, 1.0);
    return vec4(rgb * a, color.a);
}
