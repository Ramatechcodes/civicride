import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Eye, Search, X, ExternalLink, TriangleAlert, FileText } from 'lucide-react';
import { REQUIRED_DOCS, DOC_LABELS, fmtBytes } from './constants.js';

const FILTERS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']];
const fmtDate = v => v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown date';

export default function DriverApprovals({ drivers = [], apiBase, token, api, onChanged, notify }) {
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [viewer, setViewer] = useState(null); // { driverId, docId, url, mime, loading, error }

  const counts = useMemo(() => {
    const c = { all: drivers.length, pending: 0, approved: 0, rejected: 0 };
    drivers.forEach(d => { if (c[d.driverStatus] !== undefined) c[d.driverStatus]++; });
    return c;
  }, [drivers]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers.filter(d => (filter === 'all' || d.driverStatus === filter) && (!q ||
      [d.name, d.email, d.phone, d.vehicle?.plateNumber].some(x => String(x || '').toLowerCase().includes(q))));
  }, [drivers, filter, query]);

  // The viewer follows live data: if the driver replaces the file being viewed, close it.
  const vDriver = viewer && drivers.find(d => d._id === viewer.driverId);
  const vDoc = vDriver?.driverDocuments?.find(x => x._id === viewer.docId);
  useEffect(() => { if (viewer && !viewer.loading && !vDoc) closeViewer(); }, [vDoc, viewer]);
  useEffect(() => () => { if (viewer?.url) URL.revokeObjectURL(viewer.url); }, [viewer?.url]);
  useEffect(() => { const onKey = e => e.key === 'Escape' && closeViewer(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);

  function closeViewer() { setViewer(v => { if (v?.url) URL.revokeObjectURL(v.url); return null; }); }

  async function openDoc(driver, doc) {
    setViewer({ driverId: driver._id, docId: doc._id, url: '', mime: '', loading: true, error: '' });
    try {
      const r = await fetch(`${apiBase}/admin/drivers/${driver._id}/documents/${doc._id}/file`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || `Could not load the document (${r.status})`); }
      const blob = await r.blob();
      setViewer(v => v && v.docId === doc._id ? { ...v, url: URL.createObjectURL(blob), mime: blob.type, loading: false } : v);
    } catch (e) {
      setViewer(v => v && v.docId === doc._id ? { ...v, loading: false, error: e.message } : v);
    }
  }

  async function reviewDoc(driver, doc, status) {
    let note = status === 'approved' ? 'Reviewed by admin' : '';
    if (status === 'rejected') {
      const reason = window.prompt(`Why is the ${DOC_LABELS[doc.kind] || doc.kind} rejected? The driver will see this reason.`);
      if (reason === null) return;
      if (!reason.trim()) { notify('Please give a short reason so the driver knows what to fix.'); return; }
      note = reason.trim();
    }
    setBusy(doc._id);
    try { const d = await api(`/admin/drivers/${driver._id}/documents/${doc._id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) }); notify(d.message); await onChanged(); }
    catch (e) { notify(e.message); }
    finally { setBusy(''); }
  }

  async function reviewDriver(driver, decision) {
    let note = '';
    if (decision === 'rejected') {
      const reason = window.prompt(`Why is ${driver.name}'s application rejected? The driver will see this reason.`);
      if (reason === null) return;
      if (!reason.trim()) { notify('Please give a short reason so the driver knows what to fix.'); return; }
      note = reason.trim();
    }
    setBusy(driver._id);
    try { const d = await api(`/admin/drivers/${driver._id}/decision`, { method: 'PATCH', body: JSON.stringify({ decision, note }) }); notify(d.message); await onChanged(); }
    catch (e) { notify(e.message); }
    finally { setBusy(''); }
  }

  const pill = status => <span className={`dap-pill dap-${status}`}>{status}</span>;

  return <div className="dap">
    <div className="dap-toolbar">
      <div className="dap-filters" role="tablist">{FILTERS.map(([k, label]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{label} <span>{counts[k] ?? 0}</span></button>)}</div>
      <label className="dap-search"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email, phone or plate" /></label>
    </div>

    {visible.length === 0 && <p className="muted empty">{drivers.length === 0 ? 'No drivers have registered yet.' : 'No drivers match this filter.'}</p>}

    {visible.map(d => {
      const v = d.vehicle || {};
      const docs = d.driverDocuments || [];
      const ready = d.readyForApproval;
      return <article className="dap-card" key={d._id}>
        <header className="dap-head">
          <div>
            <b>{d.name}</b>
            <small>{d.email || 'No email'} · {d.phone || 'No phone'} · Joined {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : 'unknown'}</small>
          </div>
          {pill(d.driverStatus)}
        </header>

        <div className="dap-section">
          <h4>Vehicle</h4>
          {v.plateNumber ? <p>{[v.year, v.make, v.model].filter(Boolean).join(' ')} · {v.color || 'colour n/a'} · {v.vehicleType || 'type n/a'} · <b>Plate {v.plateNumber}</b> · {v.seats || '?'} seats · {v.category || 'category n/a'}</p>
            : <p className="dap-warn"><TriangleAlert size={14} /> The driver has not saved vehicle details yet.</p>}
        </div>

        <div className="dap-section">
          <h4>Documents ({REQUIRED_DOCS.filter(k => docs.some(x => x.kind === k && x.status === 'approved')).length}/{REQUIRED_DOCS.length} approved)</h4>
          {REQUIRED_DOCS.map(kind => {
            const doc = docs.find(x => x.kind === kind);
            if (!doc) return <div className="dap-doc dap-doc-missing" key={kind}><div><b>{DOC_LABELS[kind]}</b><small>Not uploaded yet</small></div>{pill('missing')}</div>;
            return <div className="dap-doc" key={kind}>
              <div>
                <b>{DOC_LABELS[kind]}</b>
                <small>{doc.originalName ? `${doc.originalName} · ` : ''}{fmtBytes(doc.bytes)}{doc.bytes ? ' · ' : ''}Uploaded {fmtDate(doc.uploadedAt)}</small>
                {doc.reviewNote && doc.status !== 'pending' && <small>Note: {doc.reviewNote}</small>}
              </div>
              <div className="dap-doc-actions">
                {pill(doc.status)}
                <button className="outline small" onClick={() => openDoc(d, doc)}><Eye size={14} /> View</button>
                {doc.status !== 'approved' && <button className="primary small" disabled={busy === doc._id} onClick={() => reviewDoc(d, doc, 'approved')}>Approve</button>}
                {doc.status !== 'rejected' && <button className="sos-button small" disabled={busy === doc._id} onClick={() => reviewDoc(d, doc, 'rejected')}>Reject</button>}
              </div>
            </div>;
          })}
        </div>

        {d.driverReviewNote && <p className="dap-note">Last review note: {d.driverReviewNote}</p>}

        <footer className="dap-foot">
          {!ready && d.driverStatus !== 'approved' && <small className="dap-hint">To approve: {[d.unapprovedDocuments?.length ? `approve ${d.unapprovedDocuments.map(k => DOC_LABELS[k].toLowerCase()).join(', ')}` : '', !d.vehicleComplete ? 'driver must save vehicle details' : ''].filter(Boolean).join('; ')}.</small>}
          <div className="ride-actions">
            {d.driverStatus !== 'approved' && <button className="primary small" disabled={!ready || busy === d._id} title={ready ? '' : 'Approve every document and the vehicle details first'} onClick={() => reviewDriver(d, 'approved')}><CheckCircle2 size={14} /> Approve driver</button>}
            {d.driverStatus !== 'rejected' && <button className="outline small" disabled={busy === d._id} onClick={() => reviewDriver(d, 'rejected')}><XCircle size={14} /> Reject driver</button>}
            {d.driverStatus === 'approved' && <button className="outline small" disabled={busy === d._id} onClick={() => reviewDriver(d, 'pending')}>Move back to pending</button>}
          </div>
        </footer>
      </article>;
    })}

    {viewer && vDriver && vDoc && <div className="dap-modal" role="dialog" aria-modal="true" aria-label="Document viewer" onClick={e => e.target === e.currentTarget && closeViewer()}>
      <div className="dap-modal-card">
        <header>
          <div><b><FileText size={16} /> {DOC_LABELS[vDoc.kind]}</b><small>{vDriver.name} · {vDoc.originalName || 'uploaded file'} · uploaded {fmtDate(vDoc.uploadedAt)}</small></div>
          <button className="icon-button" onClick={closeViewer} aria-label="Close viewer"><X size={20} /></button>
        </header>
        <div className="dap-modal-body">
          {viewer.loading ? <p className="muted">Loading document securely…</p>
            : viewer.error ? <p className="dap-error">{viewer.error}</p>
            : viewer.mime === 'application/pdf' ? <iframe title="Driver document" src={viewer.url} />
            : <img alt={DOC_LABELS[vDoc.kind]} src={viewer.url} />}
        </div>
        <footer>
          {pill(vDoc.status)}
          <div className="ride-actions">
            {viewer.url && <button className="outline small" onClick={() => window.open(viewer.url, '_blank', 'noopener')}><ExternalLink size={14} /> Open in new tab</button>}
            {vDoc.status !== 'approved' && <button className="primary small" disabled={busy === vDoc._id} onClick={() => reviewDoc(vDriver, vDoc, 'approved')}>Approve</button>}
            {vDoc.status !== 'rejected' && <button className="sos-button small" disabled={busy === vDoc._id} onClick={() => reviewDoc(vDriver, vDoc, 'rejected')}>Reject</button>}
            <button className="outline small" onClick={closeViewer}>Close</button>
          </div>
        </footer>
      </div>
    </div>}
  </div>;
}
