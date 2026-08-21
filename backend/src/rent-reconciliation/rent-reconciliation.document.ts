import PDFDocument from "pdfkit";
import type {
  ContractPeriodReconciliation,
  RentReconciliationPayment,
  TenantReconciliationDetail,
} from "./rent-reconciliation.types";
import { RentReconciliationStatus } from "./rent-reconciliation.types";

const PAGE_MARGIN = 42;
const CONTENT_COLOR = "#1f2933";
const MUTED_COLOR = "#667085";
const BORDER_COLOR = "#d0d5dd";
const HEADER_BACKGROUND = "#eef2f5";

function formatMoney(value: number) {
  return `￥${Number(value).toFixed(2)}`;
}

function statusLabel(status: RentReconciliationStatus) {
  if (status === RentReconciliationStatus.OUTSTANDING) {
    return "欠款";
  }
  if (status === RentReconciliationStatus.CREDIT) {
    return "有结余";
  }
  return "已结清";
}

export async function renderRentReconciliationPdf(
  detail: TenantReconciliationDetail,
  fontPath: string,
  generatedDate: string,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: `房租对账单_${detail.tenantName}`,
        Author: "厂房租赁管理系统",
      },
    });
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;
    const pageBottom = () => doc.page.height - PAGE_MARGIN;
    let cursorY = PAGE_MARGIN;

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.font(fontPath);

    const drawContinuationHeader = () => {
      doc.fillColor(CONTENT_COLOR).fontSize(12).text(`房租对账单（续）  ${detail.tenantName}`, PAGE_MARGIN, cursorY);
      cursorY += 24;
      doc.moveTo(PAGE_MARGIN, cursorY).lineTo(PAGE_MARGIN + contentWidth, cursorY).strokeColor(BORDER_COLOR).stroke();
      cursorY += 14;
    };

    const addPage = () => {
      doc.addPage();
      doc.font(fontPath);
      cursorY = PAGE_MARGIN;
      drawContinuationHeader();
    };

    const ensureSpace = (height: number) => {
      if (cursorY + height <= pageBottom()) {
        return false;
      }
      addPage();
      return true;
    };

    const drawCellText = (
      text: string,
      x: number,
      y: number,
      width: number,
      options: { align?: "left" | "right" | "center"; color?: string; size?: number } = {},
    ) => {
      doc
        .fillColor(options.color ?? CONTENT_COLOR)
        .fontSize(options.size ?? 9)
        .text(text, x + 5, y + 7, {
          width: width - 10,
          align: options.align ?? "left",
          lineGap: 1,
        });
    };

    const drawPaymentHeader = () => {
      const widths = [76, 82, 68, 118, contentWidth - 344];
      const labels = ["付款日期", "金额", "方式", "收据", "备注"];
      let x = PAGE_MARGIN;
      doc.save().fillColor(HEADER_BACKGROUND).rect(PAGE_MARGIN, cursorY, contentWidth, 24).fill().restore();
      labels.forEach((label, index) => {
        drawCellText(label, x, cursorY, widths[index], { size: 8.5, color: MUTED_COLOR });
        x += widths[index];
      });
      cursorY += 24;
    };

    const drawPayment = (payment: RentReconciliationPayment) => {
      const widths = [76, 82, 68, 118, contentWidth - 344];
      const note = payment.note?.trim() || "--";
      doc.fontSize(8.5);
      const noteHeight = doc.heightOfString(note, { width: widths[4] - 10, lineGap: 1 });
      const rowHeight = Math.max(28, noteHeight + 14);
      if (ensureSpace(rowHeight)) {
        drawPaymentHeader();
      }

      const receiptText = payment.activeReceipt?.receiptNo ?? "未开收据";
      const values = [payment.paymentDate, formatMoney(payment.amount), payment.method, receiptText, note];
      let x = PAGE_MARGIN;
      values.forEach((value, index) => {
        drawCellText(value, x, cursorY, widths[index], {
          align: index === 1 ? "right" : "left",
          size: 8.5,
        });
        x += widths[index];
      });
      doc
        .moveTo(PAGE_MARGIN, cursorY + rowHeight)
        .lineTo(PAGE_MARGIN + contentWidth, cursorY + rowHeight)
        .strokeColor(BORDER_COLOR)
        .lineWidth(0.5)
        .stroke();
      cursorY += rowHeight;
    };

    const drawPeriod = (period: ContractPeriodReconciliation) => {
      ensureSpace(98);
      doc.save().fillColor(HEADER_BACKGROUND).rect(PAGE_MARGIN, cursorY, contentWidth, 54).fill().restore();
      doc
        .fillColor(CONTENT_COLOR)
        .fontSize(11)
        .text(`${period.unit.code} / ${period.unit.location}`, PAGE_MARGIN + 10, cursorY + 8, {
          width: contentWidth - 20,
        });
      doc
        .fillColor(MUTED_COLOR)
        .fontSize(8.5)
        .text(`${period.startDate} 至 ${period.endDate}`, PAGE_MARGIN + 10, cursorY + 29, {
          width: 165,
        });
      doc.text(
        `应收 ${formatMoney(period.receivableAmount)}  实收 ${formatMoney(period.paidAmount)}  结欠 ${formatMoney(period.outstandingAmount)}  结余 ${formatMoney(period.creditAmount)}  ${statusLabel(period.status)}`,
        PAGE_MARGIN + 175,
        cursorY + 29,
        { width: contentWidth - 185, align: "right" },
      );
      cursorY += 66;

      if (!period.payments.length) {
        doc.fillColor(MUTED_COLOR).fontSize(9).text("本期暂无实付记录", PAGE_MARGIN + 8, cursorY, {
          width: contentWidth - 16,
        });
        cursorY += 30;
        return;
      }

      drawPaymentHeader();
      period.payments.forEach((payment) => drawPayment(payment));
      cursorY += 18;
    };

    doc.fillColor(CONTENT_COLOR).fontSize(22).text("房租对账单", PAGE_MARGIN, cursorY, {
      width: contentWidth,
      align: "center",
    });
    cursorY += 40;
    doc.fontSize(11).text(`租户：${detail.tenantName}`, PAGE_MARGIN, cursorY, { width: contentWidth / 2 });
    doc
      .fillColor(MUTED_COLOR)
      .fontSize(9)
      .text(`生成日期：${generatedDate}`, PAGE_MARGIN + contentWidth / 2, cursorY + 2, {
        width: contentWidth / 2,
        align: "right",
      });
    cursorY += 28;

    const summaryGap = 6;
    const summaryWidth = (contentWidth - summaryGap * 3) / 4;
    const summaries = [
      ["累计应收", detail.receivableAmount],
      ["累计实收", detail.paidAmount],
      ["当前结欠", detail.outstandingAmount],
      ["当前结余", detail.creditAmount],
    ] as const;
    summaries.forEach(([label, amount], index) => {
      const x = PAGE_MARGIN + index * (summaryWidth + summaryGap);
      doc.save().fillColor(HEADER_BACKGROUND).rect(x, cursorY, summaryWidth, 54).fill().restore();
      doc.fillColor(MUTED_COLOR).fontSize(8.5).text(label, x + 8, cursorY + 8, { width: summaryWidth - 16 });
      doc.fillColor(CONTENT_COLOR).fontSize(13).text(formatMoney(amount), x + 8, cursorY + 27, {
        width: summaryWidth - 16,
      });
    });
    cursorY += 74;

    detail.periods.forEach((period) => drawPeriod(period));

    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc
        .font(fontPath)
        .fillColor(MUTED_COLOR)
        .fontSize(8)
        .text(`${pageIndex + 1} / ${pageRange.count}`, PAGE_MARGIN, doc.page.height - 28, {
          width: contentWidth,
          align: "center",
        });
    }

    doc.end();
  });
}
