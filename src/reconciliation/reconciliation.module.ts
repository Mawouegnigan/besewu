import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashClosure } from './entities/cash-closure.entity';
import { Deposit } from './entities/deposit.entity';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([CashClosure, Deposit]), TransactionsModule, AuditModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}
