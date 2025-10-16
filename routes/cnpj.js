import { Router } from 'express'; import fetch from 'node-fetch'; import { pool } from '../db.js'; import { authRequired } from '../middleware/auth.js';
const r=Router(); const onlyDigits=s=>(s||'').replace(/\D/g,'');
r.post('/lookup', authRequired, async (req,res)=>{
  const cnpj=onlyDigits(req.body?.cnpj||''); if(cnpj.length!==14) return res.status(400).json({ error:'CNPJ inválido' });
  try{ const [c]=await pool.query('SELECT payload_json FROM cnpj_cache WHERE cnpj=? AND fetched_at>=DATE_SUB(NOW(), INTERVAL 30 DAY)',[cnpj]); if(c.length) return res.json(JSON.parse(c[0].payload_json));
    const rr=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`); if(!rr.ok) return res.status(502).json({ error:'Falha ao consultar CNPJ' });
    const data=await rr.json(); await pool.query('REPLACE INTO cnpj_cache (cnpj,payload_json,fetched_at) VALUES (?,?,NOW())',[cnpj,JSON.stringify(data)]); res.json(data);
  }catch(e){ res.status(500).json({ error:e.message }); }
});
export default r;
