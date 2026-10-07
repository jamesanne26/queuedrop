import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAttachment,MAX_ATTACHMENT_BYTES} from '../../lib/support/attachments.ts';
test('support accepts QueueDrop text exports and screenshot signatures with canonical MIME',()=>{
 assert.equal(validateAttachment('report.csv',Buffer.from('Queue,Status\n1000,waiting')).type,'text/csv');
 assert.equal(validateAttachment('report.txt',Buffer.from('QueueDrop report ₱')).type,'text/plain');
 assert.equal(validateAttachment('screen.PNG',Buffer.from([137,80,78,71,13,10,26,10])).type,'image/png');
 assert.equal(validateAttachment('report.pdf',Buffer.from('%PDF-1.4\n')).type,'application/pdf');
});
test('support rejects binary spoofing, executable formats, unsafe names, empty and oversized files',()=>{
 for(const [name,data] of [['screen.png',Buffer.from('fake image')],['report.txt',Buffer.from([0,1,2])],['report.exe',Buffer.from('MZ')],['../report.txt',Buffer.from('data')],['report.txt',Buffer.alloc(0)],['report.txt',Buffer.alloc(MAX_ATTACHMENT_BYTES+1,65)]]) assert.throws(()=>validateAttachment(name,data));
 assert.throws(()=>validateAttachment('report.txt',Buffer.from([0xff,0xff])));
});
test('Office exports must have expected ZIP parts and cannot contain a macro project',()=>{
 const xlsx=Buffer.from('PK\x03\x04[Content_Types].xml xl/workbook.xml');
 assert.equal(validateAttachment('report.xlsx',xlsx).extension,'xlsx');
 assert.throws(()=>validateAttachment('report.docx',xlsx));
 assert.throws(()=>validateAttachment('report.xlsx',Buffer.concat([xlsx,Buffer.from('vbaProject.bin')])));
});
