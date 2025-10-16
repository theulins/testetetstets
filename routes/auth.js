import { Router } from 'express'; import { pool } from '../db.js'; import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken';
const r=Router();
r.post('/login', async (req,res)=>{
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error:'Email e senha são obrigatórios' });
  try{
    const [rows]=await pool.query('SELECT id,name,email,password_hash,role,theme_preference FROM users WHERE email=?',[email]);
    if(!rows.length) return res.status(401).json({ error:'Credenciais inválidas' });
    const u=rows[0]; const ok=await bcrypt.compare(password, u.password_hash||''); if(!ok) return res.status(401).json({ error:'Credenciais inválidas' });
    const token=jwt.sign({id:u.id,email:u.email,role:u.role,name:u.name}, process.env.JWT_SECRET||'devsecret',{expiresIn:'8h'});
    res.json({ token, user:{ id:u.id,name:u.name,email:u.email,role:u.role,theme_preference:u.theme_preference } });
  }catch(e){ res.status(500).json({ error:e.message }); }
});
export default r;
