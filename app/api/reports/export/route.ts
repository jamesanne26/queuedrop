import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseReportStatus } from "@/lib/reports/filters";

type Role = "owner" | "admin" | "manager" | "staff";
type Row = Record<string, string | number>;
type ReportMeta = {
  businessName: string;
  reportName: string;
  period: string;
  branch: string;
  service: string;
  status: string;
  generatedAt: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  avgWaitMinutes: number;
};

function safeDate(v: string | null, fallback: string) { return /^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : fallback; }
function csvCell(v: unknown) { const s=String(v ?? ""); return `"${s.replaceAll('"','""')}"`; }
function xml(v: unknown) { return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }
function pdfEscape(v: unknown) { return String(v ?? "").replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)").replace(/[^\x20-\x7E]/g,"-"); }
function slug(v:string){return v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48)||"queuedrop";}
function formatDateTime(v: unknown) { if (!v) return ""; const d=new Date(String(v)); if(Number.isNaN(d.getTime())) return String(v); return d.toLocaleString("en-PH",{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:true}); }
function reportLabel(report:string){return report==="summary"?"Queue Summary":report==="service"?"Service Performance":"Detailed Queue History";}
function prettyStatus(v:string){return v==="all"?"All statuses":v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
function dosDateTime() { const d=new Date(); const year=Math.max(1980,d.getFullYear()); const time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1); const date=((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(); return {time,date}; }
function crc32(buf: Buffer) { let crc=0xffffffff; for (const b of buf) { crc^=b; for(let k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); } return (crc^0xffffffff)>>>0; }
function zipStore(files: {name:string; data:Buffer|string}[]) {
  const local: Buffer[]=[]; const central: Buffer[]=[]; let offset=0; const {time,date}=dosDateTime();
  for (const f of files) { const name=Buffer.from(f.name); const data=Buffer.isBuffer(f.data)?f.data:Buffer.from(f.data); const crc=crc32(data);
    const lh=Buffer.alloc(30); lh.writeUInt32LE(0x04034b50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(0,6); lh.writeUInt16LE(0,8); lh.writeUInt16LE(time,10); lh.writeUInt16LE(date,12); lh.writeUInt32LE(crc,14); lh.writeUInt32LE(data.length,18); lh.writeUInt32LE(data.length,22); lh.writeUInt16LE(name.length,26); lh.writeUInt16LE(0,28); local.push(lh,name,data);
    const ch=Buffer.alloc(46); ch.writeUInt32LE(0x02014b50,0); ch.writeUInt16LE(20,4); ch.writeUInt16LE(20,6); ch.writeUInt16LE(0,8); ch.writeUInt16LE(0,10); ch.writeUInt16LE(time,12); ch.writeUInt16LE(date,14); ch.writeUInt32LE(crc,16); ch.writeUInt32LE(data.length,20); ch.writeUInt32LE(data.length,24); ch.writeUInt16LE(name.length,28); ch.writeUInt16LE(0,30); ch.writeUInt16LE(0,32); ch.writeUInt16LE(0,34); ch.writeUInt16LE(0,36); ch.writeUInt32LE(0,38); ch.writeUInt32LE(offset,42); central.push(ch,name); offset += lh.length+name.length+data.length; }
  const centralBuf=Buffer.concat(central); const end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(0,4); end.writeUInt16LE(0,6); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(centralBuf.length,12); end.writeUInt32LE(offset,16); end.writeUInt16LE(0,20); return Buffer.concat([...local,centralBuf,end]);
}

function makePdf(meta:ReportMeta, rows:Row[]) {
  const headers=Object.keys(rows[0] ?? {Message:"No records"});
  // A4 landscape. The history report uses a two-line ticket row so long timestamps
  // never spill outside the page and the document remains readable when printed.
  const pageW=842, pageH=595, margin=34, contentW=pageW-margin*2;
  const isHistory=headers.includes("Queue Number")&&headers.includes("Joined");
  const isMessage=headers.length===1&&headers[0]==="Message";
  const compactDate=(v:unknown)=>{
    if(!v)return "-";
    const d=new Date(String(v));
    if(Number.isNaN(d.getTime()))return String(v).slice(0,24);
    return d.toLocaleString("en-PH",{month:"short",day:"2-digit",hour:"numeric",minute:"2-digit",hour12:true});
  };
  const text=(cmds:string[],value:unknown,x:number,y:number,size=8,bold=false,color="0.15 0.17 0.22")=>{
    cmds.push(`BT /${bold?"F2":"F1"} ${size} Tf ${color} rg ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };
  const rect=(cmds:string[],x:number,y:number,w:number,h:number,color:string)=>cmds.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
  const line=(cmds:string[],x1:number,y1:number,x2:number,y2:number,color="0.87 0.89 0.92",width=0.5)=>cmds.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const statusColor=(status:string)=>{
    const s=status.toLowerCase();
    if(s.includes("complete"))return "0.09 0.55 0.36";
    if(s.includes("serving"))return "0.10 0.45 0.72";
    if(s.includes("waiting"))return "0.22 0.60 0.42";
    if(s.includes("called"))return "0.55 0.42 0.12";
    if(s.includes("cancel"))return "0.76 0.24 0.24";
    if(s.includes("no show"))return "0.52 0.30 0.65";
    return "0.38 0.42 0.48";
  };
  const drawPageHeader=(cmds:string[],pageIndex:number,totalPages:number)=>{
    // Brand strip
    rect(cmds,0,pageH-64,pageW,64,"0.035 0.24 0.18");
    text(cmds,meta.businessName.slice(0,72),margin,pageH-35,18,true,"1 1 1");
    text(cmds,"QueueDrop",pageW-margin-62,pageH-34,9,true,"0.82 0.94 0.89");
    text(cmds,meta.reportName,margin,pageH-88,15,true,"0.08 0.12 0.16");
    text(cmds,`Reporting period: ${meta.period}`,margin,pageH-104,8,false,"0.37 0.41 0.47");

    // Filter strip
    rect(cmds,margin,pageH-138,contentW,24,"0.96 0.98 0.97");
    text(cmds,`Branch: ${meta.branch.slice(0,30)}`,margin+10,pageH-130,7.2,true,"0.18 0.31 0.27");
    text(cmds,`Service: ${meta.service.slice(0,25)}`,margin+260,pageH-130,7.2,true,"0.18 0.31 0.27");
    text(cmds,`Status: ${meta.status.slice(0,20)}`,margin+500,pageH-130,7.2,true,"0.18 0.31 0.27");

    // Metric cards
    const cards=[
      ["TOTAL CUSTOMERS",String(meta.total)],
      ["COMPLETED",String(meta.completed)],
      ["CANCELLED",String(meta.cancelled)],
      ["NO SHOW",String(meta.noShow)],
      ["AVG WAIT",`${meta.avgWaitMinutes} min`],
    ];
    const gap=8, cardW=(contentW-gap*4)/5, cardY=pageH-196;
    cards.forEach(([label,value],i)=>{
      const x=margin+i*(cardW+gap);
      rect(cmds,x,cardY,cardW,43,"0.975 0.98 0.985");
      line(cmds,x,cardY,x,cardY+43,"0.10 0.55 0.39",2.2);
      text(cmds,label,x+10,cardY+28,6.5,true,"0.38 0.42 0.48");
      text(cmds,value,x+10,cardY+10,12,true,"0.08 0.14 0.17");
    });
    text(cmds,`Generated: ${meta.generatedAt}`,margin,18,6.8,false,"0.45 0.48 0.53");
    text(cmds,`Page ${pageIndex+1} of ${totalPages}`,pageW-margin-58,18,6.8,false,"0.45 0.48 0.53");
  };

  let rowsPerPage=18;
  if(isHistory)rowsPerPage=10;
  else if(headers.length<=2)rowsPerPage=20;
  else if(headers.length<=6)rowsPerPage=16;
  const chunks:Row[][]=[];
  for(let i=0;i<rows.length;i+=rowsPerPage)chunks.push(rows.slice(i,i+rowsPerPage));
  if(!chunks.length)chunks.push([]);

  const streams=chunks.map((chunk,pageIndex)=>{
    const cmds:string[]=[];
    drawPageHeader(cmds,pageIndex,chunks.length);
    const tableTop=pageH-218;

    if(isMessage){
      rect(cmds,margin,tableTop-64,contentW,64,"0.97 0.98 0.99");
      text(cmds,String(chunk[0]?.Message??"No records matched the selected filters."),margin+18,tableTop-36,10,false,"0.32 0.36 0.41");
      return cmds.join("\n");
    }

    if(isHistory){
      // Main identity columns. Timeline fields are placed on a dedicated second line.
      const cols=[
        {h:"Queue Number",label:"QUEUE",w:72},
        {h:"Customer",label:"CUSTOMER",w:150},
        {h:"Mobile",label:"MOBILE",w:100},
        {h:"Branch",label:"BRANCH",w:160},
        {h:"Service",label:"SERVICE",w:120},
        {h:"Status",label:"STATUS",w:contentW-72-150-100-160-120},
      ];
      rect(cmds,margin,tableTop-22,contentW,22,"0.035 0.24 0.18");
      let hx=margin;
      cols.forEach(c=>{text(cmds,c.label,hx+7,tableTop-14,6.7,true,"1 1 1");hx+=c.w;});
      let y=tableTop-22;
      chunk.forEach((r,ri)=>{
        const rowH=34;
        y-=rowH;
        if(ri%2===1)rect(cmds,margin,y,contentW,rowH,"0.985 0.988 0.99");
        let x=margin;
        cols.forEach(c=>{
          let v=String(r[c.h]??"");
          if(c.h==="Customer")v=v.slice(0,27);
          if(c.h==="Branch")v=v.slice(0,28);
          if(c.h==="Service")v=v.slice(0,20);
          if(c.h==="Status"){
            const sw=Math.min(c.w-12,Math.max(42,v.length*4.4+14));
            rect(cmds,x+6,y+18,sw,12,statusColor(v));
            text(cmds,v.toUpperCase().slice(0,14),x+11,y+21.5,5.8,true,"1 1 1");
          } else {
            text(cmds,v,x+7,y+21,7.2,c.h==="Queue Number","0.12 0.15 0.18");
          }
          x+=c.w;
        });
        // Clear timeline, compact and consistent. No raw ISO timestamps.
        const timeline=[
          ["JOINED",compactDate(r.Joined)],
          ["CALLED",compactDate(r.Called)],
          ["SERVING",compactDate(r.Serving)],
          ["COMPLETED",compactDate(r.Completed)],
          ["CANCELLED",compactDate(r.Cancelled)],
        ];
        const tw=contentW/timeline.length;
        timeline.forEach(([label,value],i)=>{
          const tx=margin+i*tw+7;
          text(cmds,`${label}:`,tx,y+7,5.3,true,"0.45 0.48 0.53");
          text(cmds,value,tx+34,y+7,5.8,false,"0.33 0.37 0.42");
        });
        line(cmds,margin,y,margin+contentW,y);
      });
    } else {
      // Summary and service reports: proportional table widths instead of equal columns.
      const weights=headers.map(h=>Math.max(8,Math.min(28,h.length+5)));
      const totalWeight=weights.reduce((a,b)=>a+b,0);
      const widths=weights.map(w=>contentW*w/totalWeight);
      rect(cmds,margin,tableTop-22,contentW,22,"0.035 0.24 0.18");
      let x=margin;
      headers.forEach((h,i)=>{text(cmds,h.toUpperCase().slice(0,26),x+8,tableTop-14,6.7,true,"1 1 1");x+=widths[i];});
      let y=tableTop-22;
      chunk.forEach((r,ri)=>{
        const rowH=24;y-=rowH;
        if(ri%2===1)rect(cmds,margin,y,contentW,rowH,"0.985 0.988 0.99");
        let cx=margin;
        headers.forEach((h,i)=>{text(cmds,String(r[h]??"").slice(0,38),cx+8,y+8,7,false,"0.14 0.17 0.20");cx+=widths[i];});
        line(cmds,margin,y,margin+contentW,y);
      });
    }
    return cmds.join("\n");
  });

  const pageCount=streams.length; const font1=3+pageCount*2, font2=font1+1;
  const objs:string[]=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Kids [${streams.map((_,i)=>`${3+i*2} 0 R`).join(" ")}] /Count ${pageCount} >>`];
  streams.forEach((stream,i)=>{const contentId=4+i*2;objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentId} 0 R >>`);objs.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);});
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  let out="%PDF-1.4\n"; const offsets=[0]; objs.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${o}\nendobj\n`;}); const xref=Buffer.byteLength(out); out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`; for(let i=1;i<offsets.length;i++)out+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`; out+=`trailer << /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(out);
}

function makeDocx(meta:ReportMeta, rows:Row[]) {
  const headers=Object.keys(rows[0] ?? {Message:"No records"});
  const cell=(value:unknown,header=false)=>`<w:tc><w:tcPr>${header?'<w:shd w:fill="153660"/>':''}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:r><w:rPr>${header?'<w:b/><w:color w:val="FFFFFF"/>':'<w:color w:val="252A34"/>'}<w:sz w:val="18"/></w:rPr><w:t>${xml(value)}</w:t></w:r></w:p></w:tc>`;
  const tr=(values:unknown[],header=false)=>`<w:tr>${values.map(v=>cell(v,header)).join("")}</w:tr>`;
  const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="153660"/><w:sz w:val="36"/></w:rPr><w:t>${xml(meta.businessName)}</w:t></w:r></w:p>
  <w:p><w:pPr><w:spacing w:after="180"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="252A34"/></w:rPr><w:t>${xml(meta.reportName)}</w:t></w:r></w:p>
  <w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9DEE8"/><w:left w:val="single" w:sz="4" w:color="D9DEE8"/><w:bottom w:val="single" w:sz="4" w:color="D9DEE8"/><w:right w:val="single" w:sz="4" w:color="D9DEE8"/><w:insideH w:val="single" w:sz="4" w:color="D9DEE8"/><w:insideV w:val="single" w:sz="4" w:color="D9DEE8"/></w:tblBorders></w:tblPr>
  ${tr(["Period",meta.period,"Branch",meta.branch])}${tr(["Service",meta.service,"Status",meta.status])}${tr(["Total stubs",meta.total,"Completed",meta.completed])}${tr(["Cancelled",meta.cancelled,"No show",meta.noShow])}${tr(["Average wait",`${meta.avgWaitMinutes} min`,"Generated",meta.generatedAt])}</w:tbl>
  <w:p><w:pPr><w:spacing w:before="260" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Report data</w:t></w:r></w:p>
  <w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9DEE8"/><w:left w:val="single" w:sz="4" w:color="D9DEE8"/><w:bottom w:val="single" w:sz="4" w:color="D9DEE8"/><w:right w:val="single" w:sz="4" w:color="D9DEE8"/><w:insideH w:val="single" w:sz="4" w:color="D9DEE8"/><w:insideV w:val="single" w:sz="4" w:color="D9DEE8"/></w:tblBorders></w:tblPr>${tr(headers,true)}${rows.map(r=>tr(headers.map(h=>r[h]))).join("")}</w:tbl>
  <w:p><w:pPr><w:spacing w:before="220"/></w:pPr><w:r><w:rPr><w:color w:val="737B8C"/><w:sz w:val="16"/></w:rPr><w:t>Generated by QueueDrop</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
  return zipStore([{name:"[Content_Types].xml",data:`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`},{name:"_rels/.rels",data:`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`},{name:"word/document.xml",data:document}]);
}

function colName(n:number){let s=""; for(let x=n+1;x;x=Math.floor((x-1)/26)) s=String.fromCharCode(65+(x-1)%26)+s; return s;}
function xlsxCell(ref:string,value:unknown,style=0){return `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${xml(value)}</t></is></c>`;}
function makeXlsx(meta:ReportMeta, rows:Row[]) {
  const headers=Object.keys(rows[0] ?? {Message:"No records"}); const count=Math.max(headers.length,6); const last=colName(count-1);
  const sheetRows:string[]=[];
  sheetRows.push(`<row r="1" ht="30">${xlsxCell("A1",meta.businessName,1)}</row>`);
  sheetRows.push(`<row r="2" ht="24">${xlsxCell("A2",meta.reportName,2)}</row>`);
  sheetRows.push(`<row r="3">${xlsxCell("A3",`Period: ${meta.period}`,3)}${xlsxCell("C3",`Branch: ${meta.branch}`,3)}${xlsxCell("E3",`Service: ${meta.service}`,3)}</row>`);
  sheetRows.push(`<row r="4">${xlsxCell("A4",`Status: ${meta.status}`,3)}${xlsxCell("C4",`Generated: ${meta.generatedAt}`,3)}${xlsxCell("E4",`Average wait: ${meta.avgWaitMinutes} min`,3)}</row>`);
  sheetRows.push(`<row r="5">${xlsxCell("A5",`Total: ${meta.total}`,4)}${xlsxCell("B5",`Completed: ${meta.completed}`,4)}${xlsxCell("C5",`Cancelled: ${meta.cancelled}`,4)}${xlsxCell("D5",`No show: ${meta.noShow}`,4)}</row>`);
  sheetRows.push(`<row r="7" ht="22">${headers.map((h,i)=>xlsxCell(`${colName(i)}7`,h,5)).join("")}</row>`);
  rows.forEach((r,ri)=>sheetRows.push(`<row r="${ri+8}">${headers.map((h,ci)=>xlsxCell(`${colName(ci)}${ri+8}`,r[h],ri%2?7:6)).join("")}</row>`));
  const widths=headers.map((h,i)=>{const max=Math.min(34,Math.max(12,String(h).length+2,...rows.slice(0,100).map(r=>String(r[h]??"").length+2)));return `<col min="${i+1}" max="${i+1}" width="${max}" customWidth="1"/>`;}).join("");
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheetRows.join("")}</sheetData><mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells><autoFilter ref="A7:${colName(headers.length-1)}${rows.length+7}"/></worksheet>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FF153660"/><name val="Aptos Display"/></font><font><b/><sz val="13"/><color rgb="FF252A34"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF153660"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD9DEE8"/></left><right style="thin"><color rgb="FFD9DEE8"/></right><top style="thin"><color rgb="FFD9DEE8"/></top><bottom style="thin"><color rgb="FFD9DEE8"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0"/><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zipStore([{name:"[Content_Types].xml",data:`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},{name:"_rels/.rels",data:`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},{name:"xl/workbook.xml",data:`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="QueueDrop Report" sheetId="1" r:id="rId1"/></sheets></workbook>`},{name:"xl/_rels/workbook.xml.rels",data:`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},{name:"xl/worksheets/sheet1.xml",data:sheet},{name:"xl/styles.xml",data:styles}]);
}

export async function GET(req: NextRequest) {
  const supabase=await createClient(); const {data:userData}=await supabase.auth.getUser(); if(!userData.user) return new Response("Unauthorized",{status:401});
  const {data:m}=await supabase.from("business_users").select("business_id,role,can_export_reports,businesses(name)").eq("user_id",userData.user.id).eq("is_active",true).limit(1).maybeSingle(); if(!m) return new Response("Forbidden",{status:403});
  const role=m.role as Role; const businessWide=role==="owner"||role==="admin"; if(!businessWide&&!m.can_export_reports) return new Response("Report export is not allowed for this account.",{status:403});
  const business=Array.isArray(m.businesses)?m.businesses[0]:m.businesses; const businessName=business?.name??"QueueDrop";
  let allowed:string[]|null=null; if(!businessWide){const {data}=await supabase.from("branch_users").select("branch_id").eq("user_id",userData.user.id); allowed=(data??[]).map(x=>x.branch_id);}
  let bq=supabase.from("branches").select("id,name").eq("business_id",m.business_id); if(allowed) bq=bq.in("id",allowed.length?allowed:["00000000-0000-0000-0000-000000000000"]); const {data:branchData}=await bq; const branches=branchData??[]; const ids=branches.map(b=>b.id);
  const {data:serviceData}=ids.length?await supabase.from("services").select("id,name,branch_id").in("branch_id",ids):{data:[]}; const services=serviceData??[];
  const p=req.nextUrl.searchParams; const now=new Date(); const from=safeDate(p.get("from"),new Date(now.getTime()-6*86400000).toISOString().slice(0,10)); const to=safeDate(p.get("to"),now.toISOString().slice(0,10)); const branch=ids.includes(p.get("branch")??"")?p.get("branch")!:"all"; const format=["txt","csv","pdf","docx","xlsx"].includes(p.get("format")??"")?p.get("format")!:"csv"; const report=["history","summary","service"].includes(p.get("report")??"")?p.get("report")!:"history"; const service=services.some(s=>s.id===p.get("service"))?p.get("service")!:"all"; const status=parseReportStatus(p.get("status"));
  let q=supabase.from("tickets").select("display_number,status,joined_at,called_at,serving_at,completed_at,cancelled_at,branch_id,service_id,sms_phone,branches(name),services(name)").in("branch_id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]).gte("joined_at",`${from}T00:00:00`).lte("joined_at",`${to}T23:59:59.999`).order("joined_at").limit(5000); if(branch!=="all")q=q.eq("branch_id",branch); if(service!=="all")q=q.eq("service_id",service); if(status!=="all")q=q.eq("status",status); const {data:ticketData,error}=await q; if(error)return new Response(error.message,{status:500}); const tickets=ticketData??[];
  const detail:Row[]=tickets.map(t=>{const b=Array.isArray(t.branches)?t.branches[0]:t.branches; const s=Array.isArray(t.services)?t.services[0]:t.services; return {"Queue Number":t.display_number,"SMS Alerts":t.sms_phone?"Enabled":"Stub only","Branch":b?.name||"","Service":s?.name||"","Status":prettyStatus(t.status),"Joined":formatDateTime(t.joined_at),"Called":formatDateTime(t.called_at),"Serving":formatDateTime(t.serving_at),"Completed":formatDateTime(t.completed_at),"Cancelled":formatDateTime(t.cancelled_at)};});
  let rows=detail;
  if(report==="summary"){const counts=new Map<string,number>();for(const t of tickets){const k=prettyStatus(String(t.status));counts.set(k,(counts.get(k)??0)+1);} rows=[...counts].map(([Status,Count])=>({Status,Count}));}
  if(report==="service"){const m2=new Map<string,{total:number;completed:number;cancelled:number;noShow:number}>();for(const t of tickets){const rel=Array.isArray(t.services)?t.services[0]:t.services;const k=rel?.name||"Unassigned";const x=m2.get(k)??{total:0,completed:0,cancelled:0,noShow:0};x.total++;if(t.status==="completed")x.completed++;if(t.status==="cancelled")x.cancelled++;if(t.status==="no_show")x.noShow++;m2.set(k,x);}rows=[...m2].map(([Service,x])=>({Service,"Total Tickets":x.total,Completed:x.completed,Cancelled:x.cancelled,"No Show":x.noShow,"Completion Rate":x.total?`${Math.round(x.completed/x.total*100)}%`:"0%"}));}
  if(!rows.length) rows=[{Message:"No records matched the selected filters."}];
  const completed=(tickets).filter(t=>t.status==="completed").length, cancelled=(tickets).filter(t=>t.status==="cancelled").length, noShow=(tickets).filter(t=>t.status==="no_show").length; const waits=(tickets).filter(t=>t.called_at).map(t=>Math.max(0,new Date(t.called_at).getTime()-new Date(t.joined_at).getTime())); const avgWaitMinutes=waits.length?Math.round(waits.reduce((a,b)=>a+b,0)/waits.length/60000):0;
  const selectedBranch=branch==="all"?"All branches":branches.find(b=>b.id===branch)?.name??"Selected branch"; const selectedService=service==="all"?"All services":services.find(s=>s.id===service)?.name??"Selected service";
  const meta:ReportMeta={businessName,reportName:reportLabel(report),period:`${from} to ${to}`,branch:selectedBranch,service:selectedService,status:prettyStatus(status),generatedAt:new Date().toLocaleString("en-PH",{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:true}),total:tickets.length,completed,cancelled,noShow,avgWaitMinutes};
  const headers=Object.keys(rows[0]); let body:Buffer; let type="text/plain; charset=utf-8";
  if(format==="csv"){body=Buffer.from("\uFEFF"+[headers.map(csvCell).join(","),...rows.map(r=>headers.map(h=>csvCell(r[h])).join(","))].join("\r\n"));type="text/csv; charset=utf-8";}
  else if(format==="txt"){const line="=".repeat(78);body=Buffer.from([line,businessName.toUpperCase(),meta.reportName,line,`Period      : ${meta.period}`,`Branch      : ${meta.branch}`,`Service     : ${meta.service}`,`Status      : ${meta.status}`,`Generated   : ${meta.generatedAt}`,"",`SUMMARY  Total ${meta.total} | Completed ${meta.completed} | Cancelled ${meta.cancelled} | No show ${meta.noShow} | Avg wait ${meta.avgWaitMinutes} min`,line,"",headers.join("\t"),...rows.map(r=>headers.map(h=>String(r[h]??"")).join("\t")),"",line,"Generated by QueueDrop"].join("\r\n"));}
  else if(format==="pdf"){body=makePdf(meta,rows);type="application/pdf";}
  else if(format==="docx"){body=makeDocx(meta,rows);type="application/vnd.openxmlformats-officedocument.wordprocessingml.document";}
  else {body=makeXlsx(meta,rows);type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";}
  return new Response(new Uint8Array(body),{headers:{"Content-Type":type,"Content-Disposition":`attachment; filename="${slug(businessName)}-${slug(meta.reportName)}-${from}-to-${to}.${format}"`,"Cache-Control":"no-store"}});
}

