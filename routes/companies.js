// backend/routes/companies.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderHtmlToPdf } from '../utils/renderHtmlPdf.js';

const r = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório de saída dos PDFs/assinaturas
const docsDir = path.join(__dirname, '../storage/docs');
await fs.promises.mkdir(docsDir, { recursive: true }).catch(() => {});

// Gera o caminho do PDF por empresa e versão
const pdfPath = (id, v) => path.join(docsDir, `company_${id}_v${v}.pdf`);

// Próxima versão do documento
async function nextVersion(id) {
  const [rows] = await pool.query(
    'SELECT COALESCE(MAX(version),0)+1 v FROM company_documents WHERE company_id=?',
    [id]
  );
  return rows[0].v || 1;
}

// === Gera PDF via HTML/CSS (Puppeteer + Mustache) ===
async function generatePdf(company, version, signaturePath) {
  const file = pdfPath(company.id, version);

  // parceiros
  const [partners] = await pool.query(
    'SELECT name, cpf FROM company_partners WHERE company_id=?',
    [company.id]
  );

  // assinatura (se existir) em base64 para embutir no HTML
  let signature = null;
  if (signaturePath && fs.existsSync(signaturePath)) {
    signature = await fs.promises.readFile(signaturePath, { encoding: 'base64' });
  }

  // dados para o template
  const data = {
    corporate_name: company.corporate_name || '',
    fantasy_name: company.fantasy_name || '',
    address: company.address || '',
    zip: company.zip || '',
    email: company.email || '',
    instagram: company.instagram || '',
    phone: company.phone || '',
    city: company.city || '',
    state: company.state || '',
    cel: company.cel || '',
    whatsapp: company.whatsapp || '',
    cnpj: company.cnpj || '',
    ie: company.ie || '',
    business_activity: company.business_activity || '',
    foundation_date: company.foundation_date || '',
    employees_qty: company.employees_qty || '',
    sector: company.sector || '',
    accounting_firm: company.accounting_firm || '',
    referral: company.referral || '',
    notes: company.notes || '',

    partners: partners || [],

    // checkboxes de serviços
    svc_spc: !!company.svc_spc,
    svc_nfe: !!company.svc_nfe,
    svc_nfce: !!company.svc_nfce,
    svc_mdfe: !!company.svc_mdfe,
    svc_cte: !!company.svc_cte,
    svc_cfe: !!company.svc_cfe,

    services_obs: company.services_obs || '',
    plan_type: company.plan_type || '',
    plan_value: company.plan_value || '',
    due_date: company.due_date || '',
    data_local: company.data_local || '',

    generated_at: new Date().toLocaleString('pt-BR'),
    version,
    signature
  };

  const templatePath = path.join(__dirname, '../templates/proposta.html');

  console.log('[PDF] Gerando...', { templatePath, out: file, companyId: company.id, version });

  await renderHtmlToPdf(templatePath, data, file);

  console.log('[PDF] OK:', file);
  return path.basename(file);
}

// === ROTAS ===

// Lista (para grid)
r.get('/', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id,fantasy_name,cnpj,city,state,updated_at FROM companies ORDER BY updated_at DESC'
  );
  res.json(rows);
});

// Detalhe
r.get('/:id', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM companies WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Empresa não encontrada' });

  const company = rows[0];
  const [p] = await pool.query(
    'SELECT id,name,cpf FROM company_partners WHERE company_id=?',
    [company.id]
  );
  company.partners = p;
  res.json(company);
});

// Criar + gerar PDF v1 (responde JSON por padrão)
r.post('/', authRequired, requireRole('editor', 'admin'), async (req, res) => {
  const c = req.body || {};
  const signature = c.signature_base64;
  delete c.signature_base64;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ins] = await conn.query(
      `INSERT INTO companies (
        fantasy_name,corporate_name,cnpj,ie,address,zip,city,state,phone,email,instagram,whatsapp,cel,
        business_activity,foundation_date,employees_qty,sector,accounting_firm,referral,notes,
        svc_spc,svc_nfe,svc_nfce,svc_mdfe,svc_cte,svc_cfe,services_obs,plan_type,plan_value,due_date,
        auth_site,auth_whatsapp,auth_email
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        c.fantasy_name || null, c.corporate_name || null, c.cnpj || null, c.ie || null, c.address || null,
        c.zip || null, c.city || null, c.state || null, c.phone || null, c.email || null,
        c.instagram || null, c.whatsapp || null, c.cel || null, c.business_activity || null,
        c.foundation_date || null, c.employees_qty || 0, c.sector || null, c.accounting_firm || null,
        c.referral || null, c.notes || null, !!c.svc_spc, !!c.svc_nfe, !!c.svc_nfce, !!c.svc_mdfe,
        !!c.svc_cte, !!c.svc_cfe, c.services_obs || null, c.plan_type || null, c.plan_value || null,
        c.due_date || null, !!c.auth_site, !!c.auth_whatsapp, !!c.auth_email
      ]
    );
    const companyId = ins.insertId;

    if (Array.isArray(c.partners)) {
      for (const p of c.partners) {
        if (!p.name && !p.cpf) continue;
        await conn.query(
          'INSERT INTO company_partners (company_id,name,cpf) VALUES (?,?,?)',
          [companyId, p.name || null, p.cpf || null]
        );
      }
    }

    await conn.query(
      'INSERT INTO audit_logs (entity,entity_id,action,user_id) VALUES ("company",?,"create",?)',
      [companyId, req.user.id]
    );
    await conn.commit();

    // Busca a empresa recém inserida
    const [[company]] = await pool.query('SELECT * FROM companies WHERE id=?', [companyId]);

    // salva assinatura se veio inline
    let signPath = null;
    if (signature && signature.startsWith('data:image')) {
      const b64 = signature.split(',')[1];
      const buf = Buffer.from(b64, 'base64');
      signPath = path.join(docsDir, `sign_${companyId}.png`);
      await fs.promises.writeFile(signPath, buf);
    }

    // Gera PDF v1 e registra (sem travar o cadastro se falhar)
    const version = 1;
    let pdfFile = null;
    try {
      pdfFile = await generatePdf(company, version, signPath);
      await pool.query(
        'INSERT INTO company_documents (company_id,version,pdf_path,created_by) VALUES (?,?,?,?)',
        [companyId, version, pdfFile, req.user.id]
      );
    } catch (err) {
      console.error('[POST /companies] Erro ao gerar PDF:', err.message);
    }

    // Se o cliente pedir PDF no Accept, devolve PDF; senão, devolve JSON
    const wantsPdf = (req.headers.accept || '').includes('application/pdf');
    if (wantsPdf && pdfFile) {
      const file = path.join(docsDir, pdfFile);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=${path.basename(file)}`);
      return fs.createReadStream(file).pipe(res);
    }

    return res.json({
      ok: true,
      id: companyId,
      pdf: pdfFile,
      version,
      message: pdfFile ? 'Empresa criada e PDF gerado.' : 'Empresa criada. (PDF não gerado nesta resposta)'
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// Atualizar + gerar nova versão do PDF
r.put('/:id', authRequired, requireRole('editor', 'admin'), async (req, res) => {
  const id = req.params.id;
  const c = req.body || {};
  const signature = c.signature_base64;
  delete c.signature_base64;

  const fields = [
    'fantasy_name','corporate_name','cnpj','ie','address','zip','city','state','phone','email',
    'instagram','whatsapp','cel','business_activity','foundation_date','employees_qty','sector',
    'accounting_firm','referral','notes','svc_spc','svc_nfe','svc_nfce','svc_mdfe','svc_cte',
    'svc_cfe','services_obs','plan_type','plan_value','due_date','auth_site','auth_whatsapp','auth_email'
  ];

  const sets = [], vals = [];
  for (const f of fields) {
    if (f in c) { sets.push(`${f}=?`); vals.push(c[f]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
  vals.push(id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`UPDATE companies SET ${sets.join(', ')}, updated_at=NOW() WHERE id=?`, vals);
    await conn.query(
      'INSERT INTO audit_logs (entity,entity_id,action,user_id) VALUES ("company",?,"update",?)',
      [id, req.user.id]
    );
    await conn.commit();

    const [[company]] = await pool.query('SELECT * FROM companies WHERE id=?', [id]);

    // assinatura
    let signPath = null;
    if (signature && signature.startsWith('data:image')) {
      const b64 = signature.split(',')[1];
      const buf = Buffer.from(b64, 'base64');
      signPath = path.join(docsDir, `sign_${id}.png`);
      await fs.promises.writeFile(signPath, buf);
    } else {
      const guess = path.join(docsDir, `sign_${id}.png`);
      if (fs.existsSync(guess)) signPath = guess;
    }

    const ver = await nextVersion(id);
    const pdfFile = await generatePdf(company, ver, signPath);
    await pool.query(
      'INSERT INTO company_documents (company_id,version,pdf_path,created_by) VALUES (?,?,?,?)',
      [id, ver, pdfFile, req.user.id]
    );

    res.json({ ok: true, version: ver });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// Listar versões de PDF
r.get('/:id/documents', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT version,pdf_path,created_at FROM company_documents WHERE company_id=? ORDER BY version DESC',
    [req.params.id]
  );
  res.json(rows);
});

// Baixar/abrir PDF (última ou versão específica)
r.get('/:id/pdf', authRequired, async (req, res) => {
  const id = req.params.id;
  const v = parseInt(req.query.version || '0', 10);

  let row;
  if (v > 0) {
    const [rw] = await pool.query(
      'SELECT pdf_path FROM company_documents WHERE company_id=? AND version=?',
      [id, v]
    );
    row = rw[0];
  } else {
    const [rw] = await pool.query(
      'SELECT pdf_path FROM company_documents WHERE company_id=? ORDER BY version DESC LIMIT 1',
      [id]
    );
    row = rw[0];
  }

  if (!row) return res.status(404).json({ error: 'PDF não encontrado' });

  const file = path.join(docsDir, row.pdf_path);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=${path.basename(file)}`);
  fs.createReadStream(file).pipe(res);
});

export default r;
