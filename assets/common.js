// ฟังก์ชันที่ใช้ร่วมกันทั้ง 2 หน้า (โหลดหลัง config.js)  ·  อธิบายใน docs/website.md

// แปลงชื่อรูปเป็นที่อยู่ไฟล์: r.photos = รูปใหญ่, r.small = รูปเล็ก
const photoSrc=(r,name,small)=>r.folder?`images/${r.folder}/${small?'small/':''}${name}.jpg`:name;
CONFIG.rooms.forEach(r=>{r.names=r.photos.slice();r.small=r.names.map(p=>photoSrc(r,p,true));r.photos=r.names.map(p=>photoSrc(r,p))});

const ICONS={
  cup:'<path d="M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 3v2M12 3v2"/>',
  pin:'<path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  fire:'<path d="M12 21c4 0 7-2.7 7-6.6 0-3.4-2.3-5.6-3.6-7.4-.3 2-1.2 3.2-2.4 3.7C13.6 7.5 12.4 5 10 3c.3 3.6-5 6.5-5 11.4C5 18.3 8 21 12 21Z"/>',
  bed:'<path d="M3 18V7M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5"/><circle cx="7" cy="11" r="2"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  nav:'<path d="M3 11 21 3l-8 18-2-8-8-2Z"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  table:'<path d="M3 9h18M5 9v10M19 9v10M8 9V6h8v3"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12Z"/>',
  back:'<path d="M15 18l-6-6 6-6"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'
};
const icon=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||ICONS.info}</svg>`;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const baht=n=>'฿'+Number(n).toLocaleString('th-TH');
const $=id=>document.getElementById(id);
const roomById=id=>CONFIG.rooms.find(r=>r.id===id);

// ภาพตัวอย่างเมื่อยังไม่มีรูปจริง (ภูเขาโทนเดียวกับเว็บ)
function placeholder(label,seed){
  const hues=[[47,93,80],[61,107,92],[79,118,99],[96,111,82],[120,92,70]];const c=hues[(seed||0)%hues.length];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e6d3"/><stop offset="1" stop-color="#e3ece7"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/><circle cx="610" cy="150" r="56" fill="#f2c79a"/>
  <path d="M0 430 L140 290 L230 360 L360 220 L470 330 L560 260 L680 360 L800 300 V600 H0Z" fill="rgb(${c[0]+60},${c[1]+50},${c[2]+40})"/>
  <path d="M0 480 L120 400 L250 450 L380 360 L520 450 L650 390 L800 450 V600 H0Z" fill="rgb(${c})"/>
  <text x="400" y="545" font-family="sans-serif" font-size="34" fill="#fff" text-anchor="middle" opacity=".92">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function img(src,label,seed,cls,alt){return `<img ${cls?`class="${cls}"`:''} src="${esc(src)}" alt="${esc(alt||label)}" loading="lazy" data-ph="${esc(placeholder(label,seed))}" onerror="this.onerror=null;this.src=this.dataset.ph">`}

// ---------------- ลิงก์ระหว่างหน้า ----------------
// pageUrl('check',{room:'R3'})  →  check.html?room=R3
// pageUrl('rooms',null,'R3')    →  index.html#R3
function pageUrl(page,params,hash){
  let u=CONFIG.urls[page+'Page']||'';
  const q=Object.entries(params||{}).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  if(q)u+=(u.indexOf('?')<0?'?':'&')+q;
  if(hash)u+='#'+hash;
  return u;
}

// ---------------- วันที่ (ภายในใช้ yyyy-MM-dd · แสดงผล วว/ดด/ปปปป ค.ศ.) ----------------
const pad=n=>String(n).padStart(2,'0');
const isoOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dateOf=iso=>{const p=iso.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])};
const addDays=(iso,n)=>{const d=dateOf(iso);d.setDate(d.getDate()+n);return isoOf(d)};
const nightsBetween=(a,b)=>Math.round((dateOf(b)-dateOf(a))/864e5);
const fmtDate=iso=>{if(!iso)return '';const p=iso.split('-');return `${p[2]}/${p[1]}/${p[0]}`};
const todayIso=()=>isoOf(new Date());
const MONTHS_TH=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ---------------- LINE ----------------
// เติม {ตัวแปร} ในข้อความ
function fillText(tpl,data){return String(tpl||'').replace(/\{(\w+)\}/g,(m,k)=>data[k]!=null?data[k]:'')}
function lineText(kind,room,ci,co){
  return fillText(CONFIG.lineMessages[kind],{
    name:CONFIG.name,room:room?room.name:'',bed:room?room.bed:'',capacity:room?room.capacity:'',
    checkIn:fmtDate(ci),checkOut:fmtDate(co),nights:ci&&co?nightsBetween(ci,co):''});
}
// ลิงก์เปิดแชท LINE OA พร้อมข้อความที่พิมพ์ไว้ให้ (ลูกค้ากดส่งเอง)
function lineUrl(text){
  const id=(CONFIG.line&&CONFIG.line.id)||'';
  if(id)return 'https://line.me/R/oaMessage/'+id+'/?'+encodeURIComponent(text||'');
  return (CONFIG.line&&CONFIG.line.url)||'#';
}
// ถ้าไม่มี LINE ID: คัดลอกข้อความไว้ให้วางเอง
function openLine(text,ev){
  if(CONFIG.line&&CONFIG.line.id)return;
  if(ev)ev.preventDefault();
  const go=()=>{location.href=(CONFIG.line&&CONFIG.line.url)||'#'};
  try{navigator.clipboard.writeText(text).then(()=>{toast('คัดลอกข้อความแล้ว วางในแชท LINE ได้เลย');setTimeout(go,900)},go)}catch(e){go()}
}
// ปุ่ม/ลิงก์ที่มี data-line="general|room|booking" data-room data-in data-out จะเปิด LINE ให้อัตโนมัติ
function bindLine(root){
  (root||document).querySelectorAll('[data-line]').forEach(a=>{
    const t=lineText(a.dataset.line,roomById(a.dataset.room),a.dataset.in,a.dataset.out);
    a.href=lineUrl(t);a.onclick=e=>openLine(t,e);
  });
}

function toast(msg){
  let t=$('toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)}
  t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2600);
}
