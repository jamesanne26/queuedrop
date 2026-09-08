import crypto from "node:crypto";
export function validPayMongoSignature(raw:string,header:string|null,secret:string|undefined){
  if(!secret||!header)return false; const parts:Record<string,string>={};
  for(const segment of header.split(",")){const i=segment.indexOf("=");if(i>0)parts[segment.slice(0,i).trim()]=segment.slice(i+1).trim();}
  const timestamp=parts.t;const signature=parts.li||parts.te;if(!timestamp||!signature||!/^[a-f0-9]{64}$/i.test(signature))return false;
  const expected=crypto.createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest("hex");
  try{return crypto.timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex"));}catch{return false;}
}
