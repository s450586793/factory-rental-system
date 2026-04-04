import { Contract } from "./contract.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { UtilityMeterConfig } from "../utilities/utility-meter-config.entity";
import { toChineseCurrencyUppercase } from "../common/format/chinese-currency";

export const GENERATED_CONTRACT_PREFIX = "自动生成厂房租赁合同_";
export const GENERATED_CONTRACT_VIRTUAL_FILE_PREFIX = "contract-document--";
const LESSOR_NAME = "吴孝斌";
const LESSOR_COMPANY = "吴孝斌";
const FACTORY_ADDRESS = "江阴市澄江街道澄山路265号";

type ContractDocumentPayload = {
  contract: Contract;
  unit: FactoryUnit & { meterConfigs: UtilityMeterConfig[] };
  generatedDate: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitDateParts(value: string) {
  const [year = "", month = "", day = ""] = value.split("-");
  return {
    year,
    month: String(Number(month || 0) || ""),
    day: String(Number(day || 0) || ""),
  };
}

function formatArea(area: number | null) {
  if (area === null || area === undefined || Number.isNaN(area)) {
    return "未填写";
  }
  return `${Number(area).toLocaleString("zh-CN", {
    minimumFractionDigits: Number.isInteger(area) ? 0 : 2,
    maximumFractionDigits: 2,
  })}平方米`;
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildUtilityClause(meters: UtilityMeterConfig[]) {
  const enabled = meters.filter((item) => item.enabled);
  const electricMeters = enabled.filter((item) => item.type === "electric");
  const waterMeters = enabled.filter((item) => item.type === "water");
  const parts: string[] = [];

  if (electricMeters.length === 1) {
    const meter = electricMeters[0];
    parts.push(`电费${formatMoney(meter.unitPrice)}元/度，线损耗按${formatMoney(meter.lineLossPercent)}%计算`);
  } else if (electricMeters.length > 1) {
    parts.push(
      `电费按表计配置执行（${electricMeters
        .map(
          (meter) =>
            `${meter.name}：${formatMoney(meter.unitPrice)}元/度，倍率${formatMoney(meter.multiplier)}，线损${formatMoney(
              meter.lineLossPercent,
            )}%`,
        )
        .join("；")}）`,
    );
  }

  if (waterMeters.length === 1) {
    const meter = waterMeters[0];
    parts.push(`水费${formatMoney(meter.unitPrice)}元/吨`);
  } else if (waterMeters.length > 1) {
    parts.push(
      `水费按表计配置执行（${waterMeters
        .map((meter) => `${meter.name}：${formatMoney(meter.unitPrice)}元/吨`)
        .join("；")}）`,
    );
  }

  if (!parts.length) {
    return "租赁期间，使用该厂房所发生的水、电等费用由乙方承担，具体按甲方现场表计配置和实际结算标准执行。";
  }

  return `租赁期间，使用该厂房所发生的水、电等费用由乙方承担，${parts.join("，")}。`;
}

export function buildGeneratedContractFilename(contract: Contract, unit: FactoryUnit) {
  const safeTenant = contract.tenantName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "乙方";
  return `${GENERATED_CONTRACT_PREFIX}${unit.code}_${safeTenant}_${contract.startDate}_${contract.endDate}.doc`;
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

export function buildContractDocumentHtml({ contract, unit, generatedDate }: ContractDocumentPayload) {
  const startDate = splitDateParts(contract.startDate);
  const endDate = splitDateParts(contract.endDate);
  const signDate = splitDateParts(generatedDate);
  const agreementDate = splitDateParts(generatedDate);
  const areaText = formatArea(unit.area);
  const utilityClause = buildUtilityClause(unit.meterConfigs);
  const annualRentUppercase = toChineseCurrencyUppercase(contract.annualRent);

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>厂房租赁合同</title>
  <style>
    @page { size: A4; margin: 24mm 18mm; }
    body { font-family: "SimSun", "Songti SC", serif; color: #111; font-size: 12pt; line-height: 1.7; }
    h1, h2 { text-align: center; margin: 0; }
    h1 { font-size: 22pt; margin-bottom: 14pt; }
    h2 { font-size: 18pt; margin: 16pt 0 12pt; }
    p { margin: 8pt 0; text-indent: 2em; }
    .plain { text-indent: 0; }
    .meta { margin-bottom: 6pt; }
    .signature-table { width: 100%; border-collapse: collapse; margin-top: 12pt; }
    .signature-table td { width: 50%; padding-top: 30pt; vertical-align: top; }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <h1>厂房租赁合同</h1>
  <p class="plain meta">出租方（甲方）：${escapeHtml(LESSOR_NAME)}</p>
  <p class="plain meta">承租方（乙方）：${escapeHtml(contract.tenantName)}</p>
  <p class="plain meta">统一社会信用代码：${escapeHtml(contract.licenseCode || "未填写")}</p>
  <p class="plain meta">负责人：${escapeHtml(contract.contactName || "未填写")}　　联系电话：${escapeHtml(contract.tenantPhone || "未填写")}</p>

  <p>根据国家有关规定，甲、乙双方在自愿、平等、互利的基础上，就甲方将其合法拥有的厂房出租给乙方使用的有关事宜，双方达成协议并签订合同如下：</p>
  <p>一、厂房情况</p>
  <p>甲方出租给乙方的厂房座落在：${escapeHtml(FACTORY_ADDRESS)}，租赁建筑为：${escapeHtml(unit.location)}（编号 ${escapeHtml(
    unit.code,
  )}，面积 ${escapeHtml(areaText)}）。</p>

  <p>二、厂房租赁期限</p>
  <p>1、厂房租赁自 ${escapeHtml(startDate.year)} 年 ${escapeHtml(startDate.month)} 月 ${escapeHtml(startDate.day)} 日起，至 ${escapeHtml(
    endDate.year,
  )} 年 ${escapeHtml(endDate.month)} 月 ${escapeHtml(endDate.day)} 日止。</p>
  <p>2、租赁期满，甲方有权收回出租厂房，乙方应如期归还；乙方需继续承租的，应于租赁期满前三个月向甲方提出书面要求，经甲方同意后重新签订租赁合同。</p>

  <p>三、租金及押金支付方式</p>
  <p>1、甲、乙双方约定，租赁年租金为：${escapeHtml(formatMoney(contract.annualRent))} 元（大写：${escapeHtml(annualRentUppercase)}）。</p>

  <p>四、其他费用</p>
  <p>1、${escapeHtml(utilityClause)}</p>

  <p>五、厂房使用要求和维修责任</p>
  <p>1、租赁期间，乙方应合理使用并爱护该厂房及其附属设施。因乙方使用不当或不合理使用，致使该厂房及其附属设施损坏或发生故障的，乙方应负责维修。</p>
  <p>2、乙方另需装修或者增设附属设施和设备的，应事先征得甲方书面同意后方可进行。</p>

  <p>六、租赁期间其他有关约定</p>
  <p>1、租赁期间，甲、乙双方都应遵守国家的法律法规，不得利用厂房租赁进行非法活动。</p>
  <p>2、租赁期间，乙方须做好消防、安全、环保工作。</p>
  <p>3、租赁期间，厂房因不可抗力原因或市政动迁造成本合同无法履行的，双方互不承担责任。</p>
  <p>4、租赁期间，乙方可根据经营特点进行装修，但原则上不得破坏原房结构，装修费用由乙方自负，租赁期满后如乙方不再承租，甲方不作补偿。</p>
  <p>5、租赁期间，乙方应及时支付房租及其他应支付的一切费用，如拖欠不付满一个月，甲方有权增收 5% 滞纳金，并有权终止租赁协议。</p>
  <p>6、租赁期满后，甲方如继续出租该房时，乙方享有优先权；如到期后不再出租，乙方应如期搬迁。</p>

  <p>七、其他条款</p>
  <p>1、租赁合同签订后，如企业名称变更，可由甲乙双方签字确认，原租赁合同条款不变，继续执行至合同期满。</p>
  <p>2、本合同未尽事宜，甲、乙双方必须依法共同协商解决。</p>
  <p>3、本合同一式两份，双方各执一份，合同经签字后生效。</p>

  <table class="signature-table">
    <tr>
      <td>甲方：${escapeHtml(LESSOR_NAME)}<br />日期：${escapeHtml(signDate.year)} 年 ${escapeHtml(signDate.month)} 月 ${escapeHtml(signDate.day)} 日</td>
      <td>乙方：${escapeHtml(contract.tenantName)}<br />日期：${escapeHtml(signDate.year)} 年 ${escapeHtml(signDate.month)} 月 ${escapeHtml(signDate.day)} 日</td>
    </tr>
  </table>

  <div class="page-break"></div>

  <h1>入驻厂区企业安全生产管理协议书</h1>
  <p class="plain meta">出租单位（以下简称甲方或出租方）：${escapeHtml(LESSOR_COMPANY)}</p>
  <p class="plain meta">承租单位（以下简称乙方或承租方）：${escapeHtml(contract.tenantName)}</p>
  <p>依据《中华人民共和国安全生产法》《江苏省安全生产条例》《无锡市安全生产条例》等法律、法规和规章，经双方协商，在原租赁合同基础上，签订本安全生产管理协议，作为原合同的补充协议。</p>
  <p>甲方的安全管理职责：</p>
  <p>1、认真执行国家及地方关于安全生产、消防、环保的相关规定，对出租区域内公共安全负有统一协调管理职责。</p>
  <p>2、确保出租的厂房、场所以及设备设施符合国家有关法规要求，具备出租使用的安全生产条件，并依法履行必要的告知义务。</p>
  <p>3、负责厂区公共区域消防安全管理、应急广播、疏散通道、消防设施维护、微型消防站或应急器材室设置等工作。</p>
  <p>4、建立相关方作业管理制度，做好外来施工、设备安装、房屋修缮等作业活动的资质审查、现场监护和安全管理。</p>
  <p>5、每月至少开展一次安全生产全面检查，对承租方存在的安全隐患及时督促整改；发现重大隐患或者拒不整改情形的，及时上报属地管理部门。</p>
  <p>乙方的安全管理职责：</p>
  <p>1、签订租赁协议后及时依法办理或变更生产经营地址，确保证照地址与实际一致，不得超出甲方许可范围经营。</p>
  <p>2、严格遵守安全生产法律法规、国家标准或行业规范，服从甲方对厂区范围内安全工作的统一协调管理和监督。</p>
  <p>3、建立本单位全员安全生产责任制和安全管理规章制度，做好员工三级安全教育培训，严禁堵塞疏散通道、安全出口和消防车通道。</p>
  <p>4、对承租区域和生产经营范围内的安全管理全面负责，及时排查并消除生产安全、消防安全、环保和职业病危害等隐患。</p>
  <p>5、在承租区域内开展动火、临时用电、装修、设备安装等作业前，必须提前告知甲方并接受监督管理。</p>
  <p>其他有关要求：</p>
  <p>1、本协议有效期为 ${escapeHtml(startDate.year)} 年 ${escapeHtml(startDate.month)} 月 ${escapeHtml(startDate.day)} 日至 ${escapeHtml(
    endDate.year,
  )} 年 ${escapeHtml(endDate.month)} 月 ${escapeHtml(endDate.day)} 日；有效期内如租赁合同到期未续签或合同异常终止，则本协议书同时失效。</p>
  <p>2、本协议书一式三份，甲乙双方各执一份，由甲方报所在镇（街道）备案一份，每份具有同等法律效力。</p>
  <p>3、本协议内容与现行法律、法规和规章不符之处，遵照现行法律、法规和规章执行。</p>

  <table class="signature-table">
    <tr>
      <td>甲方单位（公章）：${escapeHtml(LESSOR_COMPANY)}<br />法定代表人（或授权代表）：<br />签订日期：${escapeHtml(
        agreementDate.year,
      )} 年 ${escapeHtml(agreementDate.month)} 月 ${escapeHtml(agreementDate.day)} 日</td>
      <td>乙方单位（公章）：${escapeHtml(contract.tenantName)}<br />法定代表人（或授权代表）：${escapeHtml(
        contract.contactName || "",
      )}<br />签订日期：${escapeHtml(agreementDate.year)} 年 ${escapeHtml(agreementDate.month)} 月 ${escapeHtml(
        agreementDate.day,
      )} 日</td>
    </tr>
  </table>
</body>
</html>`;
}
