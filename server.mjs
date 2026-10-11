import http from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createStorage } from './lib/storage.mjs';
import { clientHash } from './lib/client-identity.mjs';

try { process.loadEnvFile?.(); } catch {}

const PORT = Number(process.env.PORT || 3000);
const ROOT = resolve('public');
const SECRET = process.env.ADMIN_KEY || '';
const IS_VERCEL = process.env.VERCEL === '1';
const storage = createStorage({
  url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '',
  cloud: IS_VERCEL, dataDir: process.env.DATA_DIR || './data'
});
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.json':'application/json; charset=utf-8' };

function send(res, status, data, headers={}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers });
  res.end(body);
}
function authorized(req) {
  if (SECRET.length < 12) return false;
  const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a=Buffer.from(SECRET), b=Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a,b);
}
function sanitizeText(value, max=250) { return typeof value === 'string' ? value.trim().slice(0,max).replace(/[\u0000-\u001f\u007f]/g,' ') : ''; }
const allowedFields = [
  'level','subject','aiExperience',
  'timeConsumingTasks','lessonPlanTroubles','quizExpectations','visualNeeds','monthlyWorkload',
  'flexiblePricing','monthlyBudget',
  'primaryDevice','suggestion','contact',
  'aiNeeds','imageTroubles','imageRetries','imageTypes','imageValue','monthlyUses','payPerImage','paymentModel','features'
];
function cleanAnswers(obj) {
  const result={};
  for (const key of allowedFields) {
    const val=obj[key];
    result[key] = Array.isArray(val) ? val.slice(0,15).filter(x => typeof x === 'string').map(x=>sanitizeText(x,200)) : sanitizeText(val,key==='suggestion'?1600:250);
  }
  const hasPricing = Boolean(result.flexiblePricing || result.payPerImage);
  if (!result.level || !result.aiExperience || !hasPricing || !result.monthlyBudget) {
    throw new Error('Vui lòng hoàn tất các câu hỏi bắt buộc.');
  }
  return result;
}
async function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body='', size=0;
    req.on('data',chunk=>{ size += chunk.length; if(size>24_000) { reject(new Error('Dữ liệu quá lớn.')); req.destroy(); return; } body += chunk; });
    req.on('end',()=>{ try{ resolveBody(JSON.parse(body)); } catch{ reject(new Error('Dữ liệu không hợp lệ.')); } });
    req.on('error',reject);
  });
}
function csvEscape(v) { let s=Array.isArray(v)?v.join('; '):String(v??''); if (/^[\s]*[=+@-]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; }
function writeCsv(rows) { return '\ufeff'+['id','createdAt',...allowedFields].join(',')+'\r\n'+rows.map(r=>['id','createdAt',...allowedFields].map(k=>csvEscape(k==='createdAt'?r.createdAt:r.answers?.[k]??r[k])).join(',')).join('\r\n')+'\r\n'; }
function group(rows,field) { const out={}; for (const r of rows){ const value=r.answers?.[field]; const values=Array.isArray(value)?value:[value]; for (const v of values){if(v)out[v]=(out[v]||0)+1;} } return out; }
const server=http.createServer(async(req,res)=>{
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path==='/api/health') {
      const ready = !IS_VERCEL || (storage.configured && SECRET.length >= 12);
      return send(res,ready ? 200 : 503,{ok:ready,storage:storage.configured ? 'supabase' : (IS_VERCEL ? 'unconfigured' : 'local-file'),supabaseConfigured:storage.configured});
    }
    if (path==='/api/survey' && req.method==='POST') {
      if (!req.headers['content-type']?.includes('application/json')) return send(res,415,{error:'Content-Type phải là application/json.'});
      const input=await readBody(req);
      if (input.website) return send(res,200,{ok:true}); // honeypot
      if (input.consent !== true) return send(res,400,{error:'Cần đồng ý với mục đích thu thập phản hồi.'});
      const answers=cleanAnswers(input.answers||{});
      const entry={id:randomUUID(),createdAt:new Date().toISOString(),answers};
      await storage.saveRecord(entry, clientHash(req, { cloud: IS_VERCEL, secret: SECRET }));
      return send(res,201,{ok:true,id:entry.id.slice(0,8).toUpperCase()});
    }
    if (path.startsWith('/api/admin/')) {
      if(!authorized(req)) return send(res,401,{error:'Mật khẩu quản trị không hợp lệ hoặc chưa thiết lập ADMIN_KEY.'});
      const rows=await storage.getRecords();
      if(path==='/api/admin/overview'&&req.method==='GET') return send(res,200,{count:rows.length,latest:rows.slice(0,10).map(r=>({id:r.id.slice(0,8),date:r.createdAt,subject:r.answers.subject,level:r.answers.level})),groups:Object.fromEntries(['level','aiExperience','timeConsumingTasks','lessonPlanTroubles','quizExpectations','visualNeeds','monthlyWorkload','flexiblePricing','monthlyBudget','primaryDevice','payPerImage','features'].map(f=>[f,group(rows,f)]))});
      if(path==='/api/admin/export.csv'&&req.method==='GET'){ const csv=writeCsv(rows); res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ez-elearning-khao-sat.csv"','Cache-Control':'no-store'}); return res.end(csv); }
      if(path==='/api/admin/export.json'&&req.method==='GET') return send(res,200,rows,{'Content-Disposition':'attachment; filename="ez-elearning-khao-sat.json"'});
      return send(res,404,{error:'Không tìm thấy API.'});
    }
    if(req.method!=='GET'&&req.method!=='HEAD') return send(res,405,{error:'Phương thức không được hỗ trợ.'});
    let requested=path==='/'?'/index.html':path==='/admin'?'/admin.html':decodeURIComponent(path);
    const file=resolve(ROOT,'.'+requested);
    if(!file.startsWith(ROOT + sep) && file!==ROOT) return send(res,403,{error:'Forbidden'});
    const s=await stat(file).catch(()=>null);
    if(!s?.isFile()) return send(res,404,{error:'Không tìm thấy trang.'});
    res.writeHead(200, {'Content-Type':MIME[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store, must-revalidate'});
    if(req.method==='HEAD') return res.end();
    return createReadStream(file).pipe(res);
  } catch(err) { console.error('[Ez-Elearning]',err); if(err.status===429)res.setHeader('Retry-After','15'); if(!res.headersSent)send(res,err.status || 400,{error:err.message||'Có lỗi xảy ra.'}); else res.end(); }
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Ez-Elearning: http://localhost:${PORT} | Admin: http://localhost:${PORT}/admin`));
