import jwt from 'jsonwebtoken';
export function authRequired(req,res,next){
  let token=null; const auth=req.headers.authorization||'';
  if(auth.startsWith('Bearer ')) token=auth.slice(7);
  if(!token && req.query && req.query.token) token=req.query.token;
  if(!token) return res.status(401).json({ error:'Token ausente' });
  try{ req.user=jwt.verify(token, process.env.JWT_SECRET||'devsecret'); next(); }catch(e){ return res.status(401).json({ error:'Token inválido' }); }
}
export const requireRole=(...roles)=>(req,res,next)=> roles.includes(req.user?.role) ? next() : res.status(403).json({error:'Acesso negado'});
