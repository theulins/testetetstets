import { Router } from 'express'; import { pool } from '../db.js'; import { authRequired, requireRole } from '../middleware/auth.js'; import bcrypt from 'bcryptjs';
const r=Router();
r.get('/', authRequired, requireRole('admin'), async (req,res)=>{ const [rows]=await pool.query('SELECT id,name,email,role FROM users ORDER BY name'); res.json(rows); });
r.post('/', authRequired, requireRole('admin'), async (req,res)=>{
  const { name, email, password, role } = req.body || {};
  if(!name || !email || !password || !role) return res.status(400).json({ error:'Campos obrigatórios: name, email, password, role' });
  try{ const hash=await bcrypt.hash(password,10); await pool.query('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)',[name,email,hash,role]); res.json({ ok:true }); }
  catch(e){ res.status(500).json({ error:e.message }); }
});
export default r;
