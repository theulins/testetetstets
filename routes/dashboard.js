import { Router } from 'express'; import { pool } from '../db.js'; import { authRequired } from '../middleware/auth.js';
const r=Router();
r.get('/metrics', authRequired, async (req,res)=>{
  try{
    const [[{ total }]] = await pool.query('SELECT COUNT(*) total FROM companies');
    const [recentCompanies] = await pool.query('SELECT id, fantasy_name, DATE(created_at) created_date FROM companies WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ORDER BY created_at DESC LIMIT 20');
    const [byCity] = await pool.query('SELECT city label, COUNT(*) value FROM companies GROUP BY city ORDER BY value DESC LIMIT 10');
    res.json({ total, recentCompanies, byCity });
  }catch(e){ res.status(500).json({ error:e.message }); }
});
export default r;
