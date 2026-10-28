import crypto from 'node:crypto';
import { getCloudinary } from '../config/cloudinary.js';

// Identify the real file type from its first bytes. The browser-supplied MIME type is not trusted.
export function sniffFile(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf.subarray(0, 1024).includes('%PDF-')) return { mime: 'application/pdf', ext: 'pdf', resourceType: 'raw' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', resourceType: 'image' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png', resourceType: 'image' };
  return null;
}

// Upload to Cloudinary as a private ("authenticated") asset.
// PDFs are stored as raw assets whose public_id ends in ".pdf" (Cloudinary's convention for raw files).
export function uploadDocument({ buffer, userId, kind, type }) {
  const cloudinary = getCloudinary();
  const base = `civicride/driver-documents/${userId}/${kind}-${crypto.randomUUID()}`;
  const options = {
    public_id: type.ext === 'pdf' ? `${base}.pdf` : base,
    type: 'authenticated',
    resource_type: type.resourceType,
    overwrite: false
  };
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      if (!result?.public_id) return reject(new Error('Cloudinary returned no public_id'));
      resolve(result);
    });
    stream.end(buffer);
  });
}

export async function deleteDocument(doc) {
  try {
    if (!doc?.publicId) return;
    await getCloudinary().uploader.destroy(doc.publicId, { resource_type: doc.resourceType === 'raw' ? 'raw' : 'image', type: 'authenticated', invalidate: true });
  } catch (e) {
    console.warn('Could not delete replaced document from Cloudinary:', e?.message || e);
  }
}

// Build every URL that could legitimately point at this asset. Older uploads (made before this fix)
// may have been stored with a slightly different public_id shape, so we try the candidates in order.
function candidateUrls(doc) {
  const cloudinary = getCloudinary();
  const expires = Math.floor(Date.now() / 1000) + 300;
  const pid = doc.publicId;
  const urls = [];
  const add = fn => { try { urls.push(fn()); } catch { /* skip candidates the SDK cannot build */ } };
  const guessFormat = () => doc.format || String(doc.secureUrl || '').match(/\.(jpg|jpeg|png|webp|pdf)(?:\?|$)/i)?.[1]?.toLowerCase();

  if (doc.resourceType === 'raw') {
    add(() => cloudinary.utils.private_download_url(pid, undefined, { resource_type: 'raw', type: 'authenticated', expires_at: expires }));
    add(() => cloudinary.url(pid, { resource_type: 'raw', type: 'authenticated', sign_url: true, secure: true }));
    if (!/\.pdf$/i.test(pid)) {
      add(() => cloudinary.utils.private_download_url(pid, 'pdf', { resource_type: 'raw', type: 'authenticated', expires_at: expires }));
      add(() => cloudinary.url(`${pid}.pdf`, { resource_type: 'raw', type: 'authenticated', sign_url: true, secure: true }));
    }
  } else {
    const fmt = guessFormat() || 'jpg';
    add(() => cloudinary.utils.private_download_url(pid, fmt, { resource_type: 'image', type: 'authenticated', expires_at: expires }));
    add(() => cloudinary.url(pid, { resource_type: 'image', type: 'authenticated', sign_url: true, secure: true, format: fmt }));
  }
  return urls;
}

// Fetch the private file on the server so the browser never sees a Cloudinary URL.
export async function fetchDocumentFile(doc) {
  const failures = [];
  for (const url of candidateUrls(doc)) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) { failures.push(res.status); continue; }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (!buffer.length) { failures.push('empty'); continue; }
      const type = sniffFile(buffer);
      return { buffer, mime: type?.mime || doc.mimeType || res.headers.get('content-type') || 'application/octet-stream', ext: type?.ext };
    } catch (e) {
      failures.push(e?.message || 'network error');
    }
  }
  const err = new Error(`Cloudinary did not return the file (attempts: ${failures.join(', ') || 'none'})`);
  err.status = 502;
  throw err;
}
