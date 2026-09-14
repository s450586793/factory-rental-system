import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { formatShanghaiDate } from "../common/date/shanghai-date";
import { FilesService } from "../files/files.service";
import { FactoryUnit } from "../units/factory-unit.entity";
import { buildGeneratedContractFilename } from "./contract-document";
import { ContractDocumentJob } from "./contract-document-job.entity";
import { buildDocumentRevision } from "./contract-document-revision";
import {
  ContractPdfRendererService,
  CONTRACT_PDF_RENDER_FAILURE,
  CONTRACT_PDF_RENDER_TIMEOUT,
} from "./contract-pdf-renderer.service";
import { Contract } from "./contract.entity";

export const CONTRACT_DOCUMENT_WAIT_MS = 10_000;

@Injectable()
export class ContractDocumentQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ContractDocumentQueueService.name);
  private running = false;
  private stopped = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly filesService: FilesService,
    private readonly renderer: ContractPdfRendererService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.kick(), 2_000);
    this.timer.unref();
    this.kick();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.renderer.onModuleDestroy();
  }

  async enqueue(
    manager: EntityManager,
    contract: Contract,
    unit: FactoryUnit,
    retry = false,
  ) {
    const repository = manager.getRepository(ContractDocumentJob);
    const revision = buildDocumentRevision(contract, unit);
    const existing = await repository.findOne({
      where: { contractId: contract.id },
      lock: { mode: "pessimistic_write" },
    });
    if (
      existing?.revision === revision &&
      !(retry && existing.status === "failed")
    ) {
      return existing;
    }
    return repository.save(
      repository.create({
        contractId: contract.id,
        revision,
        filename: buildGeneratedContractFilename(contract, unit),
        payload: { contract, unit, generatedDate: formatShanghaiDate() },
        status: "pending",
        attempts: existing?.revision === revision ? existing.attempts : 0,
        error: null,
      }),
    );
  }

  kick() {
    if (this.stopped || this.running) return;
    this.running = true;
    setImmediate(() => {
      void this.drain()
        .catch(() => {
          this.logger.error("合同 PDF 队列暂时不可用，稍后自动恢复");
        })
        .finally(() => {
          this.running = false;
        });
    });
  }

  async status(contractId: string, retry = false) {
    const job = await this.ensureJob(contractId, retry);
    this.kick();
    return this.publicStatus(job);
  }

  async generate(contractId: string) {
    const deadline = Date.now() + CONTRACT_DOCUMENT_WAIT_MS;
    let job = await this.ensureJob(contractId);
    this.kick();
    while (true) {
      if (job.status === "ready") {
        const buffer = await this.filesService.readGeneratedContractDocument(
          contractId,
          job.revision,
        );
        if (buffer)
          return {
            filename: job.filename,
            mimeType: "application/pdf" as const,
            buffer,
          };
      }
      if (job.status === "failed") {
        throw new ServiceUnavailableException({
          statusCode: 503,
          code: "CONTRACT_DOCUMENT_FAILED",
          message: job.error,
          ...this.publicStatus(job),
        });
      }
      if (Date.now() >= deadline) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          code: "CONTRACT_DOCUMENT_PENDING",
          message: "合同 PDF 正在生成，请稍后下载",
          ...this.publicStatus(job),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      job = await this.ensureJob(contractId);
      this.kick();
    }
  }

  private async ensureJob(contractId: string, retry = false) {
    return this.dataSource.transaction(async (manager) => {
      const contract = await manager.getRepository(Contract).findOne({
        where: { id: contractId },
        lock: { mode: "pessimistic_write" },
        loadEagerRelations: false,
      });
      if (!contract) throw new NotFoundException("合同不存在");
      const unit = await manager
        .getRepository(FactoryUnit)
        .findOne({ where: { id: contract.unitId } });
      if (!unit) throw new NotFoundException("厂房不存在");
      const job = await this.enqueue(manager, contract, unit, retry);
      const cached = await this.filesService.readGeneratedContractDocument(
        contractId,
        job.revision,
      );
      if (cached && job.status !== "ready") {
        job.status = "ready";
        job.error = null;
        return manager.getRepository(ContractDocumentJob).save(job);
      }
      if (!cached && job.status === "ready") {
        job.status = "pending";
        return manager.getRepository(ContractDocumentJob).save(job);
      }
      return job;
    });
  }

  private async drain() {
    const repository = this.dataSource.getRepository(ContractDocumentJob);
    if (this.stopped) return;
    // 单实例且 running 阻止重入，此时没有活动渲染；恢复重启或数据库断连留下的领取状态。
    await repository.update(
      { status: "processing" },
      { status: "pending", error: null },
    );
    while (!this.stopped) {
      const job = await repository.findOne({
        where: { status: "pending" },
        order: { updatedAt: "ASC" },
      });
      if (!job) return;
      const claim = await repository.update(
        {
          contractId: job.contractId,
          revision: job.revision,
          status: "pending",
        },
        { status: "processing", attempts: job.attempts + 1, error: null },
      );
      if (!claim.affected) continue;
      try {
        const buffer = await this.renderer.render(job.payload);
        await this.dataSource.transaction(async (manager) => {
          const jobs = manager.getRepository(ContractDocumentJob);
          const current = await jobs.findOne({
            where: { contractId: job.contractId },
            lock: { mode: "pessimistic_write" },
          });
          if (
            !current ||
            current.revision !== job.revision ||
            current.status !== "processing"
          )
            return;
          // 版本检查、原子文件替换及旧缓存清理共用任务行锁，旧任务不能清理新缓存。
          await this.filesService.saveGeneratedContractDocument(
            job.contractId,
            job.revision,
            buffer,
          );
          current.status = "ready";
          current.error = null;
          await jobs.save(current);
        });
      } catch (error) {
        if (this.stopped) return;
        await repository.update(
          {
            contractId: job.contractId,
            revision: job.revision,
            status: "processing",
          },
          {
            status: "failed",
            error:
              error instanceof Error &&
              error.message === CONTRACT_PDF_RENDER_TIMEOUT
                ? CONTRACT_PDF_RENDER_TIMEOUT
                : CONTRACT_PDF_RENDER_FAILURE,
          },
        );
        this.logger.warn(
          `合同 ${job.contractId} PDF 生成失败，可通过合同详情重试`,
        );
      }
    }
  }

  private publicStatus(job: ContractDocumentJob) {
    return {
      contractId: job.contractId,
      revision: job.revision,
      status: job.status,
      attempts: job.attempts,
      error: job.error,
      updatedAt: job.updatedAt,
    };
  }
}
