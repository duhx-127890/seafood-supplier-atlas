(() => {
'use strict';
const D=window.ATLAS, $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byName=Object.fromEntries(D.suppliers.map(s=>[s.name,s]));
const regionOrder=['华北','东北','华东','华中','华南','西南','西北'];
const regionColors={'华北':'#426B87','东北':'#536A89','华东':'#347C83','华中':'#607C6C','华南':'#437D70','西南':'#646D8A','西北':'#667B7A'};
const state={region:'all',province:null,supplier:null,grade:'all',status:'all',query:'',issues:false};
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
let shown=[],scale=1,panX=0,panY=0,drag=null,moved=false,viewFrame=0,toastTimer=0;
const gradeOf=r=>r.supplier?byName[r.supplier].grade:'pending';
function filterRows(ignoreSupplier=false){return D.stores.filter(r=>(state.region==='all'||r.region===state.region)&&(!state.province||r.province===state.province)&&(!state.supplier||ignoreSupplier||r.plannedSupplier===state.supplier)&&(state.grade==='all'||gradeOf(r)===state.grade)&&(state.status==='all'||r.status===state.status)&&(!state.issues||r.flags.length>0)&&(!state.query||[r.name,r.city,r.province,r.region,r.plannedSupplier,r.originalSupplier].join(' ').toLowerCase().includes(state.query.toLowerCase())));}
function groupCities(rows){const out={};rows.forEach(r=>(out[r.city]??=[]).push(r));return out;}
const svgNode=(name,attrs={})=>{const e=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e;};
const project=([lon,lat])=>[(lon-73)*14+25,(Math.log(Math.tan(Math.PI/4+54*Math.PI/360))-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)))*180/Math.PI*14+25];
function initMap(){
 const grid=$('#map-grid');
 for(let lon=80;lon<=130;lon+=10){const [x]=project([lon,40]);grid.append(svgNode('path',{d:`M${x},10V700`,stroke:'#7395A7','stroke-width':.45,opacity:.24,'stroke-dasharray':'2 5'}));const t=svgNode('text',{x:x+4,y:708,fill:'#91B0C0','font-size':8,opacity:.7});t.textContent=lon+'°E';grid.append(t);}
 for(let lat=20;lat<=50;lat+=10){const [,y]=project([100,lat]);grid.append(svgNode('path',{d:`M15,${y}H950`,stroke:'#7395A7','stroke-width':.45,opacity:.24,'stroke-dasharray':'2 5'}));}
 D.map.forEach(p=>{if(!p.path)return;const path=svgNode('path',{d:p.path,class:'province','data-name':p.name,'data-region':p.region,role:'button',tabindex:'0','aria-label':p.fullName||'南海岛屿'});$('#provinces').append(path);path.addEventListener('click',()=>{if(moved)return;state.province=state.province===p.name?null:p.name;state.region=state.province?p.region:'all';render(true);});path.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();path.dispatchEvent(new MouseEvent('click'));}});if(p.center&&p.name&&!['香港','澳门','北京','天津','上海'].includes(p.name)){let [x,y]=p.center;const label=svgNode('text',{x,y,class:'province-label','data-name':p.name});label.textContent=p.name;$('#province-labels').append(label);}});
 const positions={'西北':[280,270],'西南':[330,500],'东北':[840,240],'华北':[670,260],'华东':[820,475],'华中':[570,455],'华南':[700,650]};
 Object.entries(positions).forEach(([name,[x,y]])=>{const label=svgNode('text',{x,y,class:'region-label','data-region':name});label.textContent=name;$('#region-labels').append(label);});
 $('#inset').append(svgNode('rect',{x:833,y:548,width:110,height:138,rx:5,fill:'#153B50',stroke:'#6D8D9B','stroke-width':.8}));
 const clip=svgNode('clipPath',{id:'south-clip'});clip.append(svgNode('rect',{x:837,y:552,width:102,height:112}));$('#china-map defs').append(clip);
 const g=svgNode('g',{'clip-path':'url(#south-clip)'});$('#inset').append(g);
 D.map.forEach(p=>{if(p.south)g.append(svgNode('path',{d:p.south,transform:'translate(650 315) scale(.36)',fill:'#7196A5',stroke:'#9BB9C5','stroke-width':1}));});
 const text=svgNode('text',{x:888,y:679,'text-anchor':'middle',fill:'#C1D8E1','font-size':10});text.textContent='南海诸岛';$('#inset').append(text);
}
const labelOffsets={北京:[-38,-30],成都:[-50,29],上海:[25,-13],厦门:[27,0],南宁:[-55,34],深圳:[35,48],海口:[-42,49],东莞:[38,-22]};
const labelPriority=['北京','成都','上海','厦门','南宁','深圳','东莞','海口','西安','沈阳','武汉','广州','大连','福州','南京','苏州','杭州'];
function renderMap(rows){
 const provinces=new Set(rows.map(r=>r.province)),focus=state.region!=='all'||state.supplier||state.grade!=='all'||state.query;
 $$('.province').forEach(e=>{const has=provinces.has(e.dataset.name),active=(state.region==='all'||e.dataset.region===state.region)&&(!state.province||e.dataset.name===state.province);e.setAttribute('fill',regionColors[e.dataset.region]||'#395C6C');e.setAttribute('fill-opacity',has?.92:.3);e.setAttribute('opacity',active?1:.35);e.classList.toggle('selected',state.province===e.dataset.name);});
 $$('.region-label').forEach(e=>e.setAttribute('opacity',focus?.2:1));
 $$('.province-label').forEach(e=>{e.classList.toggle('dim',!provinces.has(e.dataset.name));e.style.opacity=focus?(provinces.has(e.dataset.name)?.35:0):(provinces.has(e.dataset.name)?.85:.5);});
 $('#city-markers').replaceChildren();const cities=Object.entries(groupCities(rows));
 const labels=new Set(focus?cities.map(([n])=>n):labelPriority.slice(0,8));const boxes=[];
 const intersects=(a,b)=>a[0]<b[0]+b[2]+7&&a[0]+a[2]+7>b[0]&&a[1]<b[1]+b[3]+5&&a[1]+a[3]+5>b[1];
 const sorted=cities.sort((a,b)=>{const ix=n=>labelPriority.includes(n)?labelPriority.indexOf(n):100;return ix(a[0])-ix(b[0]);});
 sorted.forEach(([city,rs])=>{
   const [x,y]=project(D.cities[city]),unique=[...new Set(rs.map(r=>r.plannedSupplier))],grades=[...new Set(rs.map(gradeOf))],first=byName[rs[0].supplier],color=unique.length>1?'#467589':(first?.color||'#AD8B44');
   const g=svgNode('g',{class:'city-point',transform:`translate(${x} ${y})`,tabindex:'0',role:'button','aria-label':`${city}，${rs.length} 家门店，${unique.join('、')}`,'data-city':city,'data-suppliers':JSON.stringify(unique)});
   g.append(svgNode('circle',{r:13,class:'hit-target'}));g.append(svgNode('circle',{r:11,class:'point-halo'}));
   let marker;if(grades.length===1&&grades[0]==='A')marker=svgNode('rect',{x:-5,y:-5,width:10,height:10,rx:1,transform:'rotate(45)',fill:color,class:'pin'});else marker=svgNode('circle',{r:unique.length>1?7.5:6,fill:grades[0]==='pending'?'#365163':color,stroke:grades[0]==='pending'?'#D7BF87':'#DAEFF5','stroke-dasharray':grades[0]==='pending'?'2 2':'none',class:'pin'});g.append(marker);
   if(unique.length>1){const t=svgNode('text',{'text-anchor':'middle',y:2.8,fill:'white','font-size':9,'pointer-events':'none'});t.textContent=unique.length;g.append(t);}
   g.addEventListener('pointerenter',e=>showTooltip(e,city,rs));g.addEventListener('pointermove',positionTip);g.addEventListener('pointerleave',hideTip);g.addEventListener('focus',()=>{const b=g.getBoundingClientRect();showTooltip({clientX:b.x+b.width/2,clientY:b.y+b.height/2},city,rs);});g.addEventListener('blur',hideTip);
   g.addEventListener('click',()=>{if(!moved)showCity(city,rs);});g.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();showCity(city,rs);}});$('#city-markers').append(g);
 });
 sorted.forEach(([city,rs])=>{
   if(!labels.has(city))return;
   const [x,y]=project(D.cities[city]),names=state.supplier?'':[...new Set(rs.map(r=>r.plannedSupplier))].join(' / '),w=Math.max(city.length*13,names.length*11),h=names?33:18;
   const candidates=[labelOffsets[city]||[13,-16],[13,30],[-w-13,-16],[-w-13,30],[13,-44]];
   const pos=candidates.find(([ox,oy])=>{const b=[x+ox,y+oy-12,w,h];return b[0]>15&&b[0]+w<950&&b[1]>25&&b[1]+h<705&&!boxes.some(old=>intersects(b,old));});
   if(!pos)return;const [ox,oy]=pos;boxes.push([x+ox,y+oy-12,w,h]);
   const line=svgNode('path',{d:`M${x+3},${y+3} L${x+ox+(ox<0?w:0)},${y+oy-3}`,fill:'none',stroke:'#9CBECC','stroke-width':.65,opacity:.7,'pointer-events':'none'});$('#city-markers').append(line);
   const t=svgNode('text',{x:x+ox,y:y+oy,class:'city-label'});t.textContent=city;const sub=svgNode('tspan',{x:x+ox,dy:15,class:'city-label-sub'});sub.textContent=names;if(names)t.append(sub);$('#city-markers').append(t);
 });
 $('#map-empty').hidden=rows.length>0;
 const scope=state.supplier||state.province||(state.region==='all'?'全国规划分配':state.region+'规划分配');$('#map-context').innerHTML=`${esc(scope)}<small>${cities.length} 城市 · ${rows.length} 家门店</small>`;
}
function hideTip(){$('#map-tooltip').hidden=true;}
function positionTip(e){const r=$('.map-stage').getBoundingClientRect(),t=$('#map-tooltip');t.style.left=Math.max(8,Math.min(e.clientX-r.left+15,r.width-t.offsetWidth-8))+'px';t.style.top=Math.max(8,Math.min(e.clientY-r.top+15,r.height-t.offsetHeight-8))+'px';}
function showTooltip(e,city,rs){const t=$('#map-tooltip');t.innerHTML=`<strong>${esc(city)} · ${rs.length} 家门店</strong>${[...new Set(rs.map(r=>r.plannedSupplier))].map(n=>`${byName[n]?byName[n].grade+' 级 · ':''}${esc(n)}`).join('<br>')}<br><span class="tooltip-hint">点选查看门店与分配依据</span>`;t.hidden=false;positionTip(e);}
function highlightSupplier(name){$$('.city-point').forEach(e=>{const active=name&&JSON.parse(e.dataset.suppliers).includes(name);e.classList.toggle('is-highlighted',!!active);e.classList.toggle('is-dimmed',!!name&&!active);});}
function renderSuppliers(){
 const contextual=filterRows(true);$('#supplier-list').innerHTML=['S','A'].map(grade=>`<div class="supplier-group"><div class="group-label"><b class="${grade.toLowerCase()}">${grade}</b><span>${grade==='S'?'全国性供应商':'区域性供应商'}</span><span>${D.suppliers.filter(s=>s.grade===grade).length} 家</span></div>${D.suppliers.filter(s=>s.grade===grade).map(s=>{const count=contextual.filter(r=>r.supplier===s.name).length;return `<button class="supplier-card ${state.supplier===s.name?'selected':''} ${count===0?'muted':''}" data-supplier="${s.name}" aria-pressed="${state.supplier===s.name}"><i class="supplier-dot ${grade==='A'?'a-dot':''}" style="background:${s.color}"></i><span class="supplier-info"><strong>${s.name}</strong><small>全表 ${s.cities.length} 城 · ${s.regions.join(' / ')}</small></span><span class="supplier-count">${count}<small>门店</small></span></button>`;}).join('')}</div>`).join('');
 $$('.supplier-card').forEach(b=>{b.addEventListener('click',()=>{state.supplier=state.supplier===b.dataset.supplier?null:b.dataset.supplier;state.grade='all';render(true);});b.addEventListener('pointerenter',()=>highlightSupplier(b.dataset.supplier));b.addEventListener('pointerleave',()=>highlightSupplier(null));b.addEventListener('focus',()=>highlightSupplier(b.dataset.supplier));b.addEventListener('blur',()=>highlightSupplier(null));});
}
function badge(r){const g=gradeOf(r);return g==='pending'?'<span class="grade-inline pending">待开发</span>':`<span class="grade-inline ${g.toLowerCase()}">${g} 级</span>`;}
function renderTable(rows){
 $('#result-count').textContent=`${rows.length} 家门店`;$('#store-table').innerHTML=rows.map(r=>`<tr><td><strong>${esc(r.name)}${r.flags.length?'<i class="flag-dot" title="有待核实信息"></i>':''}</strong><small>${esc(r.province)} · ${esc(r.city)}${r.flags.length?' · 待核实':''}</small></td><td>${r.region}</td><td><span class="supplier-name"><i style="background:${byName[r.supplier]?.color||'#AD8B44'}"></i>${esc(r.plannedSupplier)}</span></td><td>${badge(r)}</td><td><span class="status-chip ${r.status==='已开业'?'opened':''}">${r.status}</span></td><td class="reason-cell" title="${esc(r.reason||'原表未填写')}">${esc(r.reason||'原表未填写')}</td><td><button class="row-open" data-row="${r.row}" aria-label="查看${esc(r.name)}详情">↗</button></td></tr>`).join('');
 $('#table-empty').hidden=rows.length>0;$('#table-footnote').textContent=`已开业 ${rows.filter(r=>r.status==='已开业').length} 家 · 待开业 ${rows.filter(r=>r.status==='待开业').length} 家 · 按逐店记录统计`;
 $$('.row-open').forEach(b=>b.addEventListener('click',()=>showStore(Number(b.dataset.row))));
}
function renderChips(){const chips=[];if(state.region!=='all')chips.push(['region',state.province||state.region]);if(state.supplier)chips.push(['supplier',state.supplier]);if(state.grade!=='all')chips.push(['grade',state.grade==='pending'?'待开发':state.grade+' 级']);if(state.status!=='all')chips.push(['status',state.status]);if(state.query)chips.push(['query','搜索：'+state.query]);if(state.issues)chips.push(['issues','待核实']);const el=$('#active-filters');el.hidden=chips.length===0;el.innerHTML=chips.map(([key,name])=>`<button class="filter-chip" data-clear="${key}" aria-label="移除${esc(name)}筛选">${esc(name)}<span aria-hidden="true">×</span></button>`).join('');$$('[data-clear]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.clear;state[k]=['region','grade','status'].includes(k)?'all':k==='issues'?false:k==='query'?'':null;if(k==='region')state.province=null;if(k==='query')$('#search').value='';if(k==='status')$('#status').value='all';render(true);}));$('#clear-focus').hidden=chips.length===0;}
function render(focus=false){
 const active=document.activeElement,restore=active?.classList.contains('supplier-card')?['supplier',active.dataset.supplier]:active?.parentElement?.id==='region-tabs'?['region',active.dataset.region]:null;
 shown=filterRows();const cities=new Set(shown.map(r=>r.city)),suppliers=new Set(shown.map(r=>r.supplier).filter(Boolean)),scope=state.province||(state.region==='all'?'全国概览':state.region);
 $('#region-tabs').innerHTML=['all',...regionOrder].map(r=>`<button data-region="${r}" class="${state.region===r?'active':''}" aria-pressed="${state.region===r}">${r==='all'?'全国':r}<small>${D.stores.filter(s=>r==='all'||s.region===r).length}</small></button>`).join('');
 $$('#region-tabs button').forEach(b=>b.addEventListener('click',()=>{state.region=b.dataset.region;state.province=null;render(true);}));
 $$('[data-grade]').forEach(b=>{b.classList.toggle('active',state.grade===b.dataset.grade);b.setAttribute('aria-pressed',state.grade===b.dataset.grade);});
 $('#map-heading').textContent=state.supplier?`${state.supplier} · ${byName[state.supplier]?.grade||'待开发'}${byName[state.supplier]?' 级':''}`:state.region==='all'?'7 大区 · 19 省级区域':`${scope} · 供应商分布`;
 $('#selection-summary').innerHTML=`<strong>${esc(scope)}${state.supplier?' / '+esc(state.supplier):''}</strong><span>${shown.length} 家门店<span class="stat-sep">/</span>${cities.size} 个城市<span class="stat-sep">/</span>${suppliers.size} 家供应商${shown.some(r=>!r.supplier)?' · 含待开发':''}</span>`;
 $('#issues-toggle').setAttribute('aria-pressed',state.issues);$('#issue-count').textContent=D.stores.filter(r=>r.flags.length).length;
 renderSuppliers();renderMap(shown);renderTable(shown);renderChips();hideTip();if(focus)focusRows();
 if(restore){const sel=restore[0]==='supplier'?'.supplier-card[data-supplier="'+CSS.escape(restore[1])+'"]':'#region-tabs button[data-region="'+restore[1]+'"]';$(sel)?.focus({preventScroll:true});}
}
function reset(){Object.assign(state,{region:'all',province:null,supplier:null,grade:'all',status:'all',query:'',issues:false});$('#search').value='';$('#status').value='all';resetZoom();render();}
function openDetails(html){hideTip();$('#detail-content').innerHTML=html;if(!$('#detail-dialog').open)$('#detail-dialog').showModal();}
function showStore(row){const r=D.stores.find(s=>s.row===row);openDetails(`<div class="eyebrow">STORE DETAIL · 原表第 ${r.row} 行</div><h2>${esc(r.name)}</h2><div class="detail-grid"><div><small>规划供应商</small><strong>${esc(r.plannedSupplier)} ${badge(r)}</strong></div><div><small>区域 / 城市</small><strong>${esc(r.region)} · ${esc(r.province)} · ${esc(r.city)}</strong></div><div><small>原供应商</small><strong>${esc(r.originalSupplier||'原表未列明')}</strong></div><div><small>门店状态</small><strong>${r.status}</strong></div></div>${r.flags.length?`<div class="detail-warning">待核实：${r.flags.map(esc).join('；')}</div>`:''}<h3>分配原因 · 原表内容</h3><p>${esc(r.reason||'原表未填写分配原因。')}</p><h3>门店地址 · 原文</h3><p>${esc(r.address)}</p><a class="primary-link" href="${D.source.url}" target="_blank" rel="noopener noreferrer">查看飞书来源 ↗</a>`);}
function showCity(city,rs){openDetails(`<div class="eyebrow">CITY OVERVIEW</div><h2>${city} <span class="detail-subcount">${rs.length} 家门店</span></h2><p>当前筛选范围内的规划分配</p>${rs.map(r=>`<button class="city-store-link" data-row="${r.row}"><span>${esc(r.name)}<small>${r.status}${r.flags.length?' · 待核实':''}</small></span><span>${esc(r.plannedSupplier)} ${badge(r)} ↗</span></button>`).join('')}<p>点位为城市示意位置，门店地址请进入详情核对。</p>`);$$('.city-store-link').forEach(b=>b.addEventListener('click',()=>showStore(Number(b.dataset.row))));}
function applyTransform(){$('#viewport').setAttribute('transform',`translate(${panX} ${panY}) scale(${scale})`);$('#zoom-out').disabled=scale<=1.001;$('#zoom-in').disabled=scale>=2.999;}
function setView(k,x,y,animate=true){cancelAnimationFrame(viewFrame);const start=[scale,panX,panY],end=[k,x,y];$('#viewport').dataset.targetScale=k;if(!animate||reduced.matches){[scale,panX,panY]=end;applyTransform();return;}const began=performance.now();const step=now=>{const t=Math.min(1,(now-began)/440),e=1-Math.pow(1-t,3);[scale,panX,panY]=end.map((v,i)=>start[i]+(v-start[i])*e);applyTransform();if(t<1)viewFrame=requestAnimationFrame(step);};viewFrame=requestAnimationFrame(step);}
function focusRows(){if(!shown.length||(!state.supplier&&state.region==='all'&&!state.province)){resetZoom();return;}const points=[...new Set(shown.map(r=>r.city))].map(c=>project(D.cities[c]));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);const k=Math.min(2.35,Math.max(1,Math.min(730/Math.max(hiX-loX+160,310),520/Math.max(hiY-loY+160,240))));setView(k,485-(loX+hiX)/2*k,355-(loY+hiY)/2*k);}
function zoom(mult){const k=Math.max(1,Math.min(3,scale*mult)),ratio=k/scale;setView(k,k===1?0:485-(485-panX)*ratio,k===1?0:360-(360-panY)*ratio);}
function resetZoom(){setView(1,0,0);}
$('#zoom-in').addEventListener('click',()=>zoom(1.3));$('#zoom-out').addEventListener('click',()=>zoom(1/1.3));$('#zoom-reset').addEventListener('click',resetZoom);
const map=$('#china-map');const localPoint=e=>{const p=map.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(map.getScreenCTM().inverse());};
map.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false)return;cancelAnimationFrame(viewFrame);moved=false;const p=localPoint(e);drag={id:e.pointerId,x:p.x,y:p.y,px:panX,py:panY,clientX:e.clientX,clientY:e.clientY};});
map.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=localPoint(e);if(Math.abs(e.clientX-drag.clientX)+Math.abs(e.clientY-drag.clientY)>6){moved=true;map.setPointerCapture(e.pointerId);panX=Math.max(-970*scale+120,Math.min(850,drag.px+p.x-drag.x));panY=Math.max(-720*scale+100,Math.min(620,drag.py+p.y-drag.y));applyTransform();hideTip();}});
const stopDrag=()=>{drag=null;setTimeout(()=>moved=false,30);};window.addEventListener('pointerup',stopDrag);map.addEventListener('pointercancel',stopDrag);
$('#search').addEventListener('input',e=>{state.query=e.target.value.trim();render();});$('#status').addEventListener('change',e=>{state.status=e.target.value;render();});$$('[data-grade]').forEach(b=>b.addEventListener('click',()=>{state.grade=b.dataset.grade;state.supplier=null;render(true);}));$('#pending-card').addEventListener('click',()=>{reset();state.grade='pending';state.region='华南';render(true);});$('#issues-toggle').addEventListener('click',()=>{state.issues=!state.issues;render();});['reset','empty-reset','clear-focus'].forEach(id=>$('#'+id).addEventListener('click',reset));['source-btn','source-icon'].forEach(id=>$('#'+id).addEventListener('click',()=>$('#source-dialog').showModal()));$$('.dialog-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
function toast(text){clearTimeout(toastTimer);const e=$('#toast');e.textContent=text;e.hidden=false;toastTimer=setTimeout(()=>e.hidden=true,3200);}
$('#export-btn').addEventListener('click',()=>{const csvCell=x=>{let s=String(x??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const fields=['原表行号','区域','省份（展示）','省份（原表）','城市','门店','规划供应商','等级','门店状态','原供应商','分配原因','地址','待核实'];const csv=[fields,...shown.map(r=>[r.row,r.region,r.province,r.sourceProvince,r.city,r.name,r.plannedSupplier,gradeOf(r)==='pending'?'待开发':gradeOf(r),r.status,r.originalSupplier||'',r.reason,r.address,r.flags.join('；')])].map(a=>a.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='供应商规划分配_当前筛选_20261017.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast(`已生成 ${shown.length} 条门店记录的 CSV`);});
window.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!$$('dialog[open]').length){e.preventDefault();$('#search').focus();}});
initMap();render();setView(1,0,0,false);
})();
