import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFPage, rgb } from "pdf-lib";
import { toChineseCurrencyUppercase } from "../common/format/chinese-currency";
import { Contract } from "./contract.entity";
import { BillingFrequency } from "./contract.enums";
import { FactoryUnit } from "../units/factory-unit.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";

export const GENERATED_CONTRACT_PREFIX = "厂房租赁合同_";
export const GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX = "contract-document--";

const TEMPLATE_FILE = "厂房租赁协议+安全协议模板.pdf";
const FONT_FILE = "Songti.ttc";
const SONGTI_SC_REGULAR_INDEX = 6;
const RASTER_SCALE = 4;
const RENDER_SCRIPT = "render_text_overlays.py";
const STANDARD_CONTRACT_PAGE_WIDTH = 595.3;
const STANDARD_CONTRACT_PAGE_HEIGHT = 841.9;
const SAFETY_AGREEMENT_TEMPLATE_START_PAGE = 3;
const STANDARD_CONTRACT_BODY_X = 58;
const STANDARD_CONTRACT_BODY_WIDTH = 480;
const SAFETY_AGREEMENT_CLOSING_TEMPLATE_PAGE = 9;
export const STANDARD_CONTRACT_SIGNATURE_TAB_STOP = 315;

type ContractDocumentPayload = {
  contract: Contract;
  unit: FactoryUnit & { meterConfigs: UtilityMeterConfig[] };
  generatedDate: string;
};

const REQUIRED_DOCUMENT_FIELDS: Array<{
  label: string;
  read: (contract: Contract) => string;
}> = [
  { label: "甲方名称", read: (contract) => contract.lessorName },
  { label: "乙方名称", read: (contract) => contract.tenantName },
  { label: "合同签订日期", read: (contract) => contract.signedDate },
  {
    label: "甲方安全管理负责人",
    read: (contract) => contract.lessorSafetyManager,
  },
  {
    label: "乙方安全管理负责人",
    read: (contract) => contract.tenantSafetyManager,
  },
];

export type StandardLeaseContractPage = {
  sections: string[];
};

type DateParts = {
  year: string;
  month: string;
  day: string;
};

export type TemplateOverlay = {
  id: string;
  pageIndex: number;
  text: string;
  x: number;
  top: number;
  clearWidth: number;
  clearHeight: number;
  fontSize?: number;
  maxWidth?: number;
  lineHeight?: number;
  maxLines?: number;
  fontIndex?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  align?: "left" | "center" | "right";
  tabStops?: number[];
};

type RasterizedOverlay = {
  id: string;
  width: number;
  height: number;
  png: Buffer;
};

function splitDateParts(value: string): DateParts {
  const [year = "", month = "", day = ""] = value.split("-");
  const normalizePart = (part: string) =>
    /^\d+$/.test(part) ? String(Number(part || 0) || "") : part;
  return {
    year,
    month: normalizePart(month),
    day: normalizePart(day),
  };
}

function formatDateForText(parts: DateParts) {
  if (![parts.year, parts.month, parts.day].every((part) => /^\d+$/.test(part))) {
    return "【填写日期】";
  }

  return `${parts.year}年${parts.month}月${parts.day}日`;
}

function formatArea(area: number | null) {
  if (area === null || area === undefined || Number.isNaN(area)) {
    return "";
  }

  return Number(area).toLocaleString("zh-CN", {
    minimumFractionDigits: Number.isInteger(area) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "【填写】";
  }

  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

function buildRentPaymentClause(contract: Contract) {
  return contract.billingFrequency === BillingFrequency.SEMIANNUAL
    ? "租金按半年支付，先付后用；每期租金应于该期开始日支付。"
    : "租金按年支付，先付后用；每期租金应于该租赁年度开始日支付。";
}

function buildDepositClause(contract: Contract) {
  return `乙方应向甲方支付履约保证金人民币${formatMoney(contract.depositAmount)}元。`;
}

function buildUtilityClause(meters: UtilityMeterConfig[]) {
  const enabled = meters.filter((item) => item.enabled);
  const electricMeters = enabled.filter((item) => item.type === "electric");
  const waterMeters = enabled.filter((item) => item.type === "water");

  const electricPrice = electricMeters[0]?.unitPrice;
  const electricLoss = electricMeters[0]?.lineLossPercent;
  const waterPrice = waterMeters[0]?.unitPrice;

  const electricText =
    electricMeters.length === 0
      ? "电费按甲方现场表计配置执行"
      : electricMeters.every(
            (item) =>
              item.unitPrice === electricPrice &&
              item.lineLossPercent === electricLoss,
          )
        ? `电费${formatMoney(electricPrice || 0)}元/度，线损耗按${formatMoney(electricLoss || 0)}%计算`
        : "电费按各启用电表配置执行";

  const waterText =
    waterMeters.length === 0
      ? "水费按甲方现场表计配置执行"
      : waterMeters.every((item) => item.unitPrice === waterPrice)
        ? `水费${formatMoney(waterPrice || 0)}元/吨`
        : "水费按各启用水表配置执行";

  return `1、租赁期间，使用该厂房所发生的水、电等费用由乙方承担，${electricText}，${waterText}；`;
}

function buildSafetyAgreementIntroduction(signedDateParts: DateParts) {
  return [
    "\u3000\u3000依据《中华人民共和国安全生产法》《江苏省安全生产条例》《无锡市安全生产条例》等规定，甲方已核查乙方经营主体证照及生产经营类型，确认乙方拟开展的生产经营项目不属于澄安办〔2025〕12号文所列《江阴市“厂中厂”准入负面清单（修订）》规定的禁止或限制准入情形，并已通过“厂中厂出租方安全管理平台”履行属地告知手续，经审核通过后允许乙方入驻。",
    `\u3000\u3000为明确双方安全生产管理职责，经友好协商，甲乙双方就已于${formatDateForText(signedDateParts)}签订的《厂房租赁合同》所涉安全管理事项订立本协议。本协议为该租赁合同的附件，与该租赁合同具有同等法律效力。`,
  ].join("\n");
}

function buildUnitLabel(unit: FactoryUnit) {
  const segments = [unit.location];
  if (unit.code) {
    segments.push(`编号${unit.code}`);
  }
  if (
    unit.area !== null &&
    unit.area !== undefined &&
    !Number.isNaN(unit.area)
  ) {
    segments.push(`面积${formatArea(unit.area)}平方米`);
  }
  return segments.join("，");
}

function buildUnitFullAddress(unit: FactoryUnit) {
  return `江阴市澄江街道澄山路265号，${buildUnitLabel(unit)}`;
}

function normalizeOptionalText(
  value: string | null | undefined,
  fallback = "未填写",
) {
  return value?.trim() || fallback;
}

function stripClauseNumber(value: string) {
  return value.replace(/^\d+、/, "");
}

function buildStandardLeaseSignatureText(
  signedDateParts: DateParts,
  lessorName: string,
  tenantName: string,
) {
  const signDate = formatDateForText(signedDateParts);
  return [
    `甲方（出租方）：${lessorName}\t乙方（承租方）：${tenantName}`,
    "",
    "签字/盖章：\t签字/盖章：",
    "",
    `日期：${signDate}\t日期：${signDate}`,
  ].join("\n");
}

export function assertContractDocumentFieldsComplete({
  contract,
}: ContractDocumentPayload) {
  const missing = REQUIRED_DOCUMENT_FIELDS.filter(
    ({ read }) => !read(contract)?.trim(),
  ).map(({ label }) => label);

  if (missing.length > 0) {
    throw new Error(`合同信息不完整，请补充：${missing.join("、")}`);
  }
}

export function buildSafetyAgreementSupplementSections() {
  return [
    "2.21 乙方应积极配合甲方及甲方委托的第三方安全生产管理、消防管理等专业服务机构开展厂区安全生产、消防、环保、职业健康等管理工作，包括安全检查、日常巡查、隐患排查、资料收集、台账建立、人员信息登记、安全教育培训、应急演练、风险辨识、危险作业管理及政府主管部门检查。乙方应在规定期限内完成整改并反馈结果，不得拒绝、阻碍、拖延上述工作，不得隐瞒真实情况或提供虚假资料。",
    "2.22 乙方对甲方、甲方委托的第三方专业服务机构或有关主管部门提出的安全生产、消防、环保等隐患整改要求，应在规定期限内完成整改。存在重大事故隐患、严重消防安全隐患，或者乙方拒不整改、逾期整改、整改后仍不符合要求的，甲方有权要求乙方立即停止相关设备、区域、危险作业或生产经营活动；情节严重或经催告仍拒不整改的，甲方有权单方面解除租赁合同。由此造成乙方停工、停产、搬迁及其他损失的，由乙方自行承担。",
    "2.23 因乙方及其员工、承包商、供应商、客户或其他与乙方有关人员违反安全生产、消防、环保、职业健康、特种设备、危险化学品等法律法规、规章制度、本合同或本协议，导致乙方或甲方受到行政处罚、罚款、责令整改、停产停业、行政强制措施，或者导致甲方承担赔偿责任及其他经济损失的，相关责任及费用由乙方承担。只要违法违规事项发生于乙方承租区域内，或者与乙方生产经营活动、人员行为、设备设施、物料存放、危险作业、安全管理、消防管理、环保管理、隐患整改等有关，甲方均有权全额追偿。即使行政主管部门基于出租方、厂中厂出租方或甲方安全管理责任直接对甲方作出处罚或要求甲方承担其他责任，乙方仍应向甲方承担全部补偿、赔偿及追偿责任，不得以行政文书所列责任主体为甲方或甲方依法承担出租方安全管理职责为由拒绝。乙方应在收到甲方通知后五日内支付；甲方有权从保证金、应付款项或其他应付乙方款项中直接抵扣，不足部分继续追偿。",
  ];
}

export function buildStandardLeaseContractPages({
  contract,
  unit,
}: ContractDocumentPayload): StandardLeaseContractPage[] {
  const startParts = splitDateParts(contract.startDate);
  const endParts = splitDateParts(contract.endDate);
  const signedDateParts = splitDateParts(contract.signedDate);
  const annualRentUppercase = Number.isFinite(Number(contract.annualRent))
    ? toChineseCurrencyUppercase(contract.annualRent)
    : "【填写】";
  const annualRentText = formatMoney(contract.annualRent);
  const utilityText = stripClauseNumber(buildUtilityClause(unit.meterConfigs));
  const unitAddress = buildUnitFullAddress(unit);
  const lessorName = normalizeOptionalText(contract.lessorName);
  const lessorContact = normalizeOptionalText(
    contract.lessorContactName || contract.lessorName,
  );
  const lessorPhone = normalizeOptionalText(contract.lessorPhone);
  const lessorLicenseCode = normalizeOptionalText(contract.lessorLicenseCode);
  const tenantName = normalizeOptionalText(contract.tenantName);
  const tenantContact = normalizeOptionalText(
    contract.contactName || contract.tenantName,
  );
  const tenantPhone = normalizeOptionalText(contract.tenantPhone);
  const licenseCode = normalizeOptionalText(contract.licenseCode);

  return [
    {
      sections: [
        `出租方（甲方）：${lessorName}    营业执照代码：${lessorLicenseCode}`,
        `甲方联系人：${lessorContact}    联系电话：${lessorPhone}`,
        `承租方（乙方）：${tenantName}    营业执照代码：${licenseCode}`,
        `乙方联系人：${tenantContact}    联系电话：${tenantPhone}`,
        "根据《中华人民共和国民法典》及有关法律法规，甲、乙双方在平等、自愿、诚实信用的基础上，就甲方将合法拥有或有权出租的厂房出租给乙方使用事宜，订立本合同。本合同正文与附件《入驻厂区企业安全生产管理协议书》共同构成双方完整约定。",
        "一、租赁标的及交付",
        `1. 甲方出租给乙方的厂房位于${unitAddress}。租赁范围以现场交付、双方确认的边界及附属设施为准。`,
        "2. 甲方应在乙方按约支付首期租金、押金并完成入驻资料提交后，将厂房按现状交付乙方使用。乙方接收厂房即视为认可交付状态；发现影响安全或正常使用的问题，应在接收后三日内书面提出。",
        "3. 乙方知悉厂房及园区为工业生产经营场所，应自行核实其拟经营项目、工艺、消防、环保、用电负荷、设备安装及行政许可要求是否适合入驻。",
        "二、租赁期限",
        `1. 租赁期限自${formatDateForText(startParts)}起至${formatDateForText(endParts)}止。`,
        "2. 租赁期满，甲方有权收回厂房。乙方需续租的，应至少提前三个月向甲方提出书面申请；经甲方同意后，双方另行签订租赁合同或补充协议。",
      ],
    },
    {
      sections: [
        "三、租金支付、押金及逾期违约",
        `1. 双方约定年租金为人民币${annualRentText}元，大写：${annualRentUppercase}。${buildRentPaymentClause(contract)}`,
        `2. ${buildDepositClause(contract)}押金不计利息。`,
        "3. 乙方逾期支付租金、水电费及其他按本合同应由乙方承担的费用，每逾期一日，应按逾期未付金额的万分之五向甲方支付违约金。逾期超过七日，甲方有权书面催告乙方在催告送达后七日内付清；催告期限届满仍未付清的，甲方有权单方解除本合同，要求乙方限期腾退厂房，并追偿欠付款项、违约金及相关损失。",
        "4. 甲方有权从保证金或其他应付乙方的款项中直接抵扣乙方拖欠的租金、水电费、违约金、修复费、清场费及其他应付款项，不足部分甲方有权继续追偿。抵扣后，乙方应按甲方通知及时补足保证金。",
        "5. 押金用于担保乙方履行付款、使用、维修、恢复原状、交还厂房、安全环保等义务。合同期满且乙方结清全部费用、迁出并完成交还后，甲方在扣除应由乙方承担的费用和损失后无息退还剩余押金。",
        "四、水电、公摊、税费及其他费用",
        `1. ${utilityText}`,
        "2. 园区公共能耗、公共设施维护、垃圾清运、物业管理、门禁安防、消防维保等因乙方使用厂房和园区公共资源产生的费用，由乙方按甲方公示、通知或双方书面确认的标准承担。",
        "3. 乙方应按甲方要求及时提供抄表、计量、结算所需资料，不得私接、转供、破坏或绕越水电表计。因乙方原因导致计量失准、损坏或无法抄表的，甲方可按历史平均用量、设备额定功率或合理方式核算费用。",
        "4. 甲方可按乙方要求提供开票服务；乙方需要开具发票的，应提前向甲方提供完整开票资料并配合税务处理，乙方应承担并支付因此产生的相应税金。",
      ],
    },
    {
      sections: [
        "五、用途限制与转租限制",
        "1. 乙方承租厂房仅限用于合法合规的生产、仓储、办公或双方书面确认的用途，不得从事违法建设、违法生产经营、高污染高风险或政府及园区禁止、限制准入的项目。",
        "2. 未经甲方事先书面同意，乙方不得将厂房全部或部分转租、分租、出借、承包、联营、托管、改变实际使用人，亦不得以合作经营、设备租赁、代加工等形式变相转租。",
        "3. 未经甲方书面同意，乙方不得将本厂房作为其他企业注册地址、分公司注册地址或其他经营主体备案地址，不得为第三方挂靠登记、备案或办理场地证明。",
        "4. 乙方确需变更经营主体、经营项目、生产工艺、主要设备、用电容量、仓储品类或实际控制人的，应提前向甲方提交书面申请和相关证照，经甲方确认并按监管要求完成告知、备案或审批后方可实施。",
        "5. 乙方应自行办理并持续保持营业执照、生产经营许可、环保、消防、特种设备、职业健康等依法应取得的资质、许可、备案或验收手续。因乙方手续不全导致停产、处罚、整改或损失的，由乙方自行承担。",
        "6. 未经甲方书面许可，乙方不得储存易燃易爆、危险化学品、危险废物及国家限制物品；确因经营需要依法储存或使用的，应先取得全部审批、备案和安全条件，并经甲方书面确认。",
        "六、维修、保养与日常管理",
        "1. 甲方负责出租厂房主体结构及依法应由出租方维护的公共设施设备的维修；因乙方使用不当、装修施工、设备安装、超负荷使用、擅自改造或第三方原因造成损坏的，由乙方负责修复并承担费用。",
        "2. 乙方负责承租区域内门窗、地坪、墙面、照明、线路、管道、排水、消防器材、生产设备及乙方增设设施的日常维护和安全管理，并保持通道、消防设施、配电设施、排水设施可正常使用。",
        "3. 甲方有权提前通知进入承租区域检查消防、环保、线路、漏水、违建等事项，或为维修、安全巡查、抄表、政府检查、处理相邻关系需要进入承租区域，乙方应予配合。",
        "4. 发生漏水、火情、人员伤害、设备故障、危化品泄漏、行政检查等紧急情况时，甲方可先行采取必要措施进入现场处置，并在事后及时通知乙方。",
      ],
    },
    {
      sections: [
        "七、装修审批与恢复原状",
        "1. 乙方进行装修、隔断、开孔、搭建、设备基础、管线改造、增加用电容量、安装起重或压力等特种设备、改变消防设施或建筑结构的，应事先向甲方提交书面方案、施工单位资质、安全措施和必要审批材料，经甲方书面同意后方可施工。",
        "2. 乙方装修施工不得破坏主体结构、承重构件、消防分区、疏散通道、防火间距、屋面防水、公共管网及相邻租户正常使用。施工期间发生安全事故、环境污染、噪声扰民、财产损坏或行政处罚的，由乙方承担责任。",
        "3. 未经甲方书面同意形成的装修、附属设施、设备基础、管线、隔断、搭建物等，甲方有权要求乙方限期拆除、恢复原状或保留但不予补偿。合同终止或期满交还时，乙方应按甲方要求完成清场、修复和恢复，包括电线、配电箱、地坪、门窗、隔墙、广告牌及其他附着物。",
        "八、消防、环保与安全责任边界",
        "1. 甲方负责园区公共区域和依法应由出租方承担的安全、消防、环保协调管理职责，并按附件安全生产管理协议开展管理。甲方有权委托具备相应专业能力的第三方安全生产管理、消防管理等专业服务机构，协助开展厂区安全生产、消防、环保、职业健康等工作；该委托不免除依法应由甲方承担的责任。",
        "2. 乙方是承租区域内生产经营、安全生产、消防安全、环境保护、职业健康、特种设备、危险作业和员工管理的直接责任主体，应建立并执行相应制度，配备人员和器材，接受并配合甲方、甲方委托的第三方专业服务机构及主管部门的检查、巡查、资料收集、培训、演练、整改复查和政府检查。",
        "3. 乙方不得占用、堵塞、封闭疏散通道、安全出口、消防车通道，不得擅自停用、拆除或遮挡消防设施，不得违规充电、动火、用电或超负荷使用线路，不得在厂房内设置宿舍、住宿或留宿人员。",
        "4. 乙方开展动火、临时用电、高处、吊装、有限空间、检维修、外包施工等危险作业，应依法履行审批、告知、监护和防护义务，并提前向甲方提交需要协调、告知或备案的材料。",
        "5. 对重大事故隐患、严重消防安全隐患，或者乙方拒不整改、逾期整改、整改后仍不符合要求的，甲方有权要求乙方停止相关设备、区域、危险作业或生产经营活动；情节严重或经催告仍拒不整改的，甲方有权单方解除本合同，由此造成乙方停工、停产、搬迁及其他损失由乙方自行承担。",
      ],
    },
    {
      sections: [
        "九、财产损坏、保险与不可抗力",
        "1. 乙方对其人员、设备、物料、产品、车辆、装修及其他财产自行负责保管。除甲方故意或重大过失外，乙方财产毁损、灭失、被盗、停产停业或第三方索赔由乙方自行承担；因乙方及其员工、客户、承包商或供应商造成甲方、其他租户或第三方损失的，乙方负责赔偿。",
        "2. 乙方应自行购买财产保险、公众责任险、安全生产责任险、雇主责任险或其他与经营风险相匹配的必要保险；依法或监管要求必须投保的，应向甲方提供凭证。",
        "3. 因不可抗力或政府征收征用、市政建设、政策调整等非任一方可合理控制的原因导致合同无法继续履行，双方可协商变更或解除，并按实际使用期间结算费用；依法应由责任方承担的除外。",
        "十、提前解除及违约责任",
        `1. 租赁期限内，未经甲方书面同意，乙方不得单方面提前解除合同。乙方确需提前退租的，应至少提前三十日向甲方提出书面申请，经甲方书面同意后方可解除。因乙方原因提前解除的，甲方有权扣除保证金，并要求乙方支付提前解除合同违约金人民币${formatMoney(contract.earlyTerminationPenaltyAmount)}元；不足以弥补甲方损失的，甲方有权继续追偿。`,
        "2. 乙方存在逾期付款、擅自转租、擅自改变用途、违法违规生产经营、重大安全环保隐患拒不整改、破坏房屋结构、严重影响园区管理或其他根本违约情形的，甲方有权解除合同、收回厂房并要求乙方承担违约责任。",
        "3. 因乙方及其相关人员违法经营，或违反安全生产、环保、消防、职业健康、特种设备、危险化学品等规定，导致甲方被行政处罚、罚款、停产整顿、限期整改、行政强制措施、民事赔偿或第三方索赔的，乙方应承担全部责任，并赔偿甲方包括罚款、律师费、诉讼费、停租损失等在内的一切损失。即使主管部门基于出租方或厂中厂管理责任直接处罚甲方，只要相关事项发生于乙方承租区域或与乙方经营有关，甲方仍有权全额追偿；乙方不得以行政文书所列责任主体为甲方或甲方承担法定管理职责为由拒绝。",
        "4. 甲方因自身原因无法继续提供厂房且不属于不可抗力、政府行为或乙方原因的，应退还乙方已支付但未实际使用期间对应的租金，并按法律规定或双方书面约定承担相应责任。",
      ],
    },
    {
      sections: [
        "十一、期满交还、留置物与续租",
        "1. 合同终止、解除或期满后三日内，乙方应搬离人员、设备、物料、产品、垃圾和危险废物，结清全部费用，将厂房及附属设施按交付状态或甲方认可状态交还甲方。厂房交付和退场时，双方可通过交接清单、照片、视频等方式固定厂房状态，作为判断恢复原状及损坏情况的依据。",
        "2. 乙方逾期交还厂房的，应按日向甲方支付相当于年租金千分之五的占用使用费；不足以弥补甲方损失的，乙方仍应赔偿。逾期交还期间发生的水电、公摊、安全环保及第三方责任由乙方承担。",
        "3. 乙方遗留的机器设备、原材料、产品、废料、垃圾或其他物品，经甲方书面通知后仍未处理的，甲方有权依法搬离、保管、仓储或清运；搬运费、人工费、仓储费、保管费、垃圾清运费及其他合理费用由乙方承担。超过七日未领取的，视为乙方放弃所有权，甲方有权自行处置。危险废物、污染物、压力容器、危化品等仍由乙方负责合规处置并承担责任。",
        "十二、争议解决及法院管辖",
        "1. 本合同履行过程中发生争议，双方应先友好协商；协商不成的，任一方可向厂房所在地有管辖权的人民法院提起诉讼。",
        "2. 争议处理期间，除争议事项外，双方仍应继续履行本合同中不受影响的其他条款。守约方为实现债权支出的诉讼费、保全费、担保费、律师费、评估费、鉴定费、执行费等合理费用，由违约方承担。",
      ],
    },
    {
      sections: [
        "十三、其他",
        "1. 本合同未尽事宜，双方可另行签订书面补充协议。补充协议、交付确认、费用通知、整改通知、安全生产管理协议及双方确认的附件，与本合同具有同等法律效力。",
        "2. 本合同一式两份，甲、乙双方各执一份，自双方签字或盖章之日起生效。",
        buildStandardLeaseSignatureText(
          signedDateParts,
          lessorName,
          tenantName,
        ),
      ],
    },
  ];
}

function resolveRuntimePath(type: "assets" | "scripts", ...segments: string[]) {
  const roots =
    type === "assets"
      ? [
          path.resolve(__dirname, "../../assets"),
          path.resolve(process.cwd(), "assets"),
          path.resolve(process.cwd(), "backend/assets"),
        ]
      : [
          path.resolve(__dirname, "../../scripts"),
          path.resolve(process.cwd(), "scripts"),
          path.resolve(process.cwd(), "backend/scripts"),
        ];

  const matched = roots
    .map((root) => path.resolve(root, ...segments))
    .find((candidate) => existsSync(candidate));

  if (!matched) {
    throw new Error(`模板资源不存在：${type}/${segments.join("/")}`);
  }

  return matched;
}

function clearArea(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number,
  padding = 2,
) {
  page.drawRectangle({
    x: x - padding,
    y: page.getHeight() - top - height - padding,
    width: width + padding * 2,
    height: height + padding * 2,
    color: rgb(1, 1, 1),
  });
}

function renderTextOverlays(
  fontPath: string,
  overlays: TemplateOverlay[],
): RasterizedOverlay[] {
  if (overlays.length === 0) {
    return [];
  }

  const scriptPath = resolveRuntimePath("scripts", RENDER_SCRIPT);
  const result = spawnSync("python3", [scriptPath], {
    input: JSON.stringify({
      fontPath,
      overlays: overlays.map((overlay) => ({
        id: overlay.id,
        text: overlay.text,
        fontPath,
        fontSize: overlay.fontSize ?? 14,
        fontIndex: overlay.fontIndex ?? SONGTI_SC_REGULAR_INDEX,
        rasterScale: RASTER_SCALE,
        maxWidth: overlay.maxWidth ?? null,
        lineHeight:
          overlay.lineHeight ?? Math.ceil((overlay.fontSize ?? 14) * 1.4),
        maxLines: overlay.maxLines ?? 99,
        align: overlay.align ?? "left",
        tabStops: overlay.tabStops ?? [],
        paddingX: overlay.paddingX ?? 0,
        paddingY: overlay.paddingY ?? 0,
      })),
    }),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "合同模板文字渲染失败");
  }

  const parsed = JSON.parse(result.stdout) as {
    items: Array<{
      id: string;
      width: number;
      height: number;
      pixelWidth: number;
      pixelHeight: number;
      pngBase64: string;
    }>;
  };

  return parsed.items.map((item) => ({
    id: item.id,
    width: item.width,
    height: item.height,
    png: Buffer.from(item.pngBase64, "base64"),
  }));
}

async function drawRasterOverlay(
  pdf: PDFDocument,
  page: PDFPage,
  overlay: TemplateOverlay,
  raster: RasterizedOverlay,
) {
  clearArea(
    page,
    overlay.x,
    overlay.top,
    overlay.clearWidth,
    overlay.clearHeight,
    overlay.padding ?? 2,
  );
  const image = await pdf.embedPng(raster.png);
  page.drawImage(image, {
    x: overlay.x,
    y: page.getHeight() - overlay.top - raster.height,
    width: raster.width,
    height: raster.height,
  });
}

export function buildGeneratedContractFilename(
  contract: Contract,
  unit: FactoryUnit,
) {
  const safeTenant =
    contract.tenantName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "乙方";
  return `${GENERATED_CONTRACT_PREFIX}${unit.code}_${safeTenant}_${contract.startDate}_${contract.endDate}.pdf`;
}

export function buildGeneratedContractVirtualFileId(contractId: string) {
  return `${GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX}${contractId}`;
}

export function parseGeneratedContractVirtualFileId(fileId: string) {
  if (!fileId.startsWith(GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX)) {
    return null;
  }

  return fileId.slice(GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX.length) || null;
}

export function buildContractDocumentOverlays({
  contract,
  unit,
}: ContractDocumentPayload): TemplateOverlay[] {
  const startParts = splitDateParts(contract.startDate);
  const endParts = splitDateParts(contract.endDate);
  const signedDateParts = splitDateParts(contract.signedDate);
  const unitLabel = buildUnitLabel(unit);
  const annualRentUppercase = Number.isFinite(Number(contract.annualRent))
    ? toChineseCurrencyUppercase(contract.annualRent)
    : "【填写】";
  const annualRentText = formatMoney(contract.annualRent);
  const utilityClause = buildUtilityClause(unit.meterConfigs);
  const lessorName = normalizeOptionalText(contract.lessorName);
  const tenantName = normalizeOptionalText(contract.tenantName);
  const lessorContact =
    contract.lessorContactName?.trim() || contract.lessorName?.trim();
  const tenantContact =
    contract.contactName?.trim() || contract.tenantName?.trim();
  const lessorSafetyManager = contract.lessorSafetyManager.trim();
  const tenantSafetyManager = contract.tenantSafetyManager.trim();

  const overlays: TemplateOverlay[] = [
    {
      id: "page1-tenant",
      pageIndex: 0,
      text: tenantName,
      x: 170,
      top: 139,
      clearWidth: 260,
      clearHeight: 22,
      fontSize: 14,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 260,
    },
    {
      id: "page1-unit",
      pageIndex: 0,
      text: unitLabel,
      x: 90,
      top: 325,
      clearWidth: 320,
      clearHeight: 22,
      fontSize: 13,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 320,
    },
    {
      id: "page1-period",
      pageIndex: 0,
      text: `1、厂房租赁自${formatDateForText(startParts)}起，至${formatDateForText(endParts)}止。`,
      x: 84,
      top: 420,
      clearWidth: 450,
      clearHeight: 22,
      fontSize: 12,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 450,
    },
    {
      id: "page1-rent",
      pageIndex: 0,
      text: `1、甲、乙双方约定，租赁年租金为：${annualRentText}元。大写：${annualRentUppercase}`,
      x: 84,
      top: 607,
      clearWidth: 430,
      clearHeight: 22,
      fontSize: 12,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 430,
    },
    {
      id: "page1-utility",
      pageIndex: 0,
      text: utilityClause,
      x: 60,
      top: 690,
      clearWidth: 480,
      clearHeight: 70,
      fontSize: 12,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 445,
      lineHeight: 18,
      maxLines: 3,
      padding: 4,
      paddingX: 24,
    },
    {
      id: "page4-lessor",
      pageIndex: 3,
      text: lessorName,
      x: 302,
      top: 103,
      clearWidth: 210,
      clearHeight: 22,
      fontSize: 12,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 210,
    },
    {
      id: "page4-tenant",
      pageIndex: 3,
      text: tenantName,
      x: 302,
      top: 146,
      clearWidth: 210,
      clearHeight: 22,
      fontSize: 12,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 210,
    },
    {
      id: "page4-introduction",
      pageIndex: 3,
      text: buildSafetyAgreementIntroduction(signedDateParts),
      x: 78,
      top: 174,
      clearWidth: 460,
      clearHeight: 244,
      fontSize: 13,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 460,
      lineHeight: 28,
      maxLines: 8,
      padding: 2,
    },
    {
      id: "page8-clause-2-7",
      pageIndex: 7,
      text: "2.7 乙方应严格遵守安全生产法律法规和国家标准或行业规范，遵守甲方发布的厂内安全管理制度，并服从甲方及甲方委托的第三方专业服务机构对安全生产、消防、环保等工作的统一协调管理、检查和监督，及时落实提出的隐患整改意见，如实提供相关资料，并及时反馈整改情况。",
      x: 84,
      top: 119,
      clearWidth: 455,
      clearHeight: 69,
      fontSize: 12,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 450,
      lineHeight: 16,
      maxLines: 4,
      padding: 2,
    },
    {
      id: "page10-lessor-contact",
      pageIndex: 9,
      text: `${lessorSafetyManager}同志`,
      x: 178,
      top: 155,
      clearWidth: 72,
      clearHeight: 20,
      fontSize: 11,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 72,
    },
    {
      id: "page10-tenant-contact",
      pageIndex: 9,
      text: `${tenantSafetyManager}同志`,
      x: 301,
      top: 186,
      clearWidth: 72,
      clearHeight: 20,
      fontSize: 11,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 72,
    },
    {
      id: "page10-period",
      pageIndex: 9,
      text: `${formatDateForText(startParts)}至${formatDateForText(endParts)}；有效`,
      x: 230,
      top: 592,
      clearWidth: 240,
      clearHeight: 22,
      fontSize: 10,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 240,
      maxLines: 1,
      padding: 2,
    },
    {
      id: "page10-lessor-signatory",
      pageIndex: 9,
      text: lessorContact,
      x: 238,
      top: 696,
      clearWidth: 78,
      clearHeight: 20,
      fontSize: 10,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 78,
      lineHeight: 15,
      maxLines: 1,
      padding: 1,
    },
    {
      id: "page10-tenant-signatory",
      pageIndex: 9,
      text: tenantContact,
      x: 486,
      top: 696,
      clearWidth: 65,
      clearHeight: 20,
      fontSize: 10,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 65,
      lineHeight: 15,
      maxLines: 1,
      padding: 1,
    },
  ];

  return overlays;
}

function buildStandardLeaseBodyOverlays(
  pages: StandardLeaseContractPage[],
): TemplateOverlay[] {
  return pages.flatMap((page, index) => {
    const pageNumber = index + 1;
    const isFirstPage = index === 0;
    const top = isFirstPage ? 88 : 58;
    const bodyClearHeight = isFirstPage ? 665 : 695;

    const overlays: TemplateOverlay[] = [];
    if (isFirstPage) {
      overlays.push({
        id: `standard-contract-title-${pageNumber}`,
        pageIndex: index,
        text: "厂房租赁合同",
        x: 238,
        top: 42,
        clearWidth: 140,
        clearHeight: 30,
        fontSize: 20,
        fontIndex: SONGTI_SC_REGULAR_INDEX,
        maxWidth: 140,
        lineHeight: 28,
        maxLines: 1,
        padding: 0,
      });
    }

    overlays.push(
      {
        id: `standard-contract-body-${pageNumber}`,
        pageIndex: index,
        text: page.sections.join("\n\n"),
        x: STANDARD_CONTRACT_BODY_X,
        top,
        clearWidth: STANDARD_CONTRACT_BODY_WIDTH,
        clearHeight: bodyClearHeight,
        fontSize: 10,
        fontIndex: SONGTI_SC_REGULAR_INDEX,
        maxWidth: STANDARD_CONTRACT_BODY_WIDTH,
        lineHeight: 15,
        maxLines: isFirstPage ? 43 : 46,
        padding: 0,
        tabStops: [
          STANDARD_CONTRACT_SIGNATURE_TAB_STOP - STANDARD_CONTRACT_BODY_X,
        ],
      },
      {
        id: `standard-contract-footer-${pageNumber}`,
        pageIndex: index,
        text: `第 ${pageNumber} 页`,
        x: 280,
        top: 800,
        clearWidth: 60,
        clearHeight: 16,
        fontSize: 9,
        fontIndex: SONGTI_SC_REGULAR_INDEX,
        maxWidth: 60,
        lineHeight: 13,
        maxLines: 1,
        padding: 0,
      },
    );

    return overlays;
  });
}

function shiftSafetyAgreementOverlays(
  overlays: TemplateOverlay[],
  standardLeasePageCount: number,
): TemplateOverlay[] {
  return overlays
    .filter(
      (overlay) => overlay.pageIndex >= SAFETY_AGREEMENT_TEMPLATE_START_PAGE,
    )
    .map((overlay) => ({
      ...overlay,
      id: `safety-agreement-${overlay.id}`,
      pageIndex:
        overlay.pageIndex -
        SAFETY_AGREEMENT_TEMPLATE_START_PAGE +
        standardLeasePageCount +
        (overlay.pageIndex >= SAFETY_AGREEMENT_CLOSING_TEMPLATE_PAGE ? 1 : 0),
    }));
}

function buildSafetyAgreementSupplementOverlays(
  standardLeasePageCount: number,
): TemplateOverlay[] {
  const pageIndex =
    standardLeasePageCount +
    SAFETY_AGREEMENT_CLOSING_TEMPLATE_PAGE -
    SAFETY_AGREEMENT_TEMPLATE_START_PAGE;

  return [
    {
      id: "safety-agreement-supplement-title",
      pageIndex,
      text: "二、乙方的安全管理职责（续）",
      x: 58,
      top: 52,
      clearWidth: 480,
      clearHeight: 28,
      fontSize: 15,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 480,
      lineHeight: 22,
      maxLines: 1,
      padding: 0,
    },
    {
      id: "safety-agreement-supplement-body",
      pageIndex,
      text: buildSafetyAgreementSupplementSections().join("\n\n"),
      x: 58,
      top: 92,
      clearWidth: 480,
      clearHeight: 680,
      fontSize: 12,
      fontIndex: SONGTI_SC_REGULAR_INDEX,
      maxWidth: 480,
      lineHeight: 20,
      maxLines: 34,
      padding: 0,
    },
  ];
}

export async function buildContractDocumentPdf({
  contract,
  unit,
  generatedDate,
}: ContractDocumentPayload) {
  assertContractDocumentFieldsComplete({ contract, unit, generatedDate });
  const templatePath = resolveRuntimePath("assets", "templates", TEMPLATE_FILE);
  const fontPath = resolveRuntimePath("assets", "fonts", FONT_FILE);
  const templateBytes = await readFile(templatePath);
  const templatePdf = await PDFDocument.load(templateBytes);
  const pdf = await PDFDocument.create();
  const standardLeasePages = buildStandardLeaseContractPages({
    contract,
    unit,
    generatedDate,
  });

  for (let index = 0; index < standardLeasePages.length; index += 1) {
    pdf.addPage([STANDARD_CONTRACT_PAGE_WIDTH, STANDARD_CONTRACT_PAGE_HEIGHT]);
  }

  const safetyLeadingPageIndices = Array.from(
    {
      length:
        SAFETY_AGREEMENT_CLOSING_TEMPLATE_PAGE -
        SAFETY_AGREEMENT_TEMPLATE_START_PAGE,
    },
    (_, index) => SAFETY_AGREEMENT_TEMPLATE_START_PAGE + index,
  );
  const safetyLeadingPages = await pdf.copyPages(
    templatePdf,
    safetyLeadingPageIndices,
  );
  for (const page of safetyLeadingPages) {
    pdf.addPage(page);
  }
  pdf.addPage([STANDARD_CONTRACT_PAGE_WIDTH, STANDARD_CONTRACT_PAGE_HEIGHT]);
  const [safetyClosingPage] = await pdf.copyPages(templatePdf, [
    SAFETY_AGREEMENT_CLOSING_TEMPLATE_PAGE,
  ]);
  pdf.addPage(safetyClosingPage);

  const pages = pdf.getPages();
  const overlays = [
    ...buildStandardLeaseBodyOverlays(standardLeasePages),
    ...shiftSafetyAgreementOverlays(
      buildContractDocumentOverlays({ contract, unit, generatedDate }),
      standardLeasePages.length,
    ),
    ...buildSafetyAgreementSupplementOverlays(standardLeasePages.length),
  ];

  const rasterized = renderTextOverlays(fontPath, overlays);
  const rasterMap = new Map(rasterized.map((item) => [item.id, item]));

  for (const overlay of overlays) {
    const raster = rasterMap.get(overlay.id);
    if (!raster) {
      continue;
    }
    await drawRasterOverlay(pdf, pages[overlay.pageIndex], overlay, raster);
  }

  return Buffer.from(await pdf.save());
}
