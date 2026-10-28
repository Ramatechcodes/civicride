process.env.JWT_SECRET = 'x'.repeat(64);
process.env.NODE_ENV = 'development';
process.env.CLOUDINARY_CLOUD_NAME = 'democloud'; process.env.CLOUDINARY_API_KEY = '123'; process.env.CLOUDINARY_API_SECRET = 'secret';
const root = new URL('../src/', import.meta.url).href;
const { default: express } = await import('express');
const { default: jwt } = await import('jsonwebtoken');
const { default: mongoose } = await import('mongoose');
const { default: User } = await import(root + 'models/User.js');
const { default: Ride } = await import(root + 'models/Ride.js');
const { default: Incident } = await import(root + 'models/Incident.js');
const { default: cloudinaryPkg } = await import('cloudinary');

// ---- fake persistence -------------------------------------------------
const store = [];
const chain = (rows, lean) => { const c = { select: () => c, sort: () => c, limit: () => c, populate: () => c, lean: () => Promise.resolve(rows.map(r => r.toObject ? r.toObject() : r)), then: (res, rej) => Promise.resolve(rows).then(res, rej) }; return c; };
const match = (f = {}) => store.filter(u => Object.entries(f).every(([k, v]) => String(u[k]) === String(v)));
User.findById = async id => store.find(u => String(u._id) === String(id)) || null;
User.findOne = async f => match(f)[0] || null;
User.find = f => chain(match(f));
User.countDocuments = async f => match(f).length;
User.prototype.save = async function () { await this.validate(); return this; };
Ride.countDocuments = async () => 0; Ride.aggregate = async () => []; Ride.find = () => chain([]);
Incident.find = () => chain([]);

// ---- fake Cloudinary ---------------------------------------------------
const cdn = {}; const v2 = cloudinaryPkg.v2;
v2.uploader.upload_stream = (opts, cb) => ({ end: buf => { cdn[opts.public_id] = buf; cb(null, { public_id: opts.public_id, secure_url: `https://res.cloudinary.com/democloud/${opts.resource_type}/authenticated/${opts.public_id}`, format: opts.resource_type === 'raw' ? undefined : 'jpg' }); } });
v2.uploader.destroy = async pid => { delete cdn[pid]; return { result: 'ok' }; };
const realFetch = globalThis.fetch; const fetchLog = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.cloudinary.com') || String(url).includes('res.cloudinary.com')) {
    fetchLog.push(String(url));
    // simulate: the first (download API) attempt fails with 404, fallback signed URL works
    if (String(url).includes('/download')) return new Response('nf', { status: 404 });
    const pid = Object.keys(cdn).find(k => String(url).includes(k.replace(/\.pdf$/, '')));
    return pid ? new Response(cdn[pid], { status: 200, headers: { 'content-type': 'application/octet-stream' } }) : new Response('nf', { status: 404 });
  }
  return realFetch(url, opts);
};

// ---- app -------------------------------------------------------------
const app = express(); app.use(express.json());
app.use('/api/drivers', (await import(root + 'routes/drivers.js')).default);
app.use('/api/admin', (await import(root + 'routes/admin.js')).default);
app.use((err, _q, res, _n) => res.status(err.status || 500).json({ message: err.message }));
const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}/api`;

const mk = async (role, name, extra = {}) => { const u = new User({ name, email: `${name}@t.io`, role, driverStatus: role === 'driver' ? 'pending' : 'not_applicable', ...extra }); store.push(u); return { u, tok: jwt.sign({ sub: String(u._id), role }, process.env.JWT_SECRET) }; };
const admin = await mk('admin', 'boss'); const drv = await mk('driver', 'tunde');
const H = t => ({ Authorization: `Bearer ${t}` });
const J = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 2)]);
const pdf = Buffer.from('%PDF-1.4\n' + 'x'.repeat(300));
const upload = (tok, kind, buf, name, type) => { const f = new FormData(); f.append('kind', kind); if (buf) f.append('file', new Blob([buf], { type }), name); return realFetch(`${base}/drivers/documents`, { method: 'POST', headers: H(tok), body: f }).then(J); };

// 1 upload each doc type
let r = await upload(drv.tok, 'identity', jpg, 'id.jpg', 'image/jpeg'); ok(r.status === 201, 'driver uploads JPG identity');
r = await upload(drv.tok, 'licence', png, 'lic.png', 'image/png'); ok(r.status === 201, 'driver uploads PNG licence');
r = await upload(drv.tok, 'insurance', pdf, 'ins.pdf', 'application/pdf'); ok(r.status === 201, 'driver uploads PDF insurance');
r = await upload(drv.tok, 'insurance', pdf, 'ins2.pdf', 'application/pdf'); ok(r.status === 201 && r.body.documents.filter(d => d.kind === 'insurance').length === 1, 're-upload replaces instead of duplicating');
r = await upload(drv.tok, 'roadworthiness', Buffer.from('hello not a real file'), 'x.pdf', 'application/pdf'); ok(r.status === 400, 'fake file (wrong magic bytes) rejected: ' + r.body.message);
r = await upload(drv.tok, 'bogus', jpg, 'a.jpg', 'image/jpeg'); ok(r.status === 400, 'invalid document kind rejected');
r = await upload(drv.tok, 'identity', null); ok(r.status === 400, 'missing file rejected');
r = await upload(drv.tok, 'roadworthiness', Buffer.alloc(9 * 1024 * 1024, 7), 'big.jpg', 'image/jpeg'); ok(r.status === 413, 'file over 8MB gives clear 413: ' + r.body.message);
r = await upload(admin.tok, 'identity', jpg, 'a.jpg', 'image/jpeg'); ok(r.status === 403, 'non-driver cannot upload');
for (const k of ['vehicle_registration', 'roadworthiness']) await upload(drv.tok, k, jpg, k + '.jpg', 'image/jpeg');

// 2 admin dashboard shows the driver with role + docs, no storage ids
r = await realFetch(`${base}/admin/dashboard`, { headers: H(admin.tok) }).then(J);
const d = r.body.drivers?.[0];
ok(r.status === 200 && r.body.drivers.length === 1, 'admin dashboard lists the driver');
ok(d?.role === 'driver', 'driver entry includes role (the original bug)');
ok(d?.driverDocuments.length === 5, 'all 5 documents visible to admin');
ok(!JSON.stringify(d).includes('publicId') && !JSON.stringify(d).includes('secureUrl'), 'storage ids/URLs not leaked to browser');
ok(d?.unapprovedDocuments.length === 5 && d?.vehicleComplete === false && d?.readyForApproval === false, 'readiness flags computed');

// 3 approval gate
r = await realFetch(`${base}/admin/drivers/${drv.u._id}/decision`, { method: 'PATCH', headers: { ...H(admin.tok), 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approved' }) }).then(J);
ok(r.status === 409, 'cannot approve before documents approved: ' + r.body.message);

// 4 view each document through the proxy (first URL attempt 404s, fallback must work)
for (const doc of d.driverDocuments) {
  const res = await realFetch(`${base}/admin/drivers/${drv.u._id}/documents/${doc._id}/file`, { headers: H(admin.tok) });
  const buf = Buffer.from(await res.arrayBuffer());
  const expect = doc.kind === 'insurance' ? 'application/pdf' : doc.kind === 'licence' ? 'image/png' : 'image/jpeg';
  ok(res.status === 200 && res.headers.get('content-type') === expect && buf.length > 100, `admin can view ${doc.kind} (${res.headers.get('content-type')})`);
}
r = await realFetch(`${base}/admin/drivers/${drv.u._id}/documents/${drv.u._id}/file`, { headers: H(admin.tok) }).then(J); ok(r.status === 404, 'unknown document id -> 404');
r = await realFetch(`${base}/admin/drivers/${drv.u._id}/documents/${d.driverDocuments[0]._id}/file`, { headers: H(drv.tok) }).then(J); ok(r.status === 403, 'driver cannot open admin file endpoint');

// 5 approve all docs, still blocked by missing vehicle, then save vehicle, then approve
for (const doc of d.driverDocuments) { r = await realFetch(`${base}/admin/drivers/${drv.u._id}/documents/${doc._id}`, { method: 'PATCH', headers: { ...H(admin.tok), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved', note: 'ok' }) }).then(J); }
ok(r.status === 200, 'admin approves documents');
const decide = decision => realFetch(`${base}/admin/drivers/${drv.u._id}/decision`, { method: 'PATCH', headers: { ...H(admin.tok), 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note: 'n' }) }).then(J);
r = await decide('approved'); ok(r.status === 409 && /vehicle/i.test(r.body.message), 'blocked until vehicle saved: ' + r.body.message);
r = await realFetch(`${base}/drivers/profile`, { method: 'PATCH', headers: { ...H(drv.tok), 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicle: { make: 'Toyota', model: 'Corolla', year: '2018', color: 'White', plateNumber: 'abc-123-xy', vehicleType: 'sedan', seats: '4', category: 'economy' } }) }).then(J);
ok(r.status === 200, 'driver saves vehicle details');
r = await decide('approved'); ok(r.status === 200 && r.body.driver.driverStatus === 'approved', 'driver approved');
r = await realFetch(`${base}/admin/dashboard`, { headers: H(admin.tok) }).then(J);
ok(r.body.drivers[0].readyForApproval === true && r.body.drivers[0].vehicle.plateNumber === 'ABC-123-XY', 'admin sees vehicle + ready state');

// 6 rejecting a doc on an approved driver sends them back to pending
const docId = r.body.drivers[0].driverDocuments[0]._id;
r = await realFetch(`${base}/admin/drivers/${drv.u._id}/documents/${docId}`, { method: 'PATCH', headers: { ...H(admin.tok), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', note: 'blurry' }) }).then(J);
ok(r.status === 200 && r.body.driverReverted === true && drv.u.driverStatus === 'pending', 'rejecting a doc re-opens review of an approved driver');
r = await realFetch(`${base}/drivers/documents`, { headers: H(drv.tok) }).then(J);
ok(r.body.documents.some(x => x.status === 'rejected' && x.reviewNote === 'blurry'), 'driver sees the rejection reason');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); server.close(); process.exit(fails ? 1 : 0);
