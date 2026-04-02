import { execFile } from "child_process";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { basename, dirname, extname, join } from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import { toChineseCurrencyUppercase } from "../common/format/chinese-currency";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DOCUMENT_XML_PATH = "word/document.xml";
const OFFICE_EXECUTABLE = "soffice";
const execFileAsync = promisify(execFile);
type XmlNode = any;
type XmlElement = any;
type XmlDocument = any;

export type ReceiptTemplatePayload = {
  receiptNo: string;
  issueDate: string;
  tenantName: string;
  amount: number;
  paymentMethod: string;
  reason: string;
  summary: string;
};

const RECEIPT_OPERATOR_NAME = "吴孝斌";

function elementChildren(node: XmlNode, localName?: string) {
  const children: XmlElement[] = [];
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index);
    if (!child || child.nodeType !== 1) {
      continue;
    }
    const element = child as XmlElement;
    if (!localName || element.localName === localName) {
      children.push(element);
    }
  }
  return children;
}

function firstElementChild(node: XmlNode, localName: string) {
  return elementChildren(node, localName)[0] ?? null;
}

function nodeText(node: XmlNode) {
  const segments: string[] = [];
  const collect = (current: XmlNode) => {
    if (current.nodeType === 3) {
      segments.push(current.nodeValue ?? "");
      return;
    }
    for (let index = 0; index < current.childNodes.length; index += 1) {
      const child = current.childNodes.item(index);
      if (child) {
        collect(child);
      }
    }
  };
  collect(node);
  return segments.join("").trim();
}

function ensureParagraph(document: XmlDocument, cellOrParagraph: XmlElement) {
  if (cellOrParagraph.localName === "p") {
    return cellOrParagraph;
  }

  const paragraph = elementChildren(cellOrParagraph, "p")[0];
  if (paragraph) {
    return paragraph;
  }

  const created = document.createElementNS(WORD_NS, "w:p");
  cellOrParagraph.appendChild(created);
  return created;
}

function ensureParagraphProps(document: XmlDocument, paragraph: XmlElement) {
  let paragraphProps = firstElementChild(paragraph, "pPr");
  if (!paragraphProps) {
    paragraphProps = document.createElementNS(WORD_NS, "w:pPr");
    if (paragraph.firstChild) {
      paragraph.insertBefore(paragraphProps, paragraph.firstChild);
    } else {
      paragraph.appendChild(paragraphProps);
    }
  }
  return paragraphProps;
}

function removeParagraphIndent(paragraph: XmlElement) {
  const paragraphProps = firstElementChild(paragraph, "pPr");
  if (!paragraphProps) {
    return;
  }
  for (const child of elementChildren(paragraphProps, "ind")) {
    paragraphProps.removeChild(child);
  }
}

function ensureRunProps(document: XmlDocument, run: XmlElement) {
  let runProps = firstElementChild(run, "rPr");
  if (!runProps) {
    runProps = document.createElementNS(WORD_NS, "w:rPr");
    if (run.firstChild) {
      run.insertBefore(runProps, run.firstChild);
    } else {
      run.appendChild(runProps);
    }
  }
  return runProps;
}

function setRunFontSize(document: XmlDocument, run: XmlElement, size: number) {
  const runProps = ensureRunProps(document, run);

  for (const name of ["sz", "szCs"]) {
    let node = firstElementChild(runProps, name);
    if (!node) {
      node = document.createElementNS(WORD_NS, `w:${name}`);
      runProps.appendChild(node);
    }
    node.setAttributeNS(WORD_NS, "w:val", String(size));
  }
}

function setParagraphText(
  document: XmlDocument,
  paragraphOrCell: XmlElement,
  value: string,
  options?: { fontSize?: number; removeIndent?: boolean },
) {
  const paragraph = ensureParagraph(document, paragraphOrCell);
  const firstRun = elementChildren(paragraph, "r")[0];
  const runProps = firstRun ? elementChildren(firstRun, "rPr")[0]?.cloneNode(true) : null;

  for (const run of elementChildren(paragraph, "r")) {
    paragraph.removeChild(run);
  }

  const run = document.createElementNS(WORD_NS, "w:r");
  if (runProps) {
    run.appendChild(runProps);
  }

  const textNode = document.createElementNS(WORD_NS, "w:t");
  if (/^\s|\s$/.test(value)) {
    textNode.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  }
  textNode.appendChild(document.createTextNode(value));
  run.appendChild(textNode);
  paragraph.appendChild(run);

  if (options?.removeIndent) {
    removeParagraphIndent(paragraph);
  }

  if (options?.fontSize) {
    setRunFontSize(document, run, options.fontSize);
    const paragraphProps = ensureParagraphProps(document, paragraph);
    for (const runProp of elementChildren(paragraphProps, "rPr")) {
      for (const name of ["sz", "szCs"]) {
        let node = firstElementChild(runProp, name);
        if (!node) {
          node = document.createElementNS(WORD_NS, `w:${name}`);
          runProp.appendChild(node);
        }
        node.setAttributeNS(WORD_NS, "w:val", String(options.fontSize));
      }
    }
  }
}

function tableCell(table: XmlElement, rowIndex: number, cellIndex: number) {
  const row = elementChildren(table, "tr")[rowIndex];
  if (!row) {
    throw new Error(`收据模板缺少第 ${rowIndex + 1} 行`);
  }

  const cell = elementChildren(row, "tc")[cellIndex];
  if (!cell) {
    throw new Error(`收据模板缺少第 ${rowIndex + 1} 行第 ${cellIndex + 1} 列`);
  }

  return cell;
}

function buildPaymentMethodText(value: string) {
  return value.trim() || "未填写";
}

function buildInlineDateText(value: string) {
  const [year = "", month = "", day = ""] = value.split("-");
  return `${year}年${Number(month || 0)}月${Number(day || 0)}日`;
}

function fillReceiptTemplate(document: XmlDocument, payload: ReceiptTemplatePayload) {
  const paragraphs = Array.from(document.getElementsByTagNameNS(WORD_NS, "p"));
  const noParagraph = paragraphs.find((paragraph) => nodeText(paragraph).startsWith("NO:"));
  if (noParagraph) {
    setParagraphText(document, noParagraph, `NO: ${payload.receiptNo}`);
  }

  const footerParagraph = paragraphs.find((paragraph) => nodeText(paragraph).startsWith("收款单位："));
  if (footerParagraph) {
    setParagraphText(document, footerParagraph, `收款单位：${RECEIPT_OPERATOR_NAME}`);
  }

  const table = document.getElementsByTagNameNS(WORD_NS, "tbl")[0];
  if (!table) {
    throw new Error("收据模板缺少内容表格");
  }

  setParagraphText(document, tableCell(table, 0, 1), buildInlineDateText(payload.issueDate), {
    fontSize: 18,
    removeIndent: true,
  });
  setParagraphText(document, tableCell(table, 0, 3), payload.summary.trim());
  setParagraphText(document, tableCell(table, 1, 1), payload.tenantName.trim());
  setParagraphText(document, tableCell(table, 2, 1), payload.reason.trim());
  setParagraphText(document, tableCell(table, 3, 1), buildPaymentMethodText(payload.paymentMethod));
  setParagraphText(document, tableCell(table, 4, 0), "金额（元）");
  setParagraphText(document, tableCell(table, 4, 1), payload.amount.toFixed(2));
  setParagraphText(document, tableCell(table, 4, 2), "人民币（大写）");
  setParagraphText(document, tableCell(table, 4, 3), toChineseCurrencyUppercase(payload.amount));
  setParagraphText(document, tableCell(table, 5, 0), "收款人");
  setParagraphText(document, tableCell(table, 5, 1), RECEIPT_OPERATOR_NAME);
}

export async function renderReceiptTemplateDocx(
  templatePath: string,
  targetPath: string,
  payload: ReceiptTemplatePayload,
) {
  const source = await readFile(templatePath);
  const zip = await JSZip.loadAsync(source);
  const documentEntry = zip.file(DOCUMENT_XML_PATH);

  if (!documentEntry) {
    throw new Error("收据模板缺少 document.xml");
  }

  const xml = await documentEntry.async("string");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  fillReceiptTemplate(document, payload);

  zip.file(DOCUMENT_XML_PATH, new XMLSerializer().serializeToString(document));
  const generated = await zip.generateAsync({ type: "nodebuffer" });

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, generated);
}

export async function convertDocxToPdf(sourcePath: string, targetPdfPath: string, profileRoot: string) {
  await access(sourcePath);
  await mkdir(dirname(targetPdfPath), { recursive: true });
  await mkdir(profileRoot, { recursive: true });

  const outDir = dirname(targetPdfPath);
  const profileUri = pathToFileURL(profileRoot).href;
  await execFileAsync(OFFICE_EXECUTABLE, [
    "--headless",
    "--nologo",
    "--nodefault",
    "--nolockcheck",
    "--norestore",
    `-env:UserInstallation=${profileUri}`,
    "--convert-to",
    "pdf",
    "--outdir",
    outDir,
    sourcePath,
  ]);

  const generatedPath = join(outDir, `${basename(sourcePath, extname(sourcePath))}.pdf`);
  await access(generatedPath);

  if (generatedPath !== targetPdfPath) {
    const buffer = await readFile(generatedPath);
    await writeFile(targetPdfPath, buffer);
  }
}
