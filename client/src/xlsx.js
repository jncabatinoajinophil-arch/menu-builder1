import ExcelJS from 'exceljs/dist/exceljs.min.js';
export const TYPES=['Price Change','Add New Item','Full Menu Revamp','Item Removal/Activation'];
const HEAD=['CATEGORY NAME\n(max. of 60 characters)','PRODUCT NAME\n','PRODUCT DESCRIPTION\n','DISH PHOTO URL','SRP','MODIFIER','REQUIRED/OPTIONAL\n(MIN,MAX)','PRODUCT NAME','MODIFIER PRICE'];
const NOTE='======\nID#AAABpr9zJrc\nThis is to identify the type of request if    (2025-08-22 02:09:04)\n1. Price Change\n2. Add New Item\n3. Full Menu Revamp\n4. Item Removal/Activation\n\nRequest can be more than 1 type or reason.';
export const mk={cat:()=>({name:'',products:[mk.prod()]}),prod:()=>({name:'',desc:'',url:'',srp:'',mods:[]}),mod:()=>({name:'',req:'Optional',min:0,max:1,opts:[mk.opt()]}),opt:()=>({n:'',p:''})};

const fmtReq=m=>`${m.req} (${m.min},${m.max})`;
export function build(r){
  const rows=[],merges=[],pm=[];
  r.cats.forEach(c=>{
    const start=rows.length;
    c.products.forEach((p,pi)=>{
      const lines=[];
      p.mods.forEach(m=>{
        if(!m.opts.length)lines.push([m.name,fmtReq(m),'','']);
        m.opts.forEach((o,i)=>lines.push([i?'':m.name,i?'':fmtReq(m),o.n,o.p===''?0:+o.p]));
      });
      if(!lines.length)lines.push(['','','','']);
      const ps=rows.length;lines.forEach((l,j)=>rows.push([rows.length==start?c.name:'',j?'':p.name,j?'':p.desc,j?'':p.url,j||p.srp===''?'':+p.srp,...l]));if(lines.length>1)pm.push([ps,rows.length-1]);
    });
    if(rows.length-start>1)merges.push([start,rows.length-1]);
  });
  return{rows,merges,pm};
}


export function validate(r){
  const e=[];
  if(!r.types.length)e.push('Select at least one request type.');
  if(!r.cats.length)e.push('Add at least one category.');
  r.cats.forEach((c,i)=>{const cn=`Category ${i+1}`;
    if(!c.name.trim())e.push(`${cn}: name is required.`);
    if(!c.products.length)e.push(`${cn}: add at least one product.`);
    c.products.forEach((p,j)=>{const pn=`${cn} › Product ${j+1}`;
      if(!p.name.trim())e.push(`${pn}: product name is required.`);
      if(p.srp===''||isNaN(p.srp)||+p.srp<0)e.push(`${pn}: enter a valid SRP.`);
      p.mods.forEach((m,k)=>{const mn=`${pn} › Modifier ${k+1}`;
        if(!m.name.trim())e.push(`${mn}: modifier name is required.`);
        if(+m.max<+m.min||+m.max<1)e.push(`${mn}: max must be at least 1 and not less than min.`);
        m.opts.forEach((o,l)=>{
          if(!o.n.trim())e.push(`${mn} › Option ${l+1}: name is required.`);
          if(o.p!==''&&(isNaN(o.p)||+o.p<0))e.push(`${mn} › Option ${l+1}: enter a valid price.`);
        });
      });
    });
  });
  return e;
}

async function makeXlsx(r){
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet('Master Template',{views:[{state:'frozen',xSplit:2,ySplit:7}]});
  [25.7,45.5,74.3,38,12,24.5,54.5,30,21.5].forEach((w,i)=>ws.getColumn(i+1).width=w);
  const a1=ws.getCell('A1');a1.value=r.types.join(', ');a1.font={name:'Calibri',size:11,bold:true};a1.note=NOTE;
  ws.getRow(7).height=31;
  HEAD.forEach((h,i)=>{const c=ws.getCell(7,i+1);c.value=h;
    c.font={name:'Calibri',size:12,bold:true,color:{argb:'FFFFFFFF'}};
    c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFF2B85'}};
    c.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
  const{rows,merges,pm}=build(r);
  rows.forEach((r,i)=>r.forEach((v,j)=>{
    const c=ws.getCell(8+i,j+1);if(v!==''&&v!=null)c.value=v;
    c.font={name:'Calibri',size:11};
    c.alignment={vertical:'middle',horizontal:j==0||j==4?'center':'left',wrapText:j==2};
    if(j==4||j==8)c.numFmt='[$₱]#,##0.00';
  }));
  merges.forEach(([a,b])=>ws.mergeCells(8+a,1,8+b,1));
  pm.forEach(([a,b])=>[2,3,4,5].forEach(c=>ws.mergeCells(8+a,c,8+b,c)));
  return new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}


export async function downloadXlsx(r){
  const slug=(r.vendor.trim()||'Vendor').replace(/[^\w-]+/g,'_');
  const u=URL.createObjectURL(await makeXlsx(r)),a=document.createElement('a');
  a.href=u;a.download=`New_category_and_Items_for_${slug}_.xlsx`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),1e4);
}
