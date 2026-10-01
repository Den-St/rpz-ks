'use strict';

class CartesianPoint2D {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        Object.freeze(this);
    }

    distanceTo(other) {
        return Math.hypot(this.x - other.x, this.y - other.y);
    }
    toString() {
        return `CartesianPoint2D(x=${this.x.toFixed(6)}, y=${this.y.toFixed(6)})`;
    }
}

class PolarPoint {
    constructor(radius, angle) {
        this.radius = radius;
        this.angle = angle;
        Object.freeze(this);
    }

    distanceTo(other) {
        return Math.sqrt(
            this.radius * this.radius + other.radius * other.radius
            - 2 * this.radius * other.radius * Math.cos(other.angle - this.angle)
        );
    }
    toString() {
        return `PolarPoint(r=${this.radius.toFixed(6)}, θ=${this.angle.toFixed(6)} рад)`;
    }
}

class CartesianPoint3D {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        Object.freeze(this);
    }

    distanceTo(other) {
        return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z);
    }
    toString() {
        return `CartesianPoint3D(x=${this.x.toFixed(6)}, y=${this.y.toFixed(6)}, z=${this.z.toFixed(6)})`;
    }
}

class SphericalPoint {
    constructor(radius, azimuth, polarAngle) {
        this.radius = radius;        
        this.azimuth = azimuth;
        this.polarAngle = polarAngle;
        Object.freeze(this);
    }

    chordDistanceTo(other) {
        const cosAngle =
            Math.sin(this.polarAngle) * Math.sin(other.polarAngle) * Math.cos(this.azimuth - other.azimuth)
            + Math.cos(this.polarAngle) * Math.cos(other.polarAngle);
        return Math.sqrt(
            this.radius * this.radius + other.radius * other.radius
            - 2 * this.radius * other.radius * cosAngle
        );
    }
    
    arcDistanceTo(other) {
        let cosAngle =
            Math.sin(this.polarAngle) * Math.sin(other.polarAngle) * Math.cos(this.azimuth - other.azimuth)
            + Math.cos(this.polarAngle) * Math.cos(other.polarAngle);
        if (cosAngle > 1) cosAngle = 1;
        if (cosAngle < -1) cosAngle = -1;
        return this.radius * Math.acos(cosAngle);
    }
    toString() {
        return `SphericalPoint(r=${this.radius.toFixed(6)}, φ=${this.azimuth.toFixed(6)}, θ=${this.polarAngle.toFixed(6)})`;
    }
}

function convert(point) {
    if (point instanceof CartesianPoint2D) {
        const r = Math.hypot(point.x, point.y);
        const theta = Math.atan2(point.y, point.x);
        return new PolarPoint(r, theta);
    }
    if (point instanceof PolarPoint) {
        const x = point.radius * Math.cos(point.angle);
        const y = point.radius * Math.sin(point.angle);
        return new CartesianPoint2D(x, y);
    }
    if (point instanceof CartesianPoint3D) {
        const r = Math.hypot(point.x, point.y, point.z);
        const azimuth = Math.atan2(point.y, point.x);
        const polarAngle = r === 0 ? 0 : Math.acos(point.z / r);
        return new SphericalPoint(r, azimuth, polarAngle);
    }
    if (point instanceof SphericalPoint) {
        const { radius: r, azimuth: phi, polarAngle: theta } = point;
        const x = r * Math.sin(theta) * Math.cos(phi);
        const y = r * Math.sin(theta) * Math.sin(phi);
        const z = r * Math.cos(theta);
        return new CartesianPoint3D(x, y, z);
    }
    throw new TypeError('convert: невідомий тип точки');
}

const EPS = 1e-9;

function approxEqual(a, b, eps = EPS) {
    return Math.abs(a - b) < eps;
}

function testConversions() {
    console.log('=================================================================');
    console.log('  Перевірка коректності перетворень (пряме → зворотне)');
    console.log('=================================================================\n');

    const cart2D = [
        new CartesianPoint2D(3, 4),
        new CartesianPoint2D(-2, 5),
        new CartesianPoint2D(0, -7),
        new CartesianPoint2D(1.5, -3.25),
    ];

    console.log('--- 2D: Cartesian → Polar → Cartesian ---');
    for (const p of cart2D) {
        const polar = convert(p);
        const back = convert(polar);
        const ok = approxEqual(p.x, back.x) && approxEqual(p.y, back.y);
        console.log(`  ${p.toString()}`);
        console.log(`    → ${polar.toString()}`);
        console.log(`    → ${back.toString()}   ${ok ? '✓ OK' : '✗ FAIL'}\n`);
    }

    const cart3D = [
        new CartesianPoint3D(1, 2, 3),
        new CartesianPoint3D(-4, 5, -6),
        new CartesianPoint3D(0, 0, 10),
        new CartesianPoint3D(7.5, -1.2, 4.8),
    ];

    console.log('--- 3D: Cartesian → Spherical → Cartesian ---');
    for (const p of cart3D) {
        const sph = convert(p);
        const back = convert(sph);
        const ok = approxEqual(p.x, back.x)
                && approxEqual(p.y, back.y)
                && approxEqual(p.z, back.z);
        console.log(`  ${p.toString()}`);
        console.log(`    → ${sph.toString()}`);
        console.log(`    → ${back.toString()}   ${ok ? '✓ OK' : '✗ FAIL'}\n`);
    }

    console.log('--- Перевірка обчислення відстаней ---');
    const a2 = new CartesianPoint2D(0, 0);
    const b2 = new CartesianPoint2D(3, 4);
    const ap = convert(a2);
    const bp = convert(b2);
    console.log(`  2D декартова: d = ${a2.distanceTo(b2).toFixed(6)} (очікується 5)`);
    console.log(`  2D полярна:   d = ${ap.distanceTo(bp).toFixed(6)} (очікується 5)`);

    const a3 = new CartesianPoint3D(0, 0, 0);
    const b3 = new CartesianPoint3D(1, 2, 2);
    const as = convert(a3);
    const bs = convert(b3);
    console.log(`  3D декартова: d = ${a3.distanceTo(b3).toFixed(6)} (очікується 3)`);
    console.log(`  3D сферична (хорда): d = ${as.chordDistanceTo(bs).toFixed(6)} (очікується 3)`);

    const s1 = new SphericalPoint(1, 0, Math.PI / 2);
    const s2 = new SphericalPoint(1, Math.PI / 2, Math.PI / 2);
    console.log(`  Дугова відстань (r=1, кут π/2): d = ${s1.arcDistanceTo(s2).toFixed(6)} (очікується ${(Math.PI / 2).toFixed(6)})`);
    console.log();
}

// =========================================================================
// 5. Бенчмаркінг
// =========================================================================

const N = 100_000;   // кількість пар точок
const RUNS = 7;      // кількість прогонів (медіана)

function randomPolarPair() {
    return [
        new PolarPoint(Math.random() * 100, (Math.random() * 2 - 1) * Math.PI),
        new PolarPoint(Math.random() * 100, (Math.random() * 2 - 1) * Math.PI),
    ];
}

function randomSphericalPair() {
    // Однаковий радіус для обох точок пари (щоб дугова відстань мала сенс)
    const r = Math.random() * 100 + 1;
    return [
        new SphericalPoint(r, (Math.random() * 2 - 1) * Math.PI, Math.random() * Math.PI),
        new SphericalPoint(r, (Math.random() * 2 - 1) * Math.PI, Math.random() * Math.PI),
    ];
}

function median(values) {
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function timeIt(fn) {
    const t0 = process.hrtime.bigint();
    const sink = fn();
    const t1 = process.hrtime.bigint();
    return { ms: Number(t1 - t0) / 1e6, sink };
}

function benchmark(label, fn) {
    const times = [];
    let sink = 0;
    for (let i = 0; i < RUNS; i++) {
        const r = timeIt(fn);
        times.push(r.ms);
        sink += r.sink;
    }
    const med = median(times);
    console.log(`  ${label.padEnd(38)} медіана: ${med.toFixed(3)} мс   всі: [${times.map(t => t.toFixed(3)).join(', ')}]   (sink=${sink.toFixed(2)})`);
    return med;
}

function runBenchmarks() {
    console.log('=================================================================');
    console.log(`  Бенчмаркінг  (N = ${N.toLocaleString('en-US')} пар, прогонів = ${RUNS}, беремо медіану)`);
    console.log('=================================================================\n');

    const polarPairs = new Array(N);
    for (let i = 0; i < N; i++) polarPairs[i] = randomPolarPair();
    const cart2DPairs = polarPairs.map(([p1, p2]) => [convert(p1), convert(p2)]);

    console.log('--- 2D ---');
    const t2Dpolar = benchmark('А) Полярні (теорема косинусів)', () => {
        let s = 0;
        for (let i = 0; i < N; i++) {
            const pair = polarPairs[i];
            s += pair[0].distanceTo(pair[1]);
        }
        return s;
    });
    const t2Dcart = benchmark('Б) Декартові (евклідова)', () => {
        let s = 0;
        for (let i = 0; i < N; i++) {
            const pair = cart2DPairs[i];
            s += pair[0].distanceTo(pair[1]);
        }
        return s;
    });
    console.log();

    const sphPairs = new Array(N);
    for (let i = 0; i < N; i++) sphPairs[i] = randomSphericalPair();
    const cart3DPairs = sphPairs.map(([p1, p2]) => [convert(p1), convert(p2)]);

    console.log('--- 3D ---');
    const t3Dchord = benchmark('А) Сферична, хорда', () => {
        let s = 0;
        for (let i = 0; i < N; i++) {
            const pair = sphPairs[i];
            s += pair[0].chordDistanceTo(pair[1]);
        }
        return s;
    });
    const t3Darc = benchmark('Б) Сферична, дуга', () => {
        let s = 0;
        for (let i = 0; i < N; i++) {
            const pair = sphPairs[i];
            s += pair[0].arcDistanceTo(pair[1]);
        }
        return s;
    });
    const t3Dcart = benchmark('В) Декартова (евклідова 3D)', () => {
        let s = 0;
        for (let i = 0; i < N; i++) {
            const pair = cart3DPairs[i];
            s += pair[0].distanceTo(pair[1]);
        }
        return s;
    });
    console.log();

    console.log('=================================================================');
    console.log('  Підсумкова таблиця (медіана часу, мс)');
    console.log('=================================================================');
    console.log('  | Простір | Підхід                          | Час, мс |');
    console.log('  |---------|---------------------------------|---------|');
    console.log(`  | 2D      | Полярні (теорема косинусів)     | ${t2Dpolar.toFixed(3).padStart(7)} |`);
    console.log(`  | 2D      | Декартові (евклідова)           | ${t2Dcart.toFixed(3).padStart(7)} |`);
    console.log(`  | 3D      | Сферична, хорда                 | ${t3Dchord.toFixed(3).padStart(7)} |`);
    console.log(`  | 3D      | Сферична, дуга                  | ${t3Darc.toFixed(3).padStart(7)} |`);
    console.log(`  | 3D      | Декартова (евклідова 3D)        | ${t3Dcart.toFixed(3).padStart(7)} |`);
    console.log();
}

testConversions();
runBenchmarks();
