// comets/famous.js: famous periodic and great comets, drawn by comets/index.js like Halley (orbit line, nucleus, coma, a
// straight blue ion tail pointing away from the Sun and a curved cream dust tail, both growing towards perihelion).
//
// Source: JPL Small-Body Database API (https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=…&full-prec=1), fetched 2026-10-21.
// Heliocentric, J2000 ecliptic (the convention of comets/data.js): q = perihelion distance (AU), e, i / node (Ω) / peri (ω)
// in degrees, T = perihelion time (days since J2000 = JD 2451545.0; TDB, ~1 min off UTC, ignored), period in days.
//   67P/Churyumov-Gerasimenko  JPL K284/1  (2026-09-04), epoch JD 2457305.5, A1 A2 A3 non-grav
//   2P/Encke                   JPL K273/23 (2026-10-14), epoch JD 2460363.5, A1 A2
//   9P/Tempel 1                JPL K284/2  (2025-12-29), epoch JD 2457470.5, A1 A2
//   81P/Wild 2                 JPL K222/37 (2024-09-12), epoch JD 2458808.5, A1 A2 A3
//   109P/Swift-Tuttle          JPL 32      (2001-10-09), epoch JD 2450000.5
//   55P/Tempel-Tuttle          JPL J985/69 (2002-01-03), epoch JD 2451040.5, A1 A2
//   C/2020 F3 (NEOWISE)        JPL 31      (2024-07-30), epoch JD 2459036.5
//   C/2023 A3 (Tsuchinshan-ATLAS) JPL 113  (2026-07-28), epoch JD 2460448.5 (osculating e = 1.0000954: a slightly open path)
//
// Jupiter keeps reshaping the short-period orbits (67P's 2018 pass tilted its orbit from 7.0° to 3.9°; 9P's 2024 pass
// pushed its perihelion out from 1.54 to 1.77 AU), so one set of elements only holds for a few years. For the periodic
// comets, `sets` holds one osculating ellipse per perihelion passage, 1955–2075. They come from integrating the SBDB orbit
// above (with its non-gravitational A1/A2/A3 terms, Marsden 1973 g(r)) under the Sun and all eight planets (positions from
// ephemeris/planets.js's Standish elements), RK4, out of the SBDB epoch both ways. comets/index.js switches set at the
// aphelion between two perihelia, where the comet is slow and far out, so the hand-over is not noticeable. Outside 1955–2075
// the first/last set is simply extended. Checked against JPL's own n-body positions (CHANGELOG 2026-10-21).
// 81P/Wild 2 starts at its 1978 set: before its 0.006 AU pass by Jupiter on 10 Sep 1974 it was on a wider orbit beyond
// Jupiter (q ≈ 4.9 AU) that this integration cannot recover, so earlier dates show the post-1974 orbit.
// Each set row: [applies from (days since J2000), q, e, i, node, peri, T, period].
const JD2000 = 2451545.0;
const SETS = {
  '67P': [
    [-Infinity, 2.643482, 0.3860060, 21.8209, 52.6661, 32.8049, -15957.447, 3262.997],   // perihelion 1956-04-24
    [-14644.9, 1.279813, 0.6338535, 7.1608, 51.0637, 11.1509, -13463.579, 2386.908],   // perihelion 1963-02-20
    [-12267.6, 1.284941, 0.6330398, 7.1505, 51.0189, 11.2346, -11071.304, 2393.288],   // perihelion 1969-09-09
    [-9868.6, 1.298720, 0.6305408, 7.1298, 51.0358, 11.3489, -8670.820, 2407.254],   // perihelion 1976-04-05
    [-7465.3, 1.306349, 0.6291242, 7.1178, 51.0228, 11.3566, -6260.597, 2414.596],   // perihelion 1982-11-10
    [-5052.3, 1.299886, 0.6302382, 7.1193, 51.0192, 11.4131, -3849.985, 2407.537],   // perihelion 1989-06-17
    [-2641.3, 1.300265, 0.6301680, 7.1144, 51.0149, 11.3749, -1445.413, 2407.905],   // perihelion 1996-01-17
    [-236.9, 1.292567, 0.6314769, 7.1216, 50.9774, 11.4396, 959.546, 2399.279],   // perihelion 2002-08-18
    [2157.3, 1.246513, 0.6401796, 7.0409, 50.1978, 12.6992, 3345.848, 2355.129],   // perihelion 2009-02-28
    [4526.4, 1.243259, 0.6408749, 7.0403, 50.1358, 12.7960, 5702.586, 2352.730],   // perihelion 2015-08-13
    [6848.6, 1.210527, 0.6496991, 3.8579, 36.2910, 22.1641, 7975.216, 2346.379],   // perihelion 2021-11-01
    [9145.4, 1.213103, 0.6492280, 3.8519, 36.2259, 22.2694, 10325.457, 2349.132],   // perihelion 2028-04-08
    [11517.7, 1.279888, 0.6366530, 3.6773, 35.9506, 23.3737, 12723.416, 2414.759],   // perihelion 2034-11-01
    [13929.6, 1.287467, 0.6352563, 3.6704, 35.9147, 23.4269, 15142.515, 2422.260],   // perihelion 2041-06-17
    [16351.8, 1.285992, 0.6355601, 3.6624, 35.8896, 23.5170, 17563.395, 2421.123],   // perihelion 2048-02-01
    [18772.2, 1.291078, 0.6345889, 3.6583, 35.8828, 23.4903, 19984.388, 2425.797],   // perihelion 2054-09-18
    [21191.8, 1.282408, 0.6360785, 3.6608, 35.8499, 23.5451, 22405.730, 2416.162],   // perihelion 2061-05-06
    [23606.7, 1.265719, 0.6392933, 3.6504, 35.5533, 23.9486, 24813.967, 2400.895],   // perihelion 2067-12-09
    [26013.9, 1.260252, 0.6403377, 3.6476, 35.4724, 24.0620, 27214.976, 2395.754],   // perihelion 2074-07-06
  ],
  '2P': [
    [-Infinity, 0.338479, 0.8472503, 12.3755, 335.4315, 185.2245, -15415.009, 1204.827],   // perihelion 1957-10-18
    [-14810.1, 0.339366, 0.8469107, 12.3603, 335.4205, 185.2272, -14210.097, 1205.548],   // perihelion 1961-02-04
    [-13602.3, 0.339324, 0.8469586, 11.9794, 334.9400, 185.9070, -12996.139, 1205.888],   // perihelion 1964-06-02
    [-12390.2, 0.338275, 0.8473695, 11.9929, 334.9379, 185.9120, -11790.599, 1205.149],   // perihelion 1967-09-20
    [-11184.8, 0.338964, 0.8471287, 11.9776, 334.9174, 185.9424, -10584.694, 1205.981],   // perihelion 1971-01-08
    [-9982.1, 0.338204, 0.8474172, 11.9858, 334.9235, 185.9268, -9379.667, 1205.336],   // perihelion 1974-04-27
    [-8772.7, 0.340772, 0.8464263, 11.9421, 334.9107, 185.9515, -8173.606, 1207.313],   // perihelion 1977-08-15
    [-7565.9, 0.340049, 0.8467166, 11.9493, 334.8992, 185.9774, -6965.973, 1206.893],   // perihelion 1980-12-05
    [-6360.5, 0.341113, 0.8462896, 11.9307, 334.8861, 185.9908, -5758.776, 1207.509],   // perihelion 1984-03-26
    [-5153.0, 0.331814, 0.8498602, 11.9291, 334.7373, 186.2569, -4551.975, 1200.045],   // perihelion 1987-07-16
    [-3949.3, 0.330972, 0.8501882, 11.9427, 334.7460, 186.2385, -3352.726, 1199.404],   // perihelion 1990-10-27
    [-2752.2, 0.330996, 0.8501816, 11.9380, 334.7258, 186.2742, -2152.735, 1199.455],   // perihelion 1994-02-08
    [-1550.8, 0.331477, 0.8499837, 11.9272, 334.7191, 186.2748, -953.529, 1199.696],   // perihelion 1997-05-22
    [-348.0, 0.339612, 0.8468708, 11.7537, 334.5982, 186.4856, 251.623, 1206.386],   // perihelion 2000-09-09
    [856.3, 0.338537, 0.8473128, 11.7679, 334.5852, 186.5013, 1457.923, 1205.877],   // perihelion 2003-12-29
    [2062.6, 0.339344, 0.8470115, 11.7526, 334.5692, 186.5252, 2664.447, 1206.619],   // perihelion 2007-04-18
    [3270.5, 0.335940, 0.8483135, 11.7814, 334.5651, 186.5509, 3869.735, 1203.846],   // perihelion 2010-08-06
    [4475.2, 0.336202, 0.8482019, 11.7771, 334.5716, 186.5378, 5073.030, 1203.927],   // perihelion 2013-11-21
    [5676.1, 0.335970, 0.8483096, 11.7766, 334.5587, 186.5648, 6277.496, 1203.959],   // perihelion 2017-03-09
    [6880.8, 0.336793, 0.8479716, 11.7631, 334.5510, 186.5633, 7481.318, 1204.360],   // perihelion 2020-06-25
    [8091.8, 0.339598, 0.8469336, 11.3365, 334.0187, 187.2883, 8695.028, 1207.052],   // perihelion 2023-10-22
    [9296.6, 0.338580, 0.8473368, 11.3479, 334.0194, 187.2889, 9901.726, 1206.392],   // perihelion 2027-02-10
    [10503.3, 0.339243, 0.8470518, 11.3338, 333.9954, 187.3231, 11108.593, 1206.561],   // perihelion 2030-06-01
    [11711.2, 0.338315, 0.8474364, 11.3435, 333.9931, 187.3169, 12314.371, 1206.157],   // perihelion 2033-09-18
    [12917.2, 0.340564, 0.8465926, 11.3062, 333.9801, 187.3386, 13521.176, 1208.166],   // perihelion 2037-01-07
    [14124.1, 0.339891, 0.8468587, 11.3120, 333.9705, 187.3625, 14729.651, 1207.730],   // perihelion 2040-04-30
    [15329.8, 0.340959, 0.8464383, 11.2945, 333.9521, 187.3776, 15937.636, 1208.444],   // perihelion 2043-08-21
    [16541.9, 0.330920, 0.8502925, 11.2509, 333.7279, 187.7356, 17145.770, 1200.379],   // perihelion 2046-12-11
    [17744.3, 0.330000, 0.8506539, 11.2647, 333.7380, 187.7165, 18345.373, 1199.717],   // perihelion 2050-03-24
    [18944.1, 0.330072, 0.8506306, 11.2584, 333.7216, 187.7504, 19545.767, 1199.829],   // perihelion 2053-07-07
    [20144.1, 0.330504, 0.8504502, 11.2487, 333.7154, 187.7471, 20745.180, 1200.010],   // perihelion 2056-10-18
    [21345.4, 0.337757, 0.8476792, 11.0993, 333.6050, 187.9299, 21949.740, 1206.054],   // perihelion 2060-02-05
    [22550.3, 0.336680, 0.8481039, 11.1123, 333.6044, 187.9359, 23155.662, 1205.325],   // perihelion 2063-05-26
    [23757.2, 0.337511, 0.8477699, 11.0982, 333.5779, 187.9703, 24361.508, 1205.814],   // perihelion 2066-09-13
    [24961.7, 0.333690, 0.8492600, 11.1238, 333.5566, 188.0183, 25566.137, 1203.013],   // perihelion 2069-12-30
    [26166.0, 0.333796, 0.8492123, 11.1222, 333.5655, 188.0024, 26768.564, 1203.016],   // perihelion 2073-04-16
  ],
  '9P': [
    [-Infinity, 1.528438, 0.5126061, 10.5132, 69.1790, 178.9505, -16088.679, 2028.383],   // perihelion 1955-12-14
    [-15071.9, 1.525043, 0.5133903, 10.5178, 69.1498, 179.0775, -14059.202, 2026.518],   // perihelion 1961-07-05
    [-13045.4, 1.502730, 0.5180880, 10.5408, 69.0398, 179.1566, -12041.081, 2011.259],   // perihelion 1967-01-13
    [-11033.3, 1.496546, 0.5196304, 10.5513, 69.0154, 179.2220, -10030.485, 2008.493],   // perihelion 1972-07-16
    [-9026.6, 1.496741, 0.5195219, 10.5468, 69.0068, 179.1094, -8024.962, 2008.205],   // perihelion 1978-01-11
    [-7020.0, 1.491010, 0.5209186, 10.5573, 68.9948, 179.0734, -6019.272, 2005.420],   // perihelion 1983-07-10
    [-5012.6, 1.496617, 0.5197052, 10.5465, 68.9941, 179.0112, -4013.721, 2009.105],   // perihelion 1989-01-04
    [-3005.6, 1.494047, 0.5202663, 10.5521, 68.9866, 178.8997, -2007.933, 2007.449],   // perihelion 1994-07-03
    [-1000.5, 1.499955, 0.5189773, 10.5415, 68.9674, 178.9099, 1.291, 2011.257],   // perihelion 2000-01-02
    [1009.8, 1.506057, 0.5175158, 10.5303, 68.9383, 178.8373, 2011.917, 2014.354],   // perihelion 2005-07-05
    [3025.1, 1.510197, 0.5165534, 10.5225, 68.9076, 178.9222, 4028.890, 2016.630],   // perihelion 2011-01-12
    [5044.6, 1.542540, 0.5095859, 10.4740, 68.7494, 179.2065, 6058.083, 2037.552],   // perihelion 2016-08-02
    [7074.6, 1.544236, 0.5091458, 10.4700, 68.7142, 179.3499, 8098.450, 2038.169],   // perihelion 2022-03-04
    [9170.8, 1.773606, 0.4631369, 10.4603, 66.5517, 184.8564, 10270.087, 2193.253],   // perihelion 2028-02-13
    [11366.5, 1.773890, 0.4630413, 10.4556, 66.5039, 185.0974, 12467.467, 2193.195],   // perihelion 2034-02-18
    [13591.9, 1.925344, 0.4348089, 10.3001, 65.4609, 187.9073, 14741.376, 2296.508],   // perihelion 2040-05-11
    [15887.6, 1.928449, 0.4342095, 10.2947, 65.4140, 188.0960, 17042.274, 2298.409],   // perihelion 2046-08-29
    [18189.9, 1.957049, 0.4287603, 10.2617, 65.2725, 188.1585, 19348.620, 2316.186],   // perihelion 2052-12-22
    [20503.5, 1.964180, 0.4275301, 10.2528, 65.2313, 188.2501, 21668.890, 2321.354],   // perihelion 2059-04-30
    [22827.5, 1.968443, 0.4265351, 10.2475, 65.1996, 188.0637, 23986.938, 2322.856],   // perihelion 2065-09-03
    [25148.4, 1.977920, 0.4248975, 10.2363, 65.1803, 188.0386, 26312.144, 2329.667],   // perihelion 2072-01-15
  ],
  '81P': [
    [-Infinity, 1.491975, 0.5565158, 3.2693, 136.7543, 39.9514, -7869.901, 2253.842],   // perihelion 1978-06-15
    [-6737.8, 1.494899, 0.5559065, 3.2677, 136.6774, 40.1221, -5612.055, 2255.820],   // perihelion 1984-08-20
    [-4458.7, 1.578133, 0.5409442, 3.2436, 136.2172, 41.6333, -3302.260, 2328.175],   // perihelion 1990-12-17
    [-2134.4, 1.582699, 0.5401803, 3.2422, 136.1666, 41.7601, -969.632, 2332.462],   // perihelion 1997-05-06
    [201.0, 1.590384, 0.5387787, 3.2397, 136.1497, 41.7442, 1363.561, 2338.769],   // perihelion 2003-09-26
    [2538.1, 1.598076, 0.5373672, 3.2371, 136.1032, 41.7869, 3705.242, 2344.984],   // perihelion 2010-02-22
    [4876.5, 1.592175, 0.5383804, 3.2388, 136.1271, 41.6961, 6044.806, 2339.690],   // perihelion 2016-07-20
    [7214.7, 1.598440, 0.5372531, 3.2363, 136.0972, 41.6315, 8384.120, 2344.919],   // perihelion 2022-12-15
    [9553.2, 1.590500, 0.5386745, 3.2389, 136.1022, 41.6621, 10726.047, 2338.234],   // perihelion 2029-05-14
    [11889.8, 1.586329, 0.5394602, 3.2388, 136.0736, 41.6141, 13059.525, 2335.005],   // perihelion 2035-10-04
    [14222.5, 1.580060, 0.5406616, 3.2408, 136.0576, 41.6922, 15394.312, 2330.288],   // perihelion 2042-02-23
    [16549.2, 1.527043, 0.5500600, 3.2376, 135.2776, 43.0569, 17710.832, 2283.722],   // perihelion 2048-06-28
    [18850.6, 1.523527, 0.5508275, 3.2387, 135.2454, 43.1720, 19996.536, 2281.677],   // perihelion 2054-10-01
    [21128.1, 1.762756, 0.5014388, 11.0000, 26.3056, 143.6469, 22253.476, 2428.338],   // perihelion 2060-12-04
    [23465.2, 1.765100, 0.5010725, 10.9993, 26.2424, 143.8214, 24686.569, 2430.504],   // perihelion 2067-08-04
    [25905.8, 1.799491, 0.4953916, 11.0049, 25.7923, 144.4724, 27133.697, 2459.751],   // perihelion 2074-04-16
  ],
  '109P': [
    [-Infinity, 0.958217, 0.9635915, 113.4266, 139.4444, 153.0015, -2576.176, 49316.160],   // perihelion 1992-12-12
  ],
  '55P': [
    [-Infinity, 0.981638, 0.9044327, 162.7046, 235.1160, 172.5668, -12664.500, 12024.351],   // perihelion 1965-04-30
    [-6651.2, 0.976586, 0.9054985, 162.4861, 235.2586, 172.4970, -672.403, 12134.047],   // perihelion 1998-02-28
    [5401.9, 0.964370, 0.9077738, 162.5748, 235.6102, 172.8670, 11462.565, 12350.429],   // perihelion 2031-05-21
    [17633.8, 0.967766, 0.9072454, 162.5272, 236.7462, 173.8441, 23812.618, 12309.793],   // perihelion 2065-03-13
  ],
};
// SBDB elements as fetched (the starting state of the integration; the drawn orbit comes from `sets` where there is one)
export const SBDB = {
  '67P': { q: 1.243265640702404, e: 0.6409081308996354, i: 7.040294937543767, node: 50.13557377155012, peri: 12.79824970228189, T: 2457247.588657812 - JD2000, },
  '2P': { q: 0.3395817503585773, e: 0.846940430888432, i: 11.33675914978793, node: 334.0171400057891, peri: 187.2881998732444, T: 2460240.0285326503 - JD2000, },
  '9P': { q: 1.542540469975507, e: 0.5097028326964878, i: 10.4734281543904, node: 68.75357468050096, peri: 179.1972753698572, T: 2457603.0707245683 - JD2000, },
  '81P': { q: 1.595856073147981, e: 0.5373989073846863, i: 3.237004173608168, node: 136.1102208500619, peri: 41.72523085114398, T: 2459929.2845797744 - JD2000, },
  '109P': { q: 0.959516155068868, e: 0.963225755046038, i: 113.453816997171, node: 139.3811920815948, peri: 152.9821676305871, T: 2448968.499784556 - JD2000, },
  '55P': { q: 0.976427915467506, e: 0.905552720972412, i: 162.486575379434, node: 235.270989149082, peri: 172.5002736828059, T: 2450872.5977341123 - JD2000, },
  'C/2020 F3': { q: 0.2946512493809196, e: 0.9991780262531292, i: 128.9375027594809, node: 61.01042818536988, peri: 37.2786584481257, T: 2459034.1788980444 - JD2000, },
  'C/2023 A3': { q: 0.3914300748355564, e: 1.000095368540586, i: 139.112109080566, node: 21.55947897244586, peri: 308.4917649633916, T: 2460581.240845176 - JD2000, },
};

// row → { from, q, e, i, node, peri, T, period, a }; the comet starts on the set for 2026 (index.js switches by date)
const toSet = ([from, q, e, i, node, peri, T, period]) => ({ from, q, e, i, node, peri, T, period, a: q / (1 - e) });
function withSets(key, c) {
  c.sets = SETS[key].map(toSet);
  const now = 9790;                                             // 2026-10-21, days since J2000
  Object.assign(c, [...c.sets].reverse().find((s) => s.from <= now));
  return c;
}

export const FAMOUS = [
  withSets('67P', {
    name: '67P/Churyumov-Gerasimenko', short: '67P', designation: '67P/Churyumov-Gerasimenko', color: '#ffd39a',
    type: 'Periodic comet (Jupiter family) · visited by ESA\'s Rosetta and its lander Philae',
    sub: 'Rosetta & Philae comet', aliases: ['67p', 'churyumov', 'gerasimenko', 'rosetta', 'philae', 'rubber duck', 'duck comet'],
    nucleusKm: 4.1, shape: 'duck',
    rOn: 3.5, ionAU: 0.05, dustAU: 0.07, tailsInline: true,
    rows: [
      ['Orbit', 'Every 6.4 years, between just outside Earth\'s orbit (1.2 AU) and Jupiter\'s (5.7 AU), tilted 4°'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', 'Last on 2 Nov 2021, next around 8 Apr 2028 (Rosetta watched the 13 Aug 2015 one up close)'],
      ['Visited by', 'Rosetta (ESA), in orbit Aug 2014 – Sep 2016; Philae landed on 12 Nov 2014, the first landing on a comet'],
    ],
    fact: 'Its "rubber duck" nucleus is two lobes about 4.1 and 2.6 km across joined by a neck, spinning every 12.4 hours, ' +
          'and as dark as charcoal. Rosetta flew alongside it for two years. Philae bounced twice off the surface and ' +
          'came to rest in a shadowed crack, where it was finally photographed in September 2016, weeks before Rosetta ' +
          'itself was set down on the comet. Rosetta found glycine (an amino acid), phosphorus and oxygen gas, and water ' +
          'with about three times as much heavy hydrogen as Earth\'s oceans. Klim Churyumov and Svetlana Gerasimenko found ' +
          'it in 1969, ten years after a pass by Jupiter brought it into the inner Solar System.',
  }),
  withSets('2P', {
    name: '2P/Encke', short: 'Encke', designation: '2P/Encke', color: '#bfe8ff',
    type: 'Periodic comet · the shortest orbit of any bright comet, 3.3 years',
    sub: 'Parent of the Taurid meteors', aliases: ['encke', '2p', 'taurids', 'taurid'],
    nucleusKm: 4.8,
    rOn: 2.5, ionAU: 0.06, dustAU: 0.04, tailsInline: true,
    rows: [
      ['Orbit', 'Every 3.3 years, from inside Mercury\'s orbit (0.34 AU) out to the asteroid belt (4.1 AU)'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', 'Last on 22 Oct 2023, next on 10 Feb 2027; it has been seen at more than 60 returns since 1786'],
      ['Meteor shower', 'The Taurids (October–November): slow, often bright fireballs from the dust it has shed for millennia'],
    ],
    fact: 'Pierre Méchain first saw it in 1786, but it is named after Johann Franz Encke, who worked out in 1819 that four ' +
          'sightings were one comet and predicted its 1822 return: only the second comet after Halley\'s known to come ' +
          'back, hence "2P". Its nucleus is about 4.8 km across and it spends so long near the Sun that its ices are ' +
          'running low, so it is faint and has little dust tail. In 2007 NASA\'s STEREO spacecraft watched a solar storm ' +
          'tear off its ion tail.',
  }),
  withSets('9P', {
    name: '9P/Tempel 1', short: 'Tempel 1', designation: '9P/Tempel 1', color: '#ffc0a8',
    type: 'Periodic comet (Jupiter family) · target of NASA\'s Deep Impact',
    sub: 'Deep Impact comet', aliases: ['tempel 1', 'tempel1', '9p', 'deep impact', 'stardust next'],
    nucleusKm: 6,
    rOn: 3.5, ionAU: 0.04, dustAU: 0.05, tailsInline: true,
    rows: [
      ['Orbit', 'Every 5.6 years until Jupiter\'s pull in 2024 stretched it to 6.0, between 1.5 and 4.7 AU, tilted 10°'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', 'Last on 4 Mar 2022, next around 13 Feb 2028 (one fell the day after Deep Impact: 5 Jul 2005)'],
      ['Visited by', 'Deep Impact (NASA) fired a 370 kg impactor into it on 4 Jul 2005; Stardust saw the crater on 14 Feb 2011'],
    ],
    fact: 'Wilhelm Tempel found it in 1867. Deep Impact\'s copper-weighted impactor hit at 10.3 km/s and threw up a bright ' +
          'plume of fine dust and ice, showing a fluffy, porous interior with a powdery surface. The nucleus is about ' +
          '7.6 × 4.9 km and turns every 41 hours. Six years later the Stardust probe flew past and found the 150 m crater, ' +
          'softened by material that had fallen back into it.',
  }),
  withSets('81P', {
    name: '81P/Wild 2', short: 'Wild 2', designation: '81P/Wild 2', color: '#c8ffb0',
    type: 'Periodic comet (Jupiter family) · NASA\'s Stardust brought its dust to Earth',
    sub: 'Stardust comet', aliases: ['wild 2', 'wild2', '81p', 'stardust', 'vilt'],
    nucleusKm: 4,
    rOn: 3.5, ionAU: 0.04, dustAU: 0.06, tailsInline: true,
    rows: [
      ['Orbit', 'Every 6.4 years, between 1.6 and 5.3 AU, almost in the planets\' plane (3°)'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', 'Last on 15 Dec 2022, next around 14 May 2029'],
      ['Visited by', 'Stardust (NASA) flew through its coma 237 km from the nucleus on 2 Jan 2004; the dust landed in Utah on 15 Jan 2006'],
    ],
    fact: 'Swiss astronomer Paul Wild found it in 1978 (say "Vilt"). Until 10 Sep 1974 it stayed beyond Jupiter, but that ' +
          'year it passed within 0.006 AU (900,000 km) of Jupiter, which flung it onto its present, much smaller orbit. Stardust ' +
          'caught thousands of grains in a block of aerogel. Some turned out to be crystals that formed in great heat near ' +
          'the young Sun, so material was mixed right across the early Solar System; the samples also held glycine.',
  }),
  withSets('109P', {
    name: '109P/Swift-Tuttle', short: 'Swift-Tuttle', designation: '109P/Swift-Tuttle', color: '#ffe9a0',
    type: 'Periodic comet (Halley type) · parent of the Perseid meteor shower',
    sub: 'Parent of the Perseids', aliases: ['swift tuttle', 'swift-tuttle', '109p', 'perseids', 'perseid'],
    nucleusKm: 26,
    rOn: 5, ionAU: 0.22, dustAU: 0.14, tailsInline: true,
    rows: [
      ['Orbit', 'About 133 years, backwards compared with the planets (113°), out to 51 AU, beyond Pluto'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '0.96 AU: last on 12 Dec 1992, next on 12 Jul 2126 (JPL prediction)'],
      ['Meteor shower', 'The Perseids, every year around 12 August, when Earth crosses its dust trail at 59 km/s'],
    ],
    fact: 'Lewis Swift and Horace Tuttle found it independently in July 1862. With a nucleus about 26 km across, it is the ' +
          'largest object known to pass close to Earth again and again: its orbit comes within about 0.0009 AU of ours. ' +
          'It is no danger in the coming centuries; its closest pass in the next two thousand years is about ' +
          '0.03 AU (4.5 million km) in the year 4479.',
  }),
  withSets('55P', {
    name: '55P/Tempel-Tuttle', short: 'Tempel-Tuttle', designation: '55P/Tempel-Tuttle', color: '#d8c8ff',
    type: 'Periodic comet (Halley type) · parent of the Leonid meteor shower',
    sub: 'Parent of the Leonids', aliases: ['tempel tuttle', 'tempel-tuttle', '55p', 'leonids', 'leonid'],
    nucleusKm: 3.6,
    rOn: 4, ionAU: 0.08, dustAU: 0.07, tailsInline: true,
    rows: [
      ['Orbit', 'Every 33 years, backwards compared with the planets (162°), out to 19.7 AU, near Uranus\'s orbit'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '0.98 AU: last on 28 Feb 1998, next on 20 May 2031 (and before that, 30 Apr 1965)'],
      ['Meteor shower', 'The Leonids, every year around 17 November; storms of thousands an hour in 1833, 1966 and 1999–2002'],
    ],
    fact: 'Found by Wilhelm Tempel in December 1865 and Horace Tuttle in January 1866. Its dust hits Earth\'s air at 71 km/s, ' +
          'one of the fastest showers, and in the years around each return the fresh trails can give a meteor storm: on ' +
          '17 November 1966 observers in the western US counted dozens of meteors per second. The 1833 storm started ' +
          'the scientific study of meteors. The nucleus is about 3.6 km across.',
  }),
  {
    name: 'Comet NEOWISE (C/2020 F3)', short: 'NEOWISE', designation: 'C/2020 F3', color: '#a8f0ff',
    type: 'Long-period comet (C/2020 F3) · the Great Comet of July 2020',
    sub: 'Great comet of 2020', aliases: ['neowise', 'c/2020 f3', '2020 f3', 'great comet 2020', 'comet neowise'],
    ...SBDB['C/2020 F3'],
    nucleusKm: 5,
    rOn: 4, ionAU: 0.14, dustAU: 0.12, tailsInline: true,
    rows: [
      ['Orbit', 'About 6,800 years (back around the year 8800), tilted 129°; farthest about 720 AU out'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '0.29 AU (inside Mercury\'s orbit) on 3 Jul 2020; closest to Earth, 103 million km, on 23 Jul 2020'],
      ['Seen', 'With the naked eye in July 2020, in the northern sky at dusk and dawn, with a curved dust tail and a blue ion tail'],
    ],
    fact: 'Found on 27 March 2020 by NASA\'s NEOWISE infrared space telescope, it survived its close pass of the Sun and ' +
          'became the brightest comet in the northern sky since Hale-Bopp in 1997. Its nucleus is about 5 km across. ' +
          'Photos from around the world, and from the International Space Station, showed its two tails during the ' +
          'first summer of the COVID-19 pandemic.',
  },
  {
    name: 'Comet Tsuchinshan-ATLAS (C/2023 A3)', short: 'Tsuchinshan-ATLAS', designation: 'C/2023 A3', color: '#fff0c8',
    type: 'Long-period comet (C/2023 A3) · the great comet of October 2024',
    sub: 'Great comet of 2024', aliases: ['tsuchinshan', 'tsuchinshan atlas', 'tsuchinshan-atlas', 'c/2023 a3', '2023 a3', 'great comet 2024'],
    ...SBDB['C/2023 A3'], hyperbolic: true, interstellar: false,
    nucleusKm: 5,
    rOn: 6, ionAU: 0.16, dustAU: 0.22, tailsInline: true,
    rows: [
      ['Orbit', 'From the distant Oort cloud, tilted 139°. Near the Sun its orbit is just open (e = 1.0001), so it may never come back'],
      ['Distance from Sun', 'live'],
      ['Closest to Sun', '0.39 AU on 27 Sep 2024; closest to Earth, 71 million km, on 12 Oct 2024'],
      ['Seen', 'With the naked eye in October 2024 in the evening sky, with a long dust tail and an "anti-tail" pointing towards the Sun'],
    ],
    fact: 'Found on 9 January 2023 at China\'s Purple Mountain (Zijinshan, "Tsuchinshan") Observatory and again on ' +
          '22 February by the ATLAS survey. In early October 2024 it passed almost between the Sun and Earth, and sunlight ' +
          'scattered forwards by its dust made it briefly as bright as Venus in the SOHO spacecraft\'s coronagraph. Days later ' +
          'it moved into the evening sky, where its tail stretched across 30° or more in long photos.',
  },
];
for (const c of FAMOUS) {
  c.a = c.q / (1 - c.e);                                       // negative for C/2023 A3's open path
  if (c.hyperbolic) c.n = 0.01720209895 / Math.pow(-c.a, 1.5);
  else if (!c.period) c.period = 365.25 * Math.pow(c.a, 1.5);
}
// 109P: one set (1992), with the period set from JPL's 1992 and 2126 perihelia, like Halley's in data.js
{ const sw = FAMOUS[4]; sw.period = sw.sets[0].period = (Date.UTC(2126, 6, 12) - Date.UTC(1992, 11, 12)) / 86400000; }
