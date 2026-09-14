import {
  buildContractDocumentPdf,
  ContractDocumentPayload,
} from "./contract-document";

process.once("message", async (payload: ContractDocumentPayload) => {
  try {
    const buffer = await buildContractDocumentPdf(payload);
    process.send?.({ ok: true, pdf: buffer.toString("base64") }, () =>
      process.exit(0),
    );
  } catch {
    process.send?.({ ok: false }, () => process.exit(1));
  }
});
