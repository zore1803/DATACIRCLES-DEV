/* eslint-disable */
// Fast local preview of every invoice/document template.
//
//   node backend/scripts/previewTemplates.js            # write files
//   node backend/scripts/previewTemplates.js --open      # write + open index
//
// Renders every template in shared/documentTemplates.js REGISTRY with a
// realistic sample tax invoice into backend/scripts/template-previews/.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SAMPLE_DOC = {
  invoiceNumber: 'INV-2051',
  date: '2026-09-09',
  dueDate: '2026-09-24',
  placeOfSupply: 'Maharashtra (27)',
  transactionType: 'intra',
  receiverGSTIN: '27MEHTA5678K1Z9',
  ewayBillNumber: 'EWB99887766',
  deal: { title: 'Mehta Distributors', company: { name: 'Mehta Distributors' }, contact: { name: 'Rahul Mehta' } },
  billingAddress: { addressLine1: '12 MG Road', addressLine2: 'Camp', city: 'Pune', state: 'Maharashtra', pincode: '411001', country: 'India' },
  shippingAddress: { addressLine1: 'Warehouse 4, Bhosari MIDC', city: 'Pune', state: 'Maharashtra', pincode: '411026', country: 'India' },
  items: [
    { name: 'Steel mounting bracket', description: 'Grade 304, powder-coated', hsn: '7308', rate: 450, quantity: 20, gstRate: 18, unit: 'PCS' },
    { name: 'Fastener kit (M8)', description: 'Bolt, nut, washer set', hsn: '7318', rate: 120, quantity: 50, gstRate: 18, unit: 'SET' },
    { name: 'Installation service', hsn: '9987', rate: 3500, quantity: 1, gstRate: 18, unit: 'JOB' },
  ],
  notes: 'Delivery within 7 working days of payment confirmation.',
  terms: 'Payment due within 15 days.\nGoods once sold will not be taken back.\nInterest at 18% p.a. on overdue amounts.',
  status: 'Partially Paid',
  payments: [{ amount: 8000 }],
};

const SAMPLE_ORG = {
  companyName: 'Acme Traders Pvt Ltd',
  gstin: '27ACMET1234F1Z5',
  address: '45 Industrial Estate, Bhosari, Pune, Maharashtra 411026',
  mobile: '+91 98200 11223',
  email: 'accounts@acmetraders.example',
  logoUrl: '',
};

const SAMPLE_BANK = {
  bank: 'HDFC Bank',
  accountHolder: 'Acme Traders Pvt Ltd',
  accountNumber: '50100123456789',
  ifscCode: 'HDFC0001234',
  branch: 'Bhosari, Pune',
  upi: 'acmetraders@okhdfcbank',
};

async function main() {
  const mod = await import('../../shared/documentTemplates.js');
  const { REGISTRY, DOCUMENT_TEMPLATES, buildDocumentHtml, buildUpiUri } = mod;

  const outDir = path.join(__dirname, 'template-previews');
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of DOCUMENT_TEMPLATES) {
    const frag = buildDocumentHtml(SAMPLE_DOC, {
      type: 'tax',
      template: name,
      orgDetails: SAMPLE_ORG,
      bankDetails: SAMPLE_BANK,
    });
    const page = `<!doctype html><meta charset="utf-8"><title>${name}</title>
<body style="margin:0;background:#e9edf1;padding:28px;font-family:Arial,sans-serif;">
  <div style="max-width:210mm;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.12);">${frag}</div>
</body>`;
    fs.writeFileSync(path.join(outDir, `${name}.html`), page);
  }

  const index = `<!doctype html><meta charset="utf-8"><title>Invoice templates</title>
<body style="font-family:Arial,sans-serif;margin:0;background:#e9edf1;">
<div style="max-width:1100px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;">Invoice templates (${DOCUMENT_TEMPLATES.length})</h1>
  <p style="color:#555;">Generated ${new Date().toLocaleString()}. Sample: partially-paid intra-state tax invoice, 3 line items.</p>
  ${DOCUMENT_TEMPLATES.map((n) => `
  <h2 style="font-size:15px;margin:36px 0 8px;">${n} &nbsp;<a href="${n}.html" target="_blank" style="font-size:12px;font-weight:normal;">open</a>
    <span style="color:#888;font-weight:normal;font-size:12px;">${(REGISTRY[n].blurb || '').replace(/</g, '&lt;')}</span></h2>
  <iframe src="${n}.html" style="width:100%;height:1120px;border:1px solid #cbd2d9;background:#fff;"></iframe>`).join('')}
</div></body>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), index);

  console.log(`Wrote ${DOCUMENT_TEMPLATES.length + 1} files to ${outDir}`);
  console.log(`Open: ${path.join(outDir, 'index.html')}`);

  if (process.argv.includes('--open')) {
    const p = path.join(outDir, 'index.html');
    const cmd = process.platform === 'win32' ? `start "" "${p}"` : process.platform === 'darwin' ? `open "${p}"` : `xdg-open "${p}"`;
    try { execSync(cmd, { shell: true }); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
