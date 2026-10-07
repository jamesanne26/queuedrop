export const ATTACHMENT_BUCKET = "support-attachments";
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain",
  csv: "text/csv", pdf: "application/pdf", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function validateAttachment(name: string, bytes: Uint8Array) {
  if (!name || name.length > 160 || /[\\/\x00-\x1f\x7f]/.test(name)) throw new Error("Invalid attachment filename.");
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("Each attachment must be between 1 byte and 2 MB.");
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const type = ATTACHMENT_TYPES[extension];
  if (!type) throw new Error("Use PNG, JPG, TXT, CSV, PDF, XLS, XLSX or DOCX files.");
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  let valid = false;
  if (extension === "png") valid = starts([137,80,78,71,13,10,26,10]);
  else if (extension === "jpg" || extension === "jpeg") valid = starts([255,216,255]);
  else if (extension === "pdf") valid = starts([37,80,68,70,45]);
  else if (extension === "xls") valid = starts([208,207,17,224,161,177,26,225]);
  else if (extension === "xlsx" || extension === "docx") {
    const contents = Buffer.from(bytes);
    valid = starts([80,75,3,4]) && contents.includes(Buffer.from("[Content_Types].xml"))
      && contents.includes(Buffer.from(extension === "xlsx" ? "xl/workbook.xml" : "word/document.xml"))
      && !contents.includes(Buffer.from("vbaProject.bin"));
  } else {
    try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); valid = !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text); } catch { valid = false; }
  }
  if (!valid) throw new Error("The file contents do not match the selected file format.");
  return { name, type, extension, size: bytes.length };
}
