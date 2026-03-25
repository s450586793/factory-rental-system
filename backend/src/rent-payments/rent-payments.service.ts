import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Contract } from "../contracts/contract.entity";
import { Receipt, ReceiptSourceType, ReceiptStatus } from "../receipts/receipt.entity";
import { CreateRentPaymentDto, UpdateRentPaymentDto } from "./rent-payments.dto";
import { RentPayment } from "./rent-payment.entity";

@Injectable()
export class RentPaymentsService {
  constructor(
    @InjectRepository(RentPayment)
    private readonly rentPaymentsRepository: Repository<RentPayment>,
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
    @InjectRepository(Receipt)
    private readonly receiptsRepository: Repository<Receipt>,
  ) {}

  list() {
    return this.rentPaymentsRepository.find({
      order: {
        paymentDate: "DESC",
        createdAt: "DESC",
      },
    });
  }

  async findOneOrFail(id: string) {
    const payment = await this.rentPaymentsRepository.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException("房租收费记录不存在");
    }
    return payment;
  }

  create(dto: CreateRentPaymentDto) {
    return this.save(dto);
  }

  update(id: string, dto: UpdateRentPaymentDto) {
    return this.save(dto, id);
  }

  async remove(id: string) {
    await this.findOneOrFail(id);
    await this.ensureNoActiveReceipt(id);
    await this.rentPaymentsRepository.softDelete(id);
    return { success: true };
  }

  private async save(dto: CreateRentPaymentDto | UpdateRentPaymentDto, id?: string) {
    const contract = await this.contractsRepository.findOne({ where: { id: dto.contractId } });
    if (!contract) {
      throw new BadRequestException("合同不存在");
    }

    let payment: RentPayment;
    if (id) {
      payment = await this.findOneOrFail(id);
      await this.ensureNoActiveReceipt(id);
    } else {
      payment = this.rentPaymentsRepository.create();
    }

    payment.contractId = contract.id;
    payment.contract = contract;
    payment.unitId = contract.unitId;
    payment.tenantNameSnapshot = contract.tenantName;
    payment.paymentDate = dto.paymentDate;
    payment.amount = dto.amount;
    payment.method = dto.method.trim();
    payment.note = dto.note?.trim() ?? null;

    return this.rentPaymentsRepository.save(payment);
  }

  private async ensureNoActiveReceipt(sourceId: string) {
    const receipt = await this.receiptsRepository.findOne({
      where: {
        sourceType: ReceiptSourceType.RENT_PAYMENT,
        sourceId,
        status: ReceiptStatus.ACTIVE,
      },
    });

    if (receipt) {
      throw new BadRequestException("该房租记录已经开具收据，不能再修改或删除");
    }
  }
}
