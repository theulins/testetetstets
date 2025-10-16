import { Router } from 'express'; import { pool } from '../db.js'; import { authRequired, requireRole } from '../middleware/auth.js'; import multer from 'multer'; import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url';
const __filename=fileURLToPath(import.meta.url); const __dirname=path.dirname(__filename);
const logosDir=path.join(__dirname,'../storage/logos'); await fs.promises.mkdir(logosDir,{recursive:true}).catch(()=>{});
const upload=multer({ dest: logosDir });
const r=Router();
r.get('/public', async (req,res)=>{ const kv=await load(); res.json({ brand_name:kv.brand_name||'TCCv5', primary_color:kv.primary_color||'#8ab4f8', brand_logo_url:kv.brand_logo_url?('/uploads/logos/'+kv.brand_logo_url):'/img/logo-placeholder.svg' }); });
r.get('/profile', authRequired, async (req,res)=>{ const [rows]=await pool.query('SELECT id,name,email,role,theme_preference FROM users WHERE id=?',[req.user.id]); res.json(rows[0]||{}); });
r.put('/profile', authRequired, async (req,res)=>{ const { name }=req.body||{}; await pool.query('UPDATE users SET name=? WHERE id=?',[name||null,req.user.id]); res.json({ ok:true }); });
r.put('/theme', authRequired, async (req,res)=>{ const { theme }=req.body||{}; await pool.query('UPDATE users SET theme_preference=? WHERE id=?',[theme||'system',req.user.id]); res.json({ ok:true }); });
r.post('/branding', authRequired, requireRole('admin'), upload.single('logo'), async (req,res)=>{
  const { brand_name, primary_color } = req.body || {};
  if(req.file){ const final=req.file.filename+(path.extname(req.file.originalname).toLowerCase()||''); await fs.promises.rename(req.file.path, path.join(logosDir, final)); await save('brand_logo_url', final); }
  if(brand_name) await save('brand_name', brand_name); if(primary_color) await save('primary_color', primary_color);
  res.json({ ok:true });
});
async function load(){ const [rows]=await pool.query('SELECT `key`,`value` FROM settings'); const kv={}; rows.forEach(r=> kv[r.key]=r.value); return kv; }
async function save(k,v){ await pool.query('INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',[k,v]); }
export default r;
