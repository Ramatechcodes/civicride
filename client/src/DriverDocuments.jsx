import { Upload, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { REQUIRED_DOCS, DOC_LABELS, MAX_DOC_BYTES, fmtBytes } from './constants.js';

export default function DriverDocuments({ documents = [], kind, setKind, file, setFile, fileKey, uploading, onSubmit }) {
  const byKind = Object.fromEntries(documents.map(d => [d.kind, d]));
  const approved = REQUIRED_DOCS.filter(k => byKind[k]?.status === 'approved').length;
  const uploaded = REQUIRED_DOCS.filter(k => byKind[k]).length;
  const tooBig = file && file.size > MAX_DOC_BYTES;

  return <div className="ddoc">
    <h3>Driver verification documents</h3>
    <p>{uploaded} of {REQUIRED_DOCS.length} uploaded · {approved} approved. An admin reviews each file; you will see the result here.</p>

    <div className="ddoc-list">
      {REQUIRED_DOCS.map(k => {
        const d = byKind[k];
        const Icon = !d ? Upload : d.status === 'approved' ? CheckCircle2 : d.status === 'rejected' ? XCircle : Clock3;
        return <div className={`ddoc-item ${d ? `ddoc-${d.status}` : 'ddoc-missing'}`} key={k}>
          <Icon size={18} />
          <div>
            <b>{DOC_LABELS[k]}</b>
            <small>{!d ? 'Not uploaded yet' : d.status === 'pending' ? 'Waiting for admin review' : d.status === 'approved' ? 'Approved' : 'Rejected — please upload a new file'}</small>
            {d?.status === 'rejected' && d.reviewNote && <small className="ddoc-reason">Reason: {d.reviewNote}</small>}
          </div>
          <button type="button" className="outline small" onClick={() => setKind(k)}>{d ? 'Replace' : 'Upload'}</button>
        </div>;
      })}
    </div>

    <form className="form-stack" onSubmit={onSubmit}>
      <label>Document type
        <select value={kind} onChange={e => setKind(e.target.value)}>{REQUIRED_DOCS.map(k => <option key={k} value={k}>{DOC_LABELS[k]}</option>)}</select>
      </label>
      <label>File (JPG, PNG or PDF, max 8 MB)
        <input key={fileKey} type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} required />
        {file && <small className={tooBig ? 'ddoc-reason' : ''}>{file.name} · {fmtBytes(file.size)}{tooBig ? ' — too large, choose a smaller file' : ''}</small>}
      </label>
      {byKind[kind] && <small className="muted">You already uploaded this document. Uploading again replaces it and sends it for a fresh review.</small>}
      <button className="primary" type="submit" disabled={uploading || tooBig}>{uploading ? 'Uploading…' : 'Upload for review'}</button>
    </form>
  </div>;
}
