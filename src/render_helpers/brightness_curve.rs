use glam::Mat4;
use niri_config::BrightnessCurve;

/// Number of samples the curve is baked into for the shader.
pub const SAMPLES: usize = 16;

/// Maximum number of control points a curve may have.
pub const MAX_POINTS: usize = 8;

/// Bake the control points into a LUT packed into a `mat4`.
///
/// The LUT contains `SAMPLES` evenly spaced samples of a monotone cubic
/// (Fritsch-Carlson) spline through the control points. Sample `j` lives in
/// column `j / 4`, component `j % 4` of the matrix (column-major, matching how
/// the shader indexes it).
///
/// Returns `None` (logging a warning) if the curve is empty or invalid. The
/// `(0, 0)` and `(1, 1)` endpoints are added automatically when missing.
pub fn bake_lut(curve: &BrightnessCurve) -> Option<Mat4> {
    let pts = control_points(curve)?;
    Some(spline_lut(&pts))
}

/// Validate the raw points and add the missing endpoints.
fn control_points(curve: &BrightnessCurve) -> Option<Vec<(f64, f64)>> {
    let points = &curve.points;
    if points.is_empty() {
        return None;
    }
    if points.len() % 2 != 0 {
        warn!("brightness-curve: points must be a flat list of `x y` pairs");
        return None;
    }
    if points.len() / 2 > MAX_POINTS {
        warn!("brightness-curve: too many control points (max {MAX_POINTS})");
        return None;
    }

    let mut pts: Vec<(f64, f64)> = points
        .chunks(2)
        .map(|pair| (pair[0].0, pair[1].0))
        .collect();

    // Anchor the endpoints automatically.
    if pts[0].0 > 0. {
        pts.insert(0, (0., 0.));
    }
    if pts.last().unwrap().0 < 1. {
        pts.push((1., 1.));
    }

    if pts.windows(2).any(|w| w[0].0 >= w[1].0) {
        warn!("brightness-curve: points must have strictly increasing x");
        return None;
    }

    Some(pts)
}

/// Sample a monotone cubic spline through the points into a packed LUT.
fn spline_lut(pts: &[(f64, f64)]) -> Mat4 {
    let n = pts.len();
    let dx: Vec<f64> = (0..n - 1).map(|i| pts[i + 1].0 - pts[i].0).collect();
    let d: Vec<f64> = (0..n - 1).map(|i| (pts[i + 1].1 - pts[i].1) / dx[i]).collect();

    // Monotone tangents (Fritsch-Carlson weighted harmonic mean).
    let mut m = vec![0.; n];
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for i in 1..n - 1 {
        if d[i - 1] * d[i] <= 0. {
            m[i] = 0.;
        } else {
            let w1 = 2. * dx[i] + dx[i - 1];
            let w2 = dx[i] + 2. * dx[i - 1];
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
        }
    }

    let mut lut = [0f32; SAMPLES];
    for (j, out) in lut.iter_mut().enumerate() {
        let x = j as f64 / (SAMPLES - 1) as f64;
        let i = pts.partition_point(|p| p.0 < x).saturating_sub(1).min(n - 2);
        let t = (x - pts[i].0) / dx[i];
        let t2 = t * t;
        let t3 = t2 * t;
        let y = (2. * t3 - 3. * t2 + 1.) * pts[i].1
            + (t3 - 2. * t2 + t) * dx[i] * m[i]
            + (-2. * t3 + 3. * t2) * pts[i + 1].1
            + (t3 - t2) * dx[i] * m[i + 1];
        *out = y as f32;
    }

    Mat4::from_cols_array(&lut)
}

#[cfg(test)]
mod tests {
    use super::*;
    use niri_config::FloatOrInt;

    fn curve(pairs: &[(f64, f64)]) -> BrightnessCurve {
        BrightnessCurve {
            points: pairs
                .iter()
                .flat_map(|&(x, y)| [FloatOrInt(x), FloatOrInt(y)])
                .collect(),
        }
    }

    fn lut_values(lut: Mat4) -> Vec<f32> {
        lut.to_cols_array().to_vec()
    }

    #[test]
    fn identity_curve() {
        let lut = bake_lut(&curve(&[(0., 0.), (1., 1.)])).unwrap();
        for (j, v) in lut_values(lut).iter().enumerate() {
            assert!((v - j as f32 / (SAMPLES - 1) as f32).abs() < 1e-5);
        }
    }

    #[test]
    fn dimming_curve_is_monotone_and_anchored() {
        let lut = bake_lut(&curve(&[(0.25, 0.14), (0.5, 0.38), (0.75, 0.72)])).unwrap();
        let vals = lut_values(lut);
        assert_eq!(vals.first(), Some(&0.));
        assert!(*vals.last().unwrap() > 0.99);
        for w in vals.windows(2) {
            assert!(w[0] <= w[1] + 1e-6);
        }
    }

    #[test]
    fn empty_curve_is_none() {
        assert!(bake_lut(&BrightnessCurve::default()).is_none());
    }

    #[test]
    fn non_increasing_x_is_rejected() {
        assert!(bake_lut(&curve(&[(0.5, 0.3), (0.4, 0.9)])).is_none());
    }

    #[test]
    fn odd_number_of_values_is_rejected() {
        let c = BrightnessCurve {
            points: vec![FloatOrInt(0.5)],
        };
        assert!(bake_lut(&c).is_none());
    }
}
